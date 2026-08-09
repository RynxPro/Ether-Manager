use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::commands::mods::{slugify_display_name, unique_variant_dir};
use crate::db::{Bookmark, Mod, NewBookmark, NewMod, Slot};
use crate::gamebanana::{GameBananaClient, GbFile, GbModDetail, GbSearchResult, ModSort};
use crate::{archive, fs_ops, AppState};

/// How often progress events are emitted at most, so a fast connection delivering many small
/// chunks doesn't flood the IPC channel with an event per chunk. Shared with
/// `commands::updates::update_installed_mod`, which reuses this same throttle and the
/// `InstallProgress` event payload below rather than duplicating either.
pub(crate) const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(150);

#[derive(Clone, Serialize)]
pub struct InstallProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

#[tauri::command]
pub async fn search_gamebanana_mods(
    state: State<'_, AppState>,
    query: Option<String>,
    category_id: Option<i64>,
    sort: ModSort,
    page: u32,
) -> Result<GbSearchResult, String> {
    let visibility_pref = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_mature_content_visibility()
            .map_err(|e| e.to_string())?
    };

    let result = state
        .gamebanana
        .search_mods(query.as_deref(), category_id, sort, page)
        .await
        .map_err(|e| e.to_string())?;

    Ok(crate::content_rating::apply_visibility(
        result,
        visibility_pref,
    ))
}

#[tauri::command]
pub async fn get_gamebanana_mod_detail(
    state: State<'_, AppState>,
    mod_id: i64,
) -> Result<GbModDetail, String> {
    state
        .gamebanana
        .get_mod_detail(mod_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_bookmarks(state: State<AppState>) -> Result<Vec<Bookmark>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_bookmarks().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_bookmark(
    state: State<AppState>,
    gamebanana_mod_id: i64,
    name: String,
    thumbnail_url: Option<String>,
) -> Result<Bookmark, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_bookmark(NewBookmark {
        gamebanana_mod_id,
        name,
        thumbnail_url,
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_bookmark(state: State<AppState>, gamebanana_mod_id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.remove_bookmark(gamebanana_mod_id)
        .map_err(|e| e.to_string())
}

/// What to install and where to file it — bundled into one struct so the function below
/// stays under clippy's argument-count limit.
struct InstallRequest<'a> {
    gamebanana_mod_id: i64,
    gamebanana_file_id: i64,
    character_id: &'a str,
    slot: Slot,
    display_name: &'a str,
}

/// Core install logic, kept free of `State`/`Db` so it's directly unit-testable against the
/// live API without a mock Tauri app. Downloads the given GameBanana file to a process-unique
/// temp path (never straight into `dest_dir`, so a failed/partial download or extraction never
/// leaves a half-installed folder under the character/slot tree) and extracts it in place.
async fn download_and_extract_gamebanana_file(
    gamebanana: &GameBananaClient,
    mods_root: &Path,
    request: InstallRequest<'_>,
    on_progress: impl FnMut(u64, Option<u64>) -> bool,
) -> Result<(PathBuf, GbFile), String> {
    let InstallRequest {
        gamebanana_mod_id,
        gamebanana_file_id,
        character_id,
        slot,
        display_name,
    } = request;

    let detail = gamebanana
        .get_mod_detail(gamebanana_mod_id)
        .await
        .map_err(|e| e.to_string())?;

    let file = detail
        .files
        .into_iter()
        .find(|f| f.id == gamebanana_file_id)
        .ok_or_else(|| format!("file {gamebanana_file_id} not found on mod {gamebanana_mod_id}"))?;

    let slot_dir = fs_ops::ensure_character_slot_dir(mods_root, character_id, slot)
        .map_err(|e| e.to_string())?;
    let base_name = slugify_display_name(display_name);
    let dest_dir = unique_variant_dir(&slot_dir, &base_name);

    let temp_download_path = std::env::temp_dir().join(format!(
        "ether-manager-gb-download-{}-{}-{}",
        gamebanana_file_id,
        crate::commands::unique_temp_id(),
        file.file_name
    ));

    let result = async {
        gamebanana
            .download_file(&file.download_url, &temp_download_path, on_progress)
            .await
            .map_err(|e| e.to_string())?;
        archive::extract_archive(&temp_download_path, &dest_dir).map_err(|e| e.to_string())
    }
    .await;
    let _ = std::fs::remove_file(&temp_download_path);
    result?;

    Ok((dest_dir, file))
}

/// Downloads a specific GameBanana file, extracts it into the given character/slot, and
/// records it as an installed mod — the GameBanana counterpart to `commands::mods::add_mod`.
/// `character_id`/`slot`/`display_name` are assumed already confirmed by the user (the auto
/// slot guess is only ever a suggestion, never applied silently — see the Milestone 2 plan's
/// Assumption 2); this command just executes the install once that confirmation happened.
#[tauri::command]
pub async fn install_from_gamebanana(
    app: AppHandle,
    state: State<'_, AppState>,
    gamebanana_mod_id: i64,
    gamebanana_file_id: i64,
    character_id: String,
    slot: Slot,
    display_name: String,
) -> Result<Mod, String> {
    let mods_folder = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_setting("mods_folder")
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "mods folder is not set yet".to_string())?
    };
    let mods_root = PathBuf::from(mods_folder);

    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut guard = state.install_cancel.lock().map_err(|e| e.to_string())?;
        *guard = Some(cancel_flag.clone());
    }

    let mut last_emit = Instant::now() - PROGRESS_EMIT_INTERVAL;
    let on_progress = move |downloaded: u64, total: Option<u64>| {
        if cancel_flag.load(Ordering::Relaxed) {
            return true;
        }
        if last_emit.elapsed() >= PROGRESS_EMIT_INTERVAL {
            last_emit = Instant::now();
            let _ = app.emit(
                "gamebanana-install-progress",
                InstallProgress { downloaded, total },
            );
        }
        false
    };

    let install_result = download_and_extract_gamebanana_file(
        &state.gamebanana,
        &mods_root,
        InstallRequest {
            gamebanana_mod_id,
            gamebanana_file_id,
            character_id: &character_id,
            slot,
            display_name: &display_name,
        },
        on_progress,
    )
    .await;

    {
        let mut guard = state.install_cancel.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }
    let (dest_dir, file) = install_result?;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.insert_mod(NewMod {
        character_id,
        slot,
        display_name,
        folder_path: dest_dir.to_string_lossy().to_string(),
        thumbnail_path: None,
        gamebanana_mod_id: Some(gamebanana_mod_id),
        gamebanana_file_id: Some(gamebanana_file_id),
        gamebanana_md5: Some(file.md5_checksum),
    })
    .map_err(|e| e.to_string())
}

/// Signals the in-flight `install_from_gamebanana` call (if any) to abort. A no-op if no
/// install is currently running (e.g. the user double-clicks cancel, or it already finished).
#[tauri::command]
pub fn cancel_gamebanana_install(state: State<AppState>) -> Result<(), String> {
    let guard = state.install_cancel.lock().map_err(|e| e.to_string())?;
    if let Some(flag) = guard.as_ref() {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// "Compact Damage Numbers" — a real, small (~178KB) ZZZ mod zip, kept fast for CI.
    const SAMPLE_MOD_ID: i64 = 645291;
    const SAMPLE_FILE_ID: i64 = 1776071;

    #[tokio::test]
    async fn installs_a_real_small_zzz_mod_end_to_end() {
        let gamebanana = GameBananaClient::new();
        let mods_root =
            std::env::temp_dir().join(format!("ether-manager-install-test-{}", std::process::id()));

        let (dest_dir, file) = download_and_extract_gamebanana_file(
            &gamebanana,
            &mods_root,
            InstallRequest {
                gamebanana_mod_id: SAMPLE_MOD_ID,
                gamebanana_file_id: SAMPLE_FILE_ID,
                character_id: "belle",
                slot: Slot::Outfit,
                display_name: "Compact Damage Numbers Test Install",
            },
            |_, _| false,
        )
        .await
        .unwrap();

        assert!(dest_dir.starts_with(mods_root.join("Characters").join("belle").join("Outfit")));
        assert!(dest_dir.exists());
        assert!(
            dest_dir.read_dir().unwrap().next().is_some(),
            "extracted mod folder must not be empty"
        );
        assert_eq!(file.id, SAMPLE_FILE_ID);
        assert!(!file.md5_checksum.is_empty());

        std::fs::remove_dir_all(&mods_root).unwrap();
    }
}
