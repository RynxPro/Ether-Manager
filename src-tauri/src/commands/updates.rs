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
            slot: Slot::Outfit,
            display_name: "Compact Damage Numbers".to_string(),
            folder_path: "Characters/belle/Outfit/CompactDamageNumbers".to_string(),
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
                slot: Slot::Outfit,
                display_name: "No File Id Yet".to_string(),
                folder_path: "Characters/belle/Outfit/NoFileIdYet".to_string(),
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
