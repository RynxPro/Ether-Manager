use crate::db::{Mod, Preset};
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

/// One mod that applying a preset would actually move, and which way.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PresetChange {
    pub mod_id: i64,
    pub turn_on: bool,
}

/// What applying this preset would change, and nothing else.
///
/// The whole decision, with no database and no disk in it, so it can be tested: a mod the
/// preset names should be on, every other installed mod should be off, and a mod already in
/// the state it wants is not a change. Separated out because getting the sense of that
/// backwards would switch off exactly the mods the preset exists to switch on, and that is not
/// a mistake worth finding in the running app.
///
/// `Mod::enabled` is read off the disk by `list_all_mods`, so this compares against what the
/// game would actually load rather than against a stored flag.
pub fn plan_preset(wanted: &[i64], mods: &[Mod]) -> Vec<PresetChange> {
    mods.iter()
        .filter_map(|m| {
            let should_be_on = wanted.contains(&m.id);
            (should_be_on != m.enabled).then_some(PresetChange {
                mod_id: m.id,
                turn_on: should_be_on,
            })
        })
        .collect()
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
        rename: (PathBuf, PathBuf),
    }

    // Planning failures are collected rather than thrown. A mod whose folder has gone missing
    // underneath the app cannot be moved, and the user should be told which one — silently
    // skipping it would report a clean apply that did not happen.
    let mut failures: Vec<PresetApplyFailure> = Vec::new();

    let planned: Vec<Planned> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let wanted = db.preset_mod_ids(preset_id).map_err(|e| e.to_string())?;
        let mods = db.list_all_mods().map_err(|e| e.to_string())?;
        let changes = plan_preset(&wanted, &mods);

        let mut planned = Vec::with_capacity(changes.len());
        for change in changes {
            let name = mods
                .iter()
                .find(|m| m.id == change.mod_id)
                .map(|m| m.display_name.clone())
                .unwrap_or_default();
            match fs_ops::plan_mod_enabled(&db, change.mod_id, change.turn_on) {
                // `plan_preset` already dropped everything that needs no move, so a `None`
                // here only means the disk agreed with the preset after all.
                Ok(None) => {}
                Ok(Some(rename)) => planned.push(Planned {
                    mod_id: change.mod_id,
                    display_name: name,
                    wanted_on: change.turn_on,
                    rename,
                }),
                Err(error) => failures.push(PresetApplyFailure {
                    mod_id: change.mod_id,
                    display_name: name,
                    error: error.to_string(),
                }),
            }
        }
        planned
    };

    tokio::task::spawn_blocking(move || {
        let mut report = PresetApplyReport {
            enabled: 0,
            disabled: 0,
            failures,
        };

        for item in planned {
            let (from, to) = item.rename;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Slot;

    fn a_mod(id: i64, enabled: bool) -> Mod {
        Mod {
            id,
            character_id: "lucia-elowen".to_string(),
            slot: Slot::CharacterSkin,
            display_name: format!("Mod {id}"),
            folder_path: format!("C:/mods/{id}"),
            enabled,
            files_missing: false,
            thumbnail_url: None,
            gamebanana_mod_id: None,
            gamebanana_file_id: None,
            gamebanana_md5: None,
            variant_label: None,
            bundled_thumbnail: None,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn names_go_on_and_everything_else_goes_off() {
        let mods = vec![a_mod(1, false), a_mod(2, true), a_mod(3, false)];

        let changes = plan_preset(&[1, 3], &mods);

        assert_eq!(
            changes,
            vec![
                PresetChange { mod_id: 1, turn_on: true },
                PresetChange { mod_id: 2, turn_on: false },
                PresetChange { mod_id: 3, turn_on: true },
            ],
        );
    }

    #[test]
    fn a_mod_already_in_the_right_state_is_not_a_change() {
        let mods = vec![a_mod(1, true), a_mod(2, false)];

        // 1 is named and already on; 2 is not named and already off. Nothing to do.
        assert!(plan_preset(&[1], &mods).is_empty());
    }

    #[test]
    fn an_empty_preset_switches_everything_off() {
        let mods = vec![a_mod(1, true), a_mod(2, true), a_mod(3, false)];

        let changes = plan_preset(&[], &mods);

        assert_eq!(
            changes,
            vec![
                PresetChange { mod_id: 1, turn_on: false },
                PresetChange { mod_id: 2, turn_on: false },
            ],
        );
    }

    #[test]
    fn applying_twice_changes_nothing_the_second_time() {
        let mods = vec![a_mod(1, false), a_mod(2, true)];
        let wanted = [1];

        // What the first apply would do, then the library as it would then be.
        let after: Vec<Mod> = mods
            .iter()
            .map(|m| a_mod(m.id, wanted.contains(&m.id)))
            .collect();

        assert_eq!(plan_preset(&wanted, &mods).len(), 2);
        assert!(
            plan_preset(&wanted, &after).is_empty(),
            "a preset describes a state, so re-applying it is a no-op",
        );
    }

    #[test]
    fn a_mod_the_preset_names_that_is_not_installed_is_not_a_change() {
        let mods = vec![a_mod(1, false)];

        // 99 was deleted since the preset was saved. `preset_mod_ids` already joins it away,
        // but nothing here should invent work for an id with no row either.
        let changes = plan_preset(&[1, 99], &mods);

        assert_eq!(changes, vec![PresetChange { mod_id: 1, turn_on: true }]);
    }
}
