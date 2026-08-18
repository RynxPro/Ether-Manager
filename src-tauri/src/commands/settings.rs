use std::path::Path;

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::content_rating::MatureVisibility;
use crate::db::MagnifierSettings;
use crate::AppState;

/// Opens a native folder-picker dialog and returns the chosen path, or `None` if the
/// user cancelled. Does not persist anything itself — callers decide whether to follow
/// up with `set_mods_folder`.
#[tauri::command]
pub fn pick_mods_folder(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(|path| path.to_string())
}

#[tauri::command]
pub fn get_mods_folder(state: State<AppState>) -> Result<Option<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_setting("mods_folder").map_err(|e| e.to_string())
}

/// Whether the configured mods folder is actually on disk right now.
///
/// The path is chosen once at first run and never re-checked, so it can go stale with nothing
/// happening inside the app at all — an external drive unplugged, the folder renamed, ZZMI
/// reinstalled somewhere else. Without this, the first sign would be an install failing for
/// reasons that look like the download's fault. The sidebar says so up front instead.
#[tauri::command]
pub fn is_mods_folder_linked(state: State<AppState>) -> Result<bool, String> {
    let folder = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_setting("mods_folder").map_err(|e| e.to_string())?
    };
    // `is_dir` rather than `exists`: a file sitting where the folder used to be is just as
    // broken, and would otherwise report as linked.
    Ok(folder.is_some_and(|path| Path::new(&path).is_dir()))
}

#[tauri::command]
pub fn set_mods_folder(state: State<AppState>, path: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_setting("mods_folder", &path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_mature_content_visibility(state: State<AppState>) -> Result<MatureVisibility, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_mature_content_visibility()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_magnifier_settings(state: State<AppState>) -> Result<MagnifierSettings, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_magnifier_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_magnifier_settings(
    state: State<AppState>,
    value: MagnifierSettings,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_magnifier_settings(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_mature_content_visibility(
    state: State<AppState>,
    value: MatureVisibility,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_mature_content_visibility(value)
        .map_err(|e| e.to_string())
}
