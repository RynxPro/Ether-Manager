use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

use crate::db::{Db, Mod, Slot};

/// XXMI/ZZMI convention, confirmed directly by the user against a real XXMI dev:
/// disabling a mod prepends this to its own leaf folder name (`pinkdress` -> `DISABLED_pinkdress`).
/// Never applied to parent character/slot folders.
const DISABLED_PREFIX: &str = "DISABLED_";

#[derive(Debug)]
pub enum FsOpsError {
    Io(std::io::Error),
    Db(rusqlite::Error),
    NotFound(i64),
    InvalidPath(String),
}

impl fmt::Display for FsOpsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FsOpsError::Io(e) => write!(f, "filesystem error: {e}"),
            FsOpsError::Db(e) => write!(f, "database error: {e}"),
            FsOpsError::NotFound(id) => write!(f, "mod {id} not found"),
            FsOpsError::InvalidPath(p) => write!(f, "invalid mod folder path: {p}"),
        }
    }
}

impl std::error::Error for FsOpsError {}

impl From<std::io::Error> for FsOpsError {
    fn from(e: std::io::Error) -> Self {
        FsOpsError::Io(e)
    }
}

impl From<rusqlite::Error> for FsOpsError {
    fn from(e: rusqlite::Error) -> Self {
        FsOpsError::Db(e)
    }
}

fn is_disabled_name(name: &str) -> bool {
    name.starts_with(DISABLED_PREFIX)
}

fn to_disabled_name(name: &str) -> String {
    if is_disabled_name(name) {
        name.to_string()
    } else {
        format!("{DISABLED_PREFIX}{name}")
    }
}

fn to_enabled_name(name: &str) -> String {
    name.strip_prefix(DISABLED_PREFIX)
        .unwrap_or(name)
        .to_string()
}

fn rename_leaf(path: &Path, new_name: &str) -> Result<PathBuf, FsOpsError> {
    let parent = path
        .parent()
        .ok_or_else(|| FsOpsError::InvalidPath(path.display().to_string()))?;
    let new_path = parent.join(new_name);
    if new_path != path {
        fs::rename(path, &new_path)?;
    }
    Ok(new_path)
}

fn leaf_name(path: &Path) -> Result<&str, FsOpsError> {
    path.file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| FsOpsError::InvalidPath(path.display().to_string()))
}

/// Rejects anything that isn't a plain, single path segment: no `..`/`.` traversal,
/// no `/` or `\` separators, not empty. `character_id` values may eventually originate
/// from external metadata (GameBanana, in a later milestone) rather than only our own
/// trusted static character list, so this boundary is enforced here rather than trusted
/// to always be safe by construction.
fn is_safe_path_segment(s: &str) -> bool {
    !s.is_empty() && s != "." && s != ".." && !s.contains(['/', '\\']) && !s.contains('\0')
}

/// Returns `<mods_root>/Characters/<character_id>/<slot>/`.
pub fn character_slot_dir(
    mods_root: &Path,
    character_id: &str,
    slot: Slot,
) -> Result<PathBuf, FsOpsError> {
    if !is_safe_path_segment(character_id) {
        return Err(FsOpsError::InvalidPath(character_id.to_string()));
    }
    Ok(mods_root
        .join("Characters")
        .join(character_id)
        .join(slot.as_str()))
}

/// Creates `<mods_root>/Characters/<character_id>/<slot>/` if it doesn't already exist.
pub fn ensure_character_slot_dir(
    mods_root: &Path,
    character_id: &str,
    slot: Slot,
) -> Result<PathBuf, FsOpsError> {
    let dir = character_slot_dir(mods_root, character_id, slot)?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn set_single_enabled(db: &Db, m: &Mod, enabled: bool) -> Result<(), FsOpsError> {
    let old_path = PathBuf::from(&m.folder_path);
    let old_leaf = leaf_name(&old_path)?;
    let new_leaf = if enabled {
        to_enabled_name(old_leaf)
    } else {
        to_disabled_name(old_leaf)
    };
    let new_path = rename_leaf(&old_path, &new_leaf)?;
    db.set_enabled_and_folder_path(m.id, enabled, &new_path.to_string_lossy())?;
    Ok(())
}

/// Enables or disables a mod on disk (leaf-folder `DISABLED_` rename) and in the DB.
///
/// v1 enable model is strictly one enabled mod per slot: enabling a mod first disables
/// any other currently-enabled mod in the same character+slot.
pub fn set_mod_enabled(db: &Db, mod_id: i64, enabled: bool) -> Result<(), FsOpsError> {
    let target = db.get_mod(mod_id)?.ok_or(FsOpsError::NotFound(mod_id))?;

    if enabled {
        let siblings = db.list_mods_for_character(&target.character_id)?;
        for sibling in siblings
            .into_iter()
            .filter(|m| m.slot == target.slot && m.enabled && m.id != target.id)
        {
            set_single_enabled(db, &sibling, false)?;
        }
    }

    set_single_enabled(db, &target, enabled)
}

/// Removes a mod's folder from disk entirely. Does not touch the DB row — callers
/// are expected to also call `Db::delete_mod` once this succeeds.
pub fn delete_mod_files(m: &Mod) -> std::io::Result<()> {
    let path = PathBuf::from(&m.folder_path);
    if path.exists() {
        fs::remove_dir_all(path)?;
    }
    Ok(())
}

/// Recursively copies `src`'s contents into `dst`, creating `dst` if needed. Used by
/// `add_mod` when the user picks an already-extracted folder rather than an archive.
pub fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let dest_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &dest_path)?;
        } else {
            fs::copy(entry.path(), &dest_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{NewMod, Slot};
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_dir(label: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ether-manager-fs-ops-test-{label}-{n}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn insert_mod_with_folder(db: &Db, character_id: &str, slot: Slot, folder: &Path) -> Mod {
        fs::create_dir_all(folder).unwrap();
        db.insert_mod(NewMod {
            character_id: character_id.to_string(),
            slot,
            display_name: "Test Mod".to_string(),
            folder_path: folder.to_string_lossy().to_string(),
            thumbnail_path: None,
        })
        .unwrap()
    }

    #[test]
    fn ensure_character_slot_dir_creates_nested_path() {
        let root = temp_dir("create-dir");
        let dir = ensure_character_slot_dir(&root, "belle", Slot::Outfit).unwrap();

        assert!(dir.is_dir());
        assert_eq!(dir, root.join("Characters").join("belle").join("Outfit"));

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn disabling_prefixes_leaf_folder_only() {
        let root = temp_dir("disable");
        let db = Db::open_in_memory().unwrap();
        let slot_dir = root.join("Characters").join("belle").join("Outfit");
        let mod_dir = slot_dir.join("pinkdress");
        let m = insert_mod_with_folder(&db, "belle", Slot::Outfit, &mod_dir);

        set_mod_enabled(&db, m.id, false).unwrap();

        assert!(!mod_dir.exists());
        assert!(slot_dir.join("DISABLED_pinkdress").is_dir());
        assert!(slot_dir.is_dir(), "parent slot folder must be untouched");

        let updated = db.get_mod(m.id).unwrap().unwrap();
        assert!(!updated.enabled);
        assert!(updated.folder_path.ends_with("DISABLED_pinkdress"));

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn enabling_strips_prefix_from_leaf_folder_only() {
        let root = temp_dir("enable");
        let db = Db::open_in_memory().unwrap();
        let slot_dir = root.join("Characters").join("belle").join("Outfit");
        let mod_dir = slot_dir.join("DISABLED_pinkdress");
        let m = insert_mod_with_folder(&db, "belle", Slot::Outfit, &mod_dir);

        set_mod_enabled(&db, m.id, true).unwrap();

        assert!(!mod_dir.exists());
        assert!(slot_dir.join("pinkdress").is_dir());

        let updated = db.get_mod(m.id).unwrap().unwrap();
        assert!(updated.enabled);
        assert!(updated.folder_path.ends_with("pinkdress"));
        assert!(!updated.folder_path.ends_with("DISABLED_pinkdress"));

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn enabling_second_mod_in_slot_disables_the_first() {
        let root = temp_dir("one-per-slot");
        let db = Db::open_in_memory().unwrap();
        let slot_dir = root.join("Characters").join("belle").join("Outfit");

        let first_dir = slot_dir.join("neondream");
        let first = insert_mod_with_folder(&db, "belle", Slot::Outfit, &first_dir);
        let second_dir = slot_dir.join("schooluniform");
        let second = insert_mod_with_folder(&db, "belle", Slot::Outfit, &second_dir);

        set_mod_enabled(&db, first.id, true).unwrap();
        assert!(db.get_mod(first.id).unwrap().unwrap().enabled);

        set_mod_enabled(&db, second.id, true).unwrap();

        let first_after = db.get_mod(first.id).unwrap().unwrap();
        let second_after = db.get_mod(second.id).unwrap().unwrap();
        assert!(
            !first_after.enabled,
            "enabling a sibling must disable the previously-enabled mod"
        );
        assert!(second_after.enabled);
        assert!(slot_dir.join("DISABLED_neondream").is_dir());
        assert!(slot_dir.join("schooluniform").is_dir());

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn enabling_mods_in_different_slots_does_not_affect_each_other() {
        let root = temp_dir("different-slots");
        let db = Db::open_in_memory().unwrap();
        let outfit_dir = root
            .join("Characters")
            .join("belle")
            .join("Outfit")
            .join("neondream");
        let weapon_dir = root
            .join("Characters")
            .join("belle")
            .join("Weapon")
            .join("goldcatalyst");
        let outfit = insert_mod_with_folder(&db, "belle", Slot::Outfit, &outfit_dir);
        let weapon = insert_mod_with_folder(&db, "belle", Slot::Weapon, &weapon_dir);

        set_mod_enabled(&db, outfit.id, true).unwrap();
        set_mod_enabled(&db, weapon.id, true).unwrap();

        assert!(db.get_mod(outfit.id).unwrap().unwrap().enabled);
        assert!(db.get_mod(weapon.id).unwrap().unwrap().enabled);

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn character_slot_dir_rejects_path_traversal_attempts() {
        let root = temp_dir("path-traversal");

        assert!(character_slot_dir(&root, "../../../Windows", Slot::Outfit).is_err());
        assert!(character_slot_dir(&root, "..", Slot::Outfit).is_err());
        assert!(character_slot_dir(&root, "belle/../../escape", Slot::Outfit).is_err());
        assert!(character_slot_dir(&root, "belle\\..\\..\\escape", Slot::Outfit).is_err());
        assert!(character_slot_dir(&root, "", Slot::Outfit).is_err());

        assert!(character_slot_dir(&root, "belle", Slot::Outfit).is_ok());

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn delete_mod_files_removes_folder_from_disk() {
        let root = temp_dir("delete");
        let db = Db::open_in_memory().unwrap();
        let mod_dir = root
            .join("Characters")
            .join("belle")
            .join("Outfit")
            .join("pinkdress");
        fs::create_dir_all(&mod_dir).unwrap();
        fs::write(mod_dir.join("mod.ini"), "test").unwrap();
        let m = insert_mod_with_folder(&db, "belle", Slot::Outfit, &mod_dir);

        delete_mod_files(&m).unwrap();

        assert!(!mod_dir.exists());

        fs::remove_dir_all(&root).unwrap();
    }
}
