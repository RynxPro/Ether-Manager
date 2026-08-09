use std::collections::HashMap;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use futures_util::{stream, StreamExt};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::db::UpdateCheck;
use crate::gamebanana::GbFile;
use crate::updates::{compare_installed_file, UpdateOutcome, UpdateStatus};
use crate::AppState;

/// Skip a mod's automatic (non-forced) check if it was checked more recently than this — keeps
/// repeated app launches from re-hitting GameBanana for every tracked mod every time. The
/// manual "Check for updates" button passes `force: true` and ignores this entirely.
const UPDATE_CHECK_FRESHNESS: Duration = Duration::from_secs(60 * 60);

/// How many mods to check concurrently — bounded because GameBanana's CDN is known to
/// throttle under sustained load (see project memory `gamebanana-api-v11`).
const CHECK_CONCURRENCY: usize = 4;

const CHECK_PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(150);

#[derive(Clone, Serialize)]
pub struct UpdateCheckProgress {
    pub done: usize,
    pub total: usize,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock is before unix epoch")
        .as_secs() as i64
}

fn require_existing_folder(path: &std::path::Path) -> Result<(), String> {
    if path.exists() {
        Ok(())
    } else {
        Err(format!(
            "mod folder {} no longer exists on disk — it may have been renamed or moved outside Ether Manager",
            path.display()
        ))
    }
}

fn unavailable_outcome() -> UpdateOutcome {
    UpdateOutcome {
        status: UpdateStatus::Unavailable,
        reason: None,
        suggested_file_id: None,
        suggested_file_name: None,
        is_ambiguous: false,
    }
}

/// Re-checks one mod against GameBanana right now, regardless of how recently it was last
/// checked, and returns the refreshed cached result.
#[tauri::command]
pub async fn check_mod_update(
    state: State<'_, AppState>,
    mod_id: i64,
) -> Result<UpdateCheck, String> {
    let (gamebanana_mod_id, installed_file_id, installed_md5) = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let m = db
            .get_mod(mod_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("mod {mod_id} not found"))?;
        (
            m.gamebanana_mod_id
                .ok_or_else(|| format!("mod {mod_id} was not installed from GameBanana"))?,
            m.gamebanana_file_id
                .ok_or_else(|| format!("mod {mod_id} has no tracked GameBanana file"))?,
            m.gamebanana_md5,
        )
    };

    let files_result = state.gamebanana.get_mod_files(gamebanana_mod_id).await;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    match files_result {
        Ok(files) => {
            let outcome =
                compare_installed_file(installed_file_id, installed_md5.as_deref(), &files);
            db.upsert_update_check(mod_id, &outcome, None)
                .map_err(|e| e.to_string())?;
        }
        Err(e) => {
            db.upsert_update_check(mod_id, &unavailable_outcome(), Some(&e.to_string()))
                .map_err(|e| e.to_string())?;
        }
    }

    db.list_update_checks()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|c| c.mod_id == mod_id)
        .ok_or_else(|| format!("update check for mod {mod_id} vanished after being recorded"))
}

struct Candidate {
    mod_id: i64,
    gamebanana_mod_id: i64,
    installed_file_id: i64,
    installed_md5: Option<String>,
}

/// Reads GameBanana-installed mods and filters out ones checked too recently (unless `force`).
/// A mod that's missing a tracked GameBanana file id gets an explicit `Unavailable` row with an
/// explanatory error recorded right away — matching `check_mod_update`'s single-mod behavior —
/// rather than being silently dropped from the sweep with no trace of why it has no badge.
fn build_candidates(db: &crate::db::Db, force: bool) -> Result<Vec<Candidate>, String> {
    let mods = db.list_gamebanana_mods().map_err(|e| e.to_string())?;

    let recently_checked_mod_ids: std::collections::HashSet<i64> = if force {
        std::collections::HashSet::new()
    } else {
        let cutoff = now() - UPDATE_CHECK_FRESHNESS.as_secs() as i64;
        db.list_update_checks()
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter(|c| c.checked_at >= cutoff)
            .map(|c| c.mod_id)
            .collect()
    };

    let mut candidates = Vec::new();
    for m in mods {
        if recently_checked_mod_ids.contains(&m.id) {
            continue;
        }
        let gamebanana_mod_id = m
            .gamebanana_mod_id
            .expect("list_gamebanana_mods only returns mods with a gamebanana_mod_id");
        match m.gamebanana_file_id {
            Some(installed_file_id) => candidates.push(Candidate {
                mod_id: m.id,
                gamebanana_mod_id,
                installed_file_id,
                installed_md5: m.gamebanana_md5,
            }),
            None => {
                let message = format!("mod {} has no tracked GameBanana file", m.id);
                db.upsert_update_check(m.id, &unavailable_outcome(), Some(&message))
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(candidates)
}

/// Fetches every distinct GameBanana mod's current file list with bounded concurrency,
/// emitting throttled progress events as results come back.
async fn fetch_all_files(
    gamebanana: &crate::gamebanana::GameBananaClient,
    gb_mod_ids: Vec<i64>,
    app: &AppHandle,
) -> HashMap<i64, Result<Vec<GbFile>, String>> {
    let total = gb_mod_ids.len();
    let mut fetch_stream = stream::iter(gb_mod_ids)
        .map(|gb_mod_id| async move {
            let result = gamebanana
                .get_mod_files(gb_mod_id)
                .await
                .map_err(|e| e.to_string());
            (gb_mod_id, result)
        })
        .buffer_unordered(CHECK_CONCURRENCY);

    let mut fetched = HashMap::new();
    let mut done = 0usize;
    let mut last_emit = Instant::now() - CHECK_PROGRESS_EMIT_INTERVAL;
    while let Some((gb_mod_id, result)) = fetch_stream.next().await {
        fetched.insert(gb_mod_id, result);
        done += 1;
        if done == total || last_emit.elapsed() >= CHECK_PROGRESS_EMIT_INTERVAL {
            last_emit = Instant::now();
            if app
                .emit("update-check-progress", UpdateCheckProgress { done, total })
                .is_err()
            {
                eprintln!("failed to emit update-check-progress ({done}/{total})");
            }
        }
    }
    fetched
}

/// Records a comparison outcome (or fetch failure) for every candidate row, keyed back from
/// the deduped per-GameBanana-mod fetch results to each installed row that needed it.
fn record_results(
    db: &crate::db::Db,
    candidates_by_gb_mod: HashMap<i64, Vec<Candidate>>,
    fetched: &HashMap<i64, Result<Vec<GbFile>, String>>,
) -> Result<(), String> {
    for (gb_mod_id, rows) in candidates_by_gb_mod {
        let result = fetched
            .get(&gb_mod_id)
            .expect("every gamebanana_mod_id in candidates_by_gb_mod was fetched above");
        for row in rows {
            match result {
                Ok(files) => {
                    let outcome = compare_installed_file(
                        row.installed_file_id,
                        row.installed_md5.as_deref(),
                        files,
                    );
                    db.upsert_update_check(row.mod_id, &outcome, None)
                        .map_err(|e| e.to_string())?;
                }
                Err(message) => {
                    db.upsert_update_check(row.mod_id, &unavailable_outcome(), Some(message))
                        .map_err(|e| e.to_string())?;
                }
            }
        }
    }
    Ok(())
}

/// Checks every GameBanana-installed mod. `force: false` (the automatic launch check) skips
/// mods checked within `UPDATE_CHECK_FRESHNESS`; `force: true` (the manual button) checks all
/// of them regardless. The same GameBanana mod can be installed for more than one character —
/// each has its own row/installed-file-id, but its file list only needs fetching once, so
/// network calls are deduped by `gamebanana_mod_id` before the bounded-concurrency fetch.
#[tauri::command]
pub async fn check_all_mod_updates(
    app: AppHandle,
    state: State<'_, AppState>,
    force: bool,
) -> Result<Vec<UpdateCheck>, String> {
    let candidates = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        build_candidates(&db, force)?
    };

    let mut candidates_by_gb_mod: HashMap<i64, Vec<Candidate>> = HashMap::new();
    for candidate in candidates {
        candidates_by_gb_mod
            .entry(candidate.gamebanana_mod_id)
            .or_default()
            .push(candidate);
    }
    let unique_gb_mod_ids: Vec<i64> = candidates_by_gb_mod.keys().copied().collect();

    let fetched = fetch_all_files(&state.gamebanana, unique_gb_mod_ids, &app).await;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    record_results(&db, candidates_by_gb_mod, &fetched)?;
    db.list_update_checks().map_err(|e| e.to_string())
}

/// Cache read only — never touches the network. Used by the Library UI to render badges
/// without triggering a check itself.
#[tauri::command]
pub fn list_update_checks(state: State<AppState>) -> Result<Vec<UpdateCheck>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_update_checks().map_err(|e| e.to_string())
}

/// Downloads `gamebanana_file_id` and swaps it into `current_dir` in place via
/// `fs_ops::replace_mod_folder`. Kept free of `State`/`Db` so it's directly unit-testable
/// against the live API, mirroring `commands::gamebanana::download_and_extract_gamebanana_file`.
/// The staging directory is created as a sibling of `current_dir` (never under `%TEMP%`) so the
/// final swap is a same-volume rename, not a slow cross-volume copy; it and the downloaded
/// archive are cleaned up on every exit path, success or failure.
async fn download_and_swap_gamebanana_file(
    gamebanana: &crate::gamebanana::GameBananaClient,
    current_dir: &std::path::Path,
    gamebanana_mod_id: i64,
    gamebanana_file_id: i64,
    on_progress: impl FnMut(u64, Option<u64>) -> bool,
) -> Result<GbFile, String> {
    let detail = gamebanana
        .get_mod_detail(gamebanana_mod_id)
        .await
        .map_err(|e| e.to_string())?;
    let file = detail
        .files
        .into_iter()
        .find(|f| f.id == gamebanana_file_id)
        .ok_or_else(|| format!("file {gamebanana_file_id} not found on mod {gamebanana_mod_id}"))?;

    let parent = current_dir.parent().ok_or_else(|| {
        format!(
            "mod folder {} has no parent directory",
            current_dir.display()
        )
    })?;
    let leaf = current_dir
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("mod folder {} has an invalid name", current_dir.display()))?;
    // Suffixed with `unique_temp_id()` (not just `leaf`) so two concurrent update calls
    // targeting the same mod folder — e.g. a double-click before the UI disables the trigger
    // — can't both extract into the same staging directory and interleave their contents.
    let staging_dir = parent.join(format!(
        ".ether-staging-{}-{leaf}",
        crate::commands::unique_temp_id()
    ));

    let temp_download_path = std::env::temp_dir().join(format!(
        "ether-manager-gb-update-{}-{}-{}",
        gamebanana_file_id,
        crate::commands::unique_temp_id(),
        file.file_name
    ));

    let result = async {
        gamebanana
            .download_file(&file.download_url, &temp_download_path, on_progress)
            .await
            .map_err(|e| e.to_string())?;
        crate::archive::extract_archive(&temp_download_path, &staging_dir)
            .map_err(|e| e.to_string())?;
        crate::fs_ops::replace_mod_folder(current_dir, &staging_dir).map_err(|e| e.to_string())
    }
    .await;
    let _ = std::fs::remove_file(&temp_download_path);
    let _ = std::fs::remove_dir_all(&staging_dir);
    result?;

    Ok(file)
}

/// Updates one installed mod in place. `folder_path`, `enabled` (including any `DISABLED_`
/// prefix), `display_name`, `character_id`, and `slot` are all left untouched — only the
/// folder's on-disk contents and the row's tracked `gamebanana_file_id`/`gamebanana_md5`
/// change. Reuses the exact same `gamebanana-install-progress` event and `install_cancel` slot
/// as `install_from_gamebanana`; the two are never run concurrently from the UI.
#[tauri::command]
pub async fn update_installed_mod(
    app: AppHandle,
    state: State<'_, AppState>,
    mod_id: i64,
    gamebanana_file_id: i64,
) -> Result<crate::db::Mod, String> {
    let existing = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_mod(mod_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("mod {mod_id} not found"))?
    };
    let gamebanana_mod_id = existing
        .gamebanana_mod_id
        .ok_or_else(|| format!("mod {mod_id} was not installed from GameBanana"))?;

    let current_dir = std::path::PathBuf::from(&existing.folder_path);
    require_existing_folder(&current_dir)?;

    let cancel_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    {
        let mut guard = state.install_cancel.lock().map_err(|e| e.to_string())?;
        *guard = Some(cancel_flag.clone());
    }

    let mut last_emit = Instant::now() - crate::commands::gamebanana::PROGRESS_EMIT_INTERVAL;
    let on_progress = move |downloaded: u64, total: Option<u64>| {
        if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
            return true;
        }
        if last_emit.elapsed() >= crate::commands::gamebanana::PROGRESS_EMIT_INTERVAL {
            last_emit = Instant::now();
            let _ = app.emit(
                "gamebanana-install-progress",
                crate::commands::gamebanana::InstallProgress { downloaded, total },
            );
        }
        false
    };

    let update_result = download_and_swap_gamebanana_file(
        &state.gamebanana,
        &current_dir,
        gamebanana_mod_id,
        gamebanana_file_id,
        on_progress,
    )
    .await;

    {
        let mut guard = state.install_cancel.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }
    let file = update_result?;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_gamebanana_file(mod_id, file.id, &file.md5_checksum)
        .map_err(|e| e.to_string())?;
    let up_to_date = UpdateOutcome {
        status: UpdateStatus::UpToDate,
        reason: None,
        suggested_file_id: None,
        suggested_file_name: None,
        is_ambiguous: false,
    };
    db.upsert_update_check(mod_id, &up_to_date, None)
        .map_err(|e| e.to_string())?;
    db.get_mod(mod_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("mod {mod_id} vanished immediately after being updated"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{Db, NewMod, Slot};
    use crate::gamebanana::GameBananaClient;

    /// "Compact Damage Numbers" — the same real, small ZZZ mod used as the Milestone 2
    /// install fixture (see `commands::gamebanana::tests`), kept fast and deterministic.
    const SAMPLE_MOD_ID: i64 = 645291;
    const SAMPLE_FILE_ID: i64 = 1776071;

    fn insert_fixture_mod(db: &Db, gamebanana_file_id: i64, gamebanana_md5: Option<&str>) -> i64 {
        db.insert_mod(NewMod {
            character_id: "belle".to_string(),
            slot: Slot::CharacterSkin,
            display_name: "Compact Damage Numbers".to_string(),
            folder_path: "Characters/belle/Character Skin/CompactDamageNumbers".to_string(),
            thumbnail_path: None,
            gamebanana_mod_id: Some(SAMPLE_MOD_ID),
            gamebanana_file_id: Some(gamebanana_file_id),
            gamebanana_md5: gamebanana_md5.map(str::to_string),
        })
        .unwrap()
        .id
    }

    /// Core logic shared by the command, exercised directly (no Tauri `State`/`AppHandle`
    /// needed) so this is a plain unit test rather than an integration one.
    async fn run_check(
        db: &Db,
        gamebanana: &GameBananaClient,
        mod_id: i64,
        gamebanana_mod_id: i64,
        installed_file_id: i64,
        installed_md5: Option<&str>,
    ) -> UpdateCheck {
        let files_result = gamebanana.get_mod_files(gamebanana_mod_id).await;
        match files_result {
            Ok(files) => {
                let outcome = compare_installed_file(installed_file_id, installed_md5, &files);
                db.upsert_update_check(mod_id, &outcome, None).unwrap();
            }
            Err(e) => {
                db.upsert_update_check(mod_id, &unavailable_outcome(), Some(&e.to_string()))
                    .unwrap();
            }
        }
        db.list_update_checks()
            .unwrap()
            .into_iter()
            .find(|c| c.mod_id == mod_id)
            .unwrap()
    }

    #[tokio::test]
    async fn checking_a_mod_installed_at_its_current_file_reports_up_to_date() {
        let db = Db::open_in_memory().unwrap();
        let gamebanana = GameBananaClient::new();
        let files = gamebanana.get_mod_files(SAMPLE_MOD_ID).await.unwrap();
        let current = files.iter().find(|f| f.id == SAMPLE_FILE_ID).unwrap();
        let mod_id = insert_fixture_mod(&db, SAMPLE_FILE_ID, Some(&current.md5_checksum));

        let check = run_check(
            &db,
            &gamebanana,
            mod_id,
            SAMPLE_MOD_ID,
            SAMPLE_FILE_ID,
            Some(&current.md5_checksum),
        )
        .await;

        assert_eq!(check.status, UpdateStatus::UpToDate);
        assert!(check.error.is_none());
    }

    #[tokio::test]
    async fn checking_a_mod_with_a_bogus_installed_file_id_suggests_a_real_replacement() {
        let db = Db::open_in_memory().unwrap();
        let gamebanana = GameBananaClient::new();
        let bogus_file_id = -1;
        let mod_id = insert_fixture_mod(&db, bogus_file_id, Some("stale-md5"));

        let check = run_check(
            &db,
            &gamebanana,
            mod_id,
            SAMPLE_MOD_ID,
            bogus_file_id,
            Some("stale-md5"),
        )
        .await;

        assert_eq!(check.status, UpdateStatus::UpdateAvailable);
        assert!(check.suggested_file_id.is_some());
        assert!(check.error.is_none());
    }

    #[test]
    fn build_candidates_records_unavailable_for_a_mod_missing_a_tracked_file_id() {
        let db = Db::open_in_memory().unwrap();
        let mod_id = db
            .insert_mod(NewMod {
                character_id: "belle".to_string(),
                slot: Slot::CharacterSkin,
                display_name: "No File Id Yet".to_string(),
                folder_path: "Characters/belle/Character Skin/NoFileIdYet".to_string(),
                thumbnail_path: None,
                gamebanana_mod_id: Some(SAMPLE_MOD_ID),
                gamebanana_file_id: None,
                gamebanana_md5: None,
            })
            .unwrap()
            .id;

        let candidates = build_candidates(&db, true).unwrap();

        assert!(
            candidates.is_empty(),
            "a mod with no tracked file id must not become a fetch candidate"
        );
        let check = db
            .list_update_checks()
            .unwrap()
            .into_iter()
            .find(|c| c.mod_id == mod_id)
            .expect("an Unavailable row must be recorded instead of silently dropping the mod");
        assert_eq!(check.status, UpdateStatus::Unavailable);
        assert!(check.error.is_some());
    }

    #[test]
    fn require_existing_folder_errors_when_the_folder_is_missing() {
        let missing =
            std::env::temp_dir().join("ether-manager-definitely-does-not-exist-folder-xyz");
        assert!(require_existing_folder(&missing).is_err());
    }

    #[tokio::test]
    async fn updates_an_installed_mod_in_place_preserving_folder_path_and_contents_swap() {
        let gamebanana = GameBananaClient::new();
        let mods_root =
            std::env::temp_dir().join(format!("ether-manager-update-test-{}", std::process::id()));
        let current_dir = mods_root
            .join("Characters")
            .join("belle")
            .join("Character Skin")
            .join("CompactDamageNumbers");
        std::fs::create_dir_all(&current_dir).unwrap();
        std::fs::write(current_dir.join("placeholder.txt"), "old content").unwrap();

        let file = download_and_swap_gamebanana_file(
            &gamebanana,
            &current_dir,
            SAMPLE_MOD_ID,
            SAMPLE_FILE_ID,
            |_, _| false,
        )
        .await
        .unwrap();

        assert_eq!(file.id, SAMPLE_FILE_ID);
        assert!(
            current_dir.is_dir(),
            "folder must still exist at the same path"
        );
        assert!(
            current_dir.read_dir().unwrap().next().is_some(),
            "updated folder must not be empty"
        );
        assert!(
            !current_dir.join("placeholder.txt").exists(),
            "old content must have been replaced by the swap"
        );

        let slot_dir = current_dir.parent().unwrap();
        let leftover_staging_or_backup = slot_dir.read_dir().unwrap().any(|entry| {
            let name = entry.unwrap().file_name();
            let name = name.to_string_lossy();
            name.starts_with(".ether-staging-") || name.starts_with(".ether-backup-")
        });
        assert!(
            !leftover_staging_or_backup,
            "no staging or backup directories should remain after a successful update"
        );

        std::fs::remove_dir_all(&mods_root).unwrap();
    }

    #[tokio::test]
    async fn updating_a_disabled_mod_preserves_its_disabled_prefixed_folder_name() {
        let gamebanana = GameBananaClient::new();
        let mods_root = std::env::temp_dir().join(format!(
            "ether-manager-update-disabled-test-{}",
            std::process::id()
        ));
        let current_dir = mods_root
            .join("Characters")
            .join("belle")
            .join("Character Skin")
            .join("DISABLED_CompactDamageNumbers");
        std::fs::create_dir_all(&current_dir).unwrap();

        download_and_swap_gamebanana_file(
            &gamebanana,
            &current_dir,
            SAMPLE_MOD_ID,
            SAMPLE_FILE_ID,
            |_, _| false,
        )
        .await
        .unwrap();

        assert!(current_dir.is_dir());
        assert_eq!(
            current_dir.file_name().unwrap().to_str().unwrap(),
            "DISABLED_CompactDamageNumbers"
        );

        std::fs::remove_dir_all(&mods_root).unwrap();
    }

    #[tokio::test]
    async fn checking_a_mod_pointed_at_a_nonexistent_gamebanana_mod_records_unavailable_with_a_message(
    ) {
        let db = Db::open_in_memory().unwrap();
        let gamebanana = GameBananaClient::new();
        let nonexistent_gb_mod_id = 999_999_999;
        let mod_id = insert_fixture_mod(&db, 1, Some("md5"));

        let check = run_check(
            &db,
            &gamebanana,
            mod_id,
            nonexistent_gb_mod_id,
            1,
            Some("md5"),
        )
        .await;

        assert_eq!(check.status, UpdateStatus::Unavailable);
        assert!(check.error.is_some());
    }
}
