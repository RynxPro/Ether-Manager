use std::collections::HashMap;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::db::{Mod, ModCounts, Slot};
use crate::{fs_ops, AppState};

#[tauri::command]
pub fn list_mods_for_character(
    state: State<AppState>,
    character_id: String,
) -> Result<Vec<Mod>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_mods_for_character(&character_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_all_mods(state: State<AppState>) -> Result<Vec<Mod>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_all_mods().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_mod_counts(state: State<AppState>) -> Result<HashMap<String, ModCounts>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.count_mods_by_character().map_err(|e| e.to_string())
}

pub(crate) fn slugify_display_name(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    let trimmed = slug.trim_matches('_');
    if trimmed.is_empty() {
        "mod".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Appends a numeric suffix if `base_name` already exists under `parent`, so two mods
/// with the same display name don't collide on disk.
pub(crate) fn unique_variant_dir(parent: &Path, base_name: &str) -> PathBuf {
    let mut candidate = parent.join(base_name);
    let mut n = 1;
    while candidate.exists() {
        candidate = parent.join(format!("{base_name}_{n}"));
        n += 1;
    }
    candidate
}

/// Renames a mod in the library.
///
/// The installer only ever guesses a name — from the archive's filename, or the uploader's note
/// for it — and a guess needs a way to be wrong. Without this the name accepted at install was
/// permanent short of deleting and reinstalling, which is what drove people to pick apart mod
/// names by hand in the first place.
///
/// Only the label changes: the folder on disk keeps its install-time name. Blank names are
/// refused rather than silently kept, since a card with no name is unusable and the surrounding
/// UI has no notion of an unnamed mod.
#[tauri::command]
pub fn rename_mod(state: State<AppState>, mod_id: i64, display_name: String) -> Result<(), String> {
    let trimmed = display_name.trim();
    if trimmed.is_empty() {
        return Err("a mod needs a name".to_string());
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    if db.get_mod(mod_id).map_err(|e| e.to_string())?.is_none() {
        return Err(format!("mod {mod_id} is no longer in the library"));
    }
    db.set_display_name(mod_id, trimmed)
        .map_err(|e| e.to_string())
}

/// Which slot a character implies. A real character always wears a Character Skin — GameBanana
/// has no per-character subcategory to split further on — and the two pseudo-characters *are*
/// the slot. So the caller picks a destination and the slot follows, rather than being a second
/// question with only one right answer.
pub(crate) fn slot_for(character_id: &str) -> Slot {
    match character_id {
        crate::characters::UI_PSEUDO_CHARACTER_ID => Slot::Ui,
        crate::characters::MISC_PSEUDO_CHARACTER_ID => Slot::Misc,
        _ => Slot::CharacterSkin,
    }
}

pub(crate) fn is_known_character(character_id: &str) -> bool {
    character_id == crate::characters::UI_PSEUDO_CHARACTER_ID
        || character_id == crate::characters::MISC_PSEUDO_CHARACTER_ID
        || crate::characters::all_characters()
            .iter()
            .any(|c| c.id == character_id)
}

/// Refiles a mod under a different character, or into the UI/Misc buckets, moving its folder to
/// match.
///
/// Guessing the destination from a mod's GameBanana category is right often enough to be worth
/// doing at install time and wrong often enough to need undoing — a skin filed under the wrong
/// member of the roster is invisible on the page you go looking for it, and re-downloading it
/// just to re-answer that question is a poor trade.
///
/// The folder really moves, unlike a rename. A mod's location is not a label: `character_id` is
/// what the library filters on and the folder is what the layout says should hold it, so leaving
/// the files behind would put the row and the disk into the disagreement `settle_mod_folders`
/// exists to heal, and it would heal it on the next launch by moving them anyway.
///
/// The destination is checked against the real roster rather than trusted, since it reaches a
/// path. An unknown id would otherwise create a folder for a character that does not exist,
/// holding a mod nothing can ever show.
#[tauri::command]
pub async fn move_mod(
    state: State<'_, AppState>,
    mod_id: i64,
    character_id: String,
) -> Result<Mod, String> {
    if !is_known_character(&character_id) {
        return Err(format!("{character_id} is not a character or category"));
    }
    let slot = slot_for(&character_id);

    /// What the planning pass decided, so the folder move can happen with no lock held.
    enum Plan {
        /// Already in the right folder; only the row needs correcting.
        RowOnly(String),
        /// The files have to move first. `canonical_dest` is what gets recorded — the spelling
        /// without state in it — while `dest` is where the folder actually lands.
        MoveFiles {
            current: PathBuf,
            dest: PathBuf,
            canonical_dest: PathBuf,
        },
    }

    // Planned under the lock, which is then released: everything here is database reads and path
    // arithmetic. The move itself is the slow part and must not hold the lock — or the thread
    // that draws the window. See `toggle_mod`.
    let plan = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let m = db
            .get_mod(mod_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("mod {mod_id} is no longer in the library"))?;

        let mods_folder = db
            .get_setting("mods_folder")
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "mods folder is not set yet".to_string())?;
        let mods_root = PathBuf::from(mods_folder);

        let current = PathBuf::from(&m.folder_path);
        let home =
            fs_ops::ensure_mod_home_dir(&mods_root, &character_id).map_err(|e| e.to_string())?;

        // Already in the right place on disk — a mod filed under the wrong character can still
        // have the right folder, and re-homing a mod to where it already lives should not touch
        // the disk.
        if current.parent() == Some(home.as_path()) {
            Plan::RowOnly(m.folder_path.clone())
        } else {
            if !current.exists() {
                return Err(format!(
                    "{}: {}",
                    fs_ops::MOD_FOLDER_MISSING_PREFIX,
                    current.display()
                ));
            }
            let leaf = current
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| format!("mod folder {} has an invalid name", current.display()))?;
            // The destination may already hold a folder of this name from a different mod, so the
            // same de-duplication an install uses applies here — and it has to leave *both*
            // spellings free, since the mod being moved may be on or off.
            let canonical_dest = fs_ops::unique_mod_dir(&home, leaf);
            // Refiling a mod under another character must not also switch it on or off, so the
            // folder that lands at the destination keeps the spelling it arrived with.
            let dest = if fs_ops::is_disabled(&current) {
                fs_ops::disabled_path(&canonical_dest)
            } else {
                canonical_dest.clone()
            };
            Plan::MoveFiles {
                current,
                dest,
                canonical_dest,
            }
        }
    };

    let recorded_path = match plan {
        Plan::RowOnly(folder_path) => folder_path,
        Plan::MoveFiles {
            current,
            dest,
            canonical_dest,
        } => {
            tokio::task::spawn_blocking(move || fs_ops::move_dir(&current, &dest))
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?;
            canonical_dest.to_string_lossy().into_owned()
        }
    };

    // The row is corrected only once the files are where it will claim they are.
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_location(mod_id, &character_id, slot, &recorded_path)
        .map_err(|e| e.to_string())?;
    db.get_mod(mod_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("mod {mod_id} vanished immediately after being moved"))
}

/// Switches a mod on or off by renaming its folder.
///
/// `async`, and that keyword is the whole point: a plain `fn` command is executed inline by
/// Tauri on the thread that draws the window, and this one can wait up to two seconds for
/// Windows to release a folder the running game or Defender is holding. Inline, that is a frozen
/// window rather than a slow one. Declared `async` and with the wait handed to `spawn_blocking`,
/// the app keeps drawing while it waits. Same shape `begin_import` already uses for extraction.
///
/// The lock is taken only for the planning half and dropped before the rename — it protects a
/// read, and `set_mod_enabled` writes nothing to the database.
#[tauri::command]
pub async fn toggle_mod(
    state: State<'_, AppState>,
    mod_id: i64,
    enabled: bool,
) -> Result<(), String> {
    let plan = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        fs_ops::plan_mod_enabled(&db, mod_id, enabled).map_err(|e| e.to_string())?
    };
    let Some((from, to)) = plan else {
        return Ok(());
    };

    tokio::task::spawn_blocking(move || fs_ops::apply_mod_rename(&from, &to))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Sets a mod's card picture from raw image bytes.
///
/// Bytes rather than a path because the commonest source has no path: an image copied out of a
/// Discord message or a browser arrives in the clipboard as data, and a screenshot never touched
/// the disk at all. The frontend reads them off the paste event and hands them straight over.
///
/// Whatever the bytes claim to be, `thumbnail::write_thumbnail` decides from their own header.
#[tauri::command]
pub fn set_mod_thumbnail(state: State<AppState>, mod_id: i64, bytes: Vec<u8>) -> Result<Mod, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    apply_thumbnail(&db, mod_id, &bytes)
}

/// Opens the native picker for an image on disk and hands back its bytes. Returns `None` when the
/// picker is dismissed.
///
/// Deliberately writes nothing. The Edit dialog stages every change it offers and applies them on
/// Save, so that Cancel means what it says — picking a file here has to be as undoable as typing
/// a new name, which it would not be if choosing one had already written it into the mod's folder.
/// The bytes travel back so the dialog can show a preview of what it is about to save.
///
/// `async` because `blocking_pick_file` blocks until the user answers the dialog, and Tauri runs
/// a plain `fn` command inline on the thread that draws the window — which is the one thread that
/// must not be blocked while a modal is open. The dialog plugin's own documentation says not to
/// call its blocking API there.
#[tauri::command]
pub async fn pick_mod_thumbnail(app: AppHandle) -> Result<Option<Vec<u8>>, String> {
    let Some(chosen) = app
        .dialog()
        .file()
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = chosen
        .into_path()
        .map_err(|e| format!("could not read that file: {e}"))?;
    std::fs::read(&path).map(Some).map_err(|e| format!("could not read that file: {e}"))
}

/// Drops a picture this app set, leaving the card to fall back to whatever it had before — a
/// GameBanana listing's preview, or nothing.
#[tauri::command]
pub fn clear_mod_thumbnail(state: State<AppState>, mod_id: i64) -> Result<Mod, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let m = require_mod(&db, mod_id)?;

    crate::thumbnail::clear_thumbnail(Path::new(&m.folder_path));
    db.set_bundled_thumbnail(mod_id, None)
        .map_err(|e| e.to_string())?;
    require_mod(&db, mod_id)
}

fn require_mod(db: &crate::db::Db, mod_id: i64) -> Result<Mod, String> {
    db.get_mod(mod_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("mod {mod_id} not found"))
}

/// Writes the picture into the mod's folder and records it, returning the mod as it now stands so
/// the card can redraw without a second round trip.
fn apply_thumbnail(db: &crate::db::Db, mod_id: i64, bytes: &[u8]) -> Result<Mod, String> {
    let m = require_mod(db, mod_id)?;
    let file_name = crate::thumbnail::write_thumbnail(Path::new(&m.folder_path), bytes)?;
    db.set_bundled_thumbnail(mod_id, Some(&file_name))
        .map_err(|e| e.to_string())?;
    require_mod(db, mod_id)
}

#[tauri::command]
pub async fn delete_mod(state: State<'_, AppState>, mod_id: i64) -> Result<(), String> {
    // Removing a directory tree carries the same retry budget as a rename, for the same reason —
    // Defender or the running game can hold a file — so it goes to a worker rather than the
    // thread that draws the window. See `toggle_mod` for the full reasoning.
    let m = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_mod(mod_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("mod {mod_id} not found"))?
    };

    tokio::task::spawn_blocking(move || fs_ops::delete_mod_files(&m))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;

    // The row goes only after the files are gone. The other order would drop the mod from the
    // library and then fail to remove its folder, leaving files nothing points at.
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_mod(mod_id).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn slugify_display_name_handles_spaces_and_punctuation() {
        assert_eq!(slugify_display_name("Pink Dress V2!"), "pink_dress_v2");
        assert_eq!(slugify_display_name("NeonDream"), "neondream");
    }

    #[test]
    fn slugify_display_name_falls_back_when_nothing_alphanumeric_survives() {
        assert_eq!(slugify_display_name("!!!"), "mod");
        assert_eq!(slugify_display_name(""), "mod");
    }

    /// Every installer builds its destination as
    /// `fs_ops::disabled_path(&fs_ops::unique_mod_dir(dir, &slugify_display_name(...)))` — a
    /// GameBanana install, a reinstall, and `commands::import::place_mods`. Pinned here because
    /// those all take a Tauri `State` and are not unit-testable directly, and because getting it
    /// wrong means handing the game a mod nobody has asked it to load yet.
    #[test]
    fn install_folder_naming_produces_an_already_disabled_name() {
        let root = std::env::temp_dir().join("ether-manager-commands-test-install-naming");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();

        let canonical = fs_ops::unique_mod_dir(&root, &slugify_display_name("Pink Dress V2!"));
        assert_eq!(canonical.file_name().unwrap(), "pink_dress_v2");
        assert_eq!(
            fs_ops::disabled_path(&canonical).file_name().unwrap(),
            "DISABLED_pink_dress_v2",
            "the folder created on disk must be the one the game skips"
        );

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn unique_variant_dir_avoids_collisions() {
        let root = std::env::temp_dir().join("ether-manager-commands-test-unique-variant");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(root.join("pinkdress")).unwrap();
        fs::create_dir_all(root.join("pinkdress_1")).unwrap();

        let candidate = unique_variant_dir(&root, "pinkdress");
        assert_eq!(candidate, root.join("pinkdress_2"));

        fs::remove_dir_all(&root).unwrap();
    }

}
