use std::collections::HashMap;
use std::path::{Path, PathBuf};

use tauri::State;

use crate::db::{Mod, NewMod, Slot};
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
pub fn list_mod_counts(state: State<AppState>) -> Result<HashMap<String, i64>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.count_mods_by_character().map_err(|e| e.to_string())
}

fn slugify_display_name(name: &str) -> String {
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

/// Appends a numeric suffix if `base_name` already exists under `slot_dir`, so two mods
/// with the same display name don't collide on disk.
fn unique_variant_dir(slot_dir: &Path, base_name: &str) -> PathBuf {
    let mut candidate = slot_dir.join(base_name);
    let mut n = 1;
    while candidate.exists() {
        candidate = slot_dir.join(format!("{base_name}_{n}"));
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
    thumbnail_path: Option<String>,
) -> Result<Mod, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mods_folder = db
        .get_setting("mods_folder")
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "mods folder is not set yet".to_string())?;
    let mods_root = PathBuf::from(mods_folder);

    let slot_dir = fs_ops::ensure_character_slot_dir(&mods_root, &character_id, slot)
        .map_err(|e| e.to_string())?;

    let base_name = slugify_display_name(&display_name);
    let dest_dir = unique_variant_dir(&slot_dir, &base_name);

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
        thumbnail_path,
    })
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
