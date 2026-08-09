use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::content_rating::MatureVisibility;
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
pub fn set_mature_content_visibility(
    state: State<AppState>,
    value: MatureVisibility,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_mature_content_visibility(value)
        .map_err(|e| e.to_string())
}
