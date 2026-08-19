use std::path::Path;

use tauri::{AppHandle, Manager, State};
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
pub fn set_mods_folder(
    app: AppHandle,
    state: State<AppState>,
    path: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_setting("mods_folder", &path)
        .map_err(|e| e.to_string())?;
    // Right away, not on the next launch: a mod imported in this same session would otherwise
    // show a blank card until the app restarted.
    allow_mods_folder_assets(&app, &path);
    Ok(())
}

/// Lets the webview read images out of the mods folder.
///
/// A mod brought in from outside the app has no remote preview to fetch — its card art is a file
/// sitting inside its own folder. The asset protocol is how a local file becomes something an
/// `<img>` can point at, and its scope has to be granted explicitly.
///
/// Granted at runtime rather than in `tauri.conf.json` because the folder is the user's choice,
/// made at first run and changeable afterwards — there is no path to write into a static config.
/// Scoped to that one directory tree, so it stays a permission to read the mods the app already
/// manages rather than a general licence over the disk.
pub fn allow_mods_folder_assets(app: &AppHandle, folder: &str) {
    if let Err(e) = app
        .asset_protocol_scope()
        .allow_directory(Path::new(folder), true)
    {
        // Worth saying, not worth refusing to start over: every GameBanana mod's art comes from
        // the network and is unaffected. Only bundled previews fall back to the placeholder.
        eprintln!("could not grant asset access to the mods folder: {e}");
    }
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
