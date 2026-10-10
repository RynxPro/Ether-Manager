use crate::db::Preset;
use crate::fs_ops;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// One mod that would not do as it was told.
///
/// Named rather than numbered: the user is being told something did not work, and a mod id is
/// not a thing they have ever seen. The error string is the one `fs_ops` produced, because a
/// locked folder and a missing folder want different responses from them.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresetApplyFailure {
    pub mod_id: i64,
    pub display_name: String,
    pub error: String,
}

/// What applying a preset actually did.
///
/// Counts of what moved, not of what the preset holds: a preset of six mods applied when five
/// of them were already on reports one enabled, because one is what changed. Everything that
/// refused is listed individually.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresetApplyReport {
    pub enabled: i64,
    pub disabled: i64,
    pub failures: Vec<PresetApplyFailure>,
}

#[tauri::command]
pub fn list_presets(state: State<AppState>) -> Result<Vec<Preset>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_presets().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_preset(
    state: State<AppState>,
    name: String,
    mod_ids: Vec<i64>,
) -> Result<Vec<Preset>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_preset(&name, &mod_ids, now())
        .map_err(|e| e.to_string())?;
    db.list_presets().map_err(|e| e.to_string())
}

/// Saves what is switched on right now as a new preset.
///
/// Reads the disk rather than the database, because whether a mod is on is not a column — it
/// is which spelling of its folder exists. See `fs_ops::Presence`. A mod whose folder has gone
/// missing underneath the app is left out rather than guessed at.
#[tauri::command]
pub fn save_preset_from_current(
    state: State<AppState>,
    name: String,
) -> Result<Vec<Preset>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let on: Vec<i64> = db
        .list_all_mods()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|m| m.enabled)
        .map(|m| m.id)
        .collect();
    db.create_preset(&name, &on, now())
        .map_err(|e| e.to_string())?;
    db.list_presets().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_preset(
    state: State<AppState>,
    preset_id: i64,
    name: String,
) -> Result<Vec<Preset>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.rename_preset(preset_id, &name, now())
        .map_err(|e| e.to_string())?;
    db.list_presets().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_preset(state: State<AppState>, preset_id: i64) -> Result<Vec<Preset>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_preset(preset_id).map_err(|e| e.to_string())?;
    db.list_presets().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_preset_mods(
    state: State<AppState>,
    preset_id: i64,
    mod_ids: Vec<i64>,
) -> Result<Vec<Preset>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_preset_mods(preset_id, &mod_ids, now())
        .map_err(|e| e.to_string())?;
    db.list_presets().map_err(|e| e.to_string())
}

/// Which mods a preset asks for. The editor reads this to tick its boxes.
#[tauri::command]
pub fn preset_mod_ids(state: State<AppState>, preset_id: i64) -> Result<Vec<i64>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.preset_mod_ids(preset_id).map_err(|e| e.to_string())
}

/// Switches the library to what the preset describes.
///
/// A reconciliation over every installed mod, not a list of things to switch on. Mods the
/// preset names go on, everything else goes off — which is what makes a preset a state rather
/// than a diff: applied twice from different starting points it lands in the same place, and
/// it can never leave two skins fighting over one character because one was on from before.
///
/// The whole plan is computed while the database lock is held and the renames happen after it
/// is dropped, exactly as `toggle_mod` does: each rename carries a retry budget because
/// Defender or the running game can hold a folder, and that is not work for the thread drawing
/// the window.
///
/// Every rename is attempted even after one fails. Stopping at the first would leave the
/// library in a state that is neither the old one nor the new one, with no record of where it
/// got to; carrying on means the report describes exactly which mods disobeyed.
#[tauri::command]
pub async fn apply_preset(
    state: State<'_, AppState>,
    preset_id: i64,
) -> Result<PresetApplyReport, String> {
    struct Planned {
        mod_id: i64,
        display_name: String,
        wanted_on: bool,
        rename: Option<(PathBuf, PathBuf)>,
    }

    let planned: Vec<Planned> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let wanted: Vec<i64> = db.preset_mod_ids(preset_id).map_err(|e| e.to_string())?;
        db.list_all_mods()
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|m| {
                let wanted_on = wanted.contains(&m.id);
                // A planning failure is carried rather than thrown: one mod whose folder has
                // vanished must not stop the other thirty being set correctly.
                let rename = fs_ops::plan_mod_enabled(&db, m.id, wanted_on).ok().flatten();
                Planned {
                    mod_id: m.id,
                    display_name: m.display_name,
                    wanted_on,
                    rename,
                }
            })
            .collect()
    };

    tokio::task::spawn_blocking(move || {
        let mut report = PresetApplyReport {
            enabled: 0,
            disabled: 0,
            failures: Vec::new(),
        };

        for item in planned {
            let Some((from, to)) = item.rename else {
                // Nothing to do: already in the spelling the preset wants, or there is no
                // folder to rename. Neither is a change or a failure.
                continue;
            };
            match fs_ops::apply_mod_rename(&from, &to) {
                Ok(()) => {
                    if item.wanted_on {
                        report.enabled += 1;
                    } else {
                        report.disabled += 1;
                    }
                }
                Err(error) => report.failures.push(PresetApplyFailure {
                    mod_id: item.mod_id,
                    display_name: item.display_name,
                    error: error.to_string(),
                }),
            }
        }

        report
    })
    .await
    .map_err(|e| e.to_string())
}
