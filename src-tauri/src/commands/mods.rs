use std::collections::HashMap;
use std::path::{Path, PathBuf};

use tauri::State;

use crate::db::{Mod, ModCounts, NewMod, Slot};
use crate::{archive, fs_ops, AppState};

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

fn is_archive_path(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| matches!(ext.to_lowercase().as_str(), "zip" | "7z" | "rar"))
        .unwrap_or(false)
}

#[tauri::command]
pub fn add_mod(
    state: State<AppState>,
    character_id: String,
    slot: Slot,
    display_name: String,
    source_path: String,
    thumbnail_url: Option<String>,
) -> Result<Mod, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mods_folder = db
        .get_setting("mods_folder")
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "mods folder is not set yet".to_string())?;
    let mods_root = PathBuf::from(mods_folder);

    let character_dir =
        fs_ops::ensure_mod_home_dir(&mods_root, &character_id).map_err(|e| e.to_string())?;

    // A newly inserted mod always starts disabled (see insert_mod) — extract straight into a
    // DISABLED_-prefixed folder so the disk matches that from the start, instead of a clean
    // name that XXMI would actually treat as active despite the app showing it as off.
    let base_name = fs_ops::to_disabled_name(&slugify_display_name(&display_name));
    let dest_dir = unique_variant_dir(&character_dir, &base_name);

    let source = PathBuf::from(&source_path);
    if is_archive_path(&source) {
        archive::extract_archive(&source, &dest_dir).map_err(|e| e.to_string())?;
    } else {
        fs_ops::copy_dir_recursive(&source, &dest_dir).map_err(|e| e.to_string())?;
    }

    db.insert_mod(NewMod {
        character_id,
        slot,
        display_name,
        folder_path: dest_dir.to_string_lossy().to_string(),
        thumbnail_url,
        gamebanana_mod_id: None,
        gamebanana_file_id: None,
        gamebanana_md5: None,
        // A hand-added mod came from a folder on disk, not a GameBanana file, so there is no
        // uploader's note behind it to record.
        variant_label: None,
    })
    .map_err(|e| e.to_string())
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

#[tauri::command]
pub fn toggle_mod(state: State<AppState>, mod_id: i64, enabled: bool) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    fs_ops::set_mod_enabled(&db, mod_id, enabled).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_mod(state: State<AppState>, mod_id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let m = db
        .get_mod(mod_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("mod {mod_id} not found"))?;
    fs_ops::delete_mod_files(&m).map_err(|e| e.to_string())?;
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

    /// `add_mod` builds its destination folder name via
    /// `fs_ops::to_disabled_name(&slugify_display_name(...))` — pinning that composition here
    /// since `add_mod` itself takes a Tauri `State` and isn't unit-testable directly.
    #[test]
    fn add_mods_folder_naming_produces_an_already_disabled_name() {
        assert_eq!(
            fs_ops::to_disabled_name(&slugify_display_name("Pink Dress V2!")),
            "DISABLED_pink_dress_v2"
        );
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

    #[test]
    fn is_archive_path_detects_supported_extensions() {
        assert!(is_archive_path(Path::new("mod.zip")));
        assert!(is_archive_path(Path::new("mod.RAR")));
        assert!(is_archive_path(Path::new("mod.7z")));
        assert!(!is_archive_path(Path::new("mod_folder")));
        assert!(!is_archive_path(Path::new("readme.txt")));
    }
}
