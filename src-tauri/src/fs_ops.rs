use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

use crate::db::{Db, Mod, Slot};

/// XXMI/ZZMI convention, confirmed directly by the user against a real XXMI dev:
/// disabling a mod prepends this to its own leaf folder name (`pinkdress` -> `DISABLED_pinkdress`).
/// Never applied to parent character/slot folders.
const DISABLED_PREFIX: &str = "DISABLED_";

/// The exact, stable prefix `FsOpsError::ModFolderMissing`'s `Display` starts with — the
/// frontend matches on this substring (not the full message, which includes a path) to decide
/// whether to offer the "Remove from library" recovery action, so keep this in sync with
/// `src/lib/tauri-commands.ts`'s equivalent constant if it ever changes.
pub const MOD_FOLDER_MISSING_PREFIX: &str = "mod folder is missing";

#[derive(Debug)]
pub enum FsOpsError {
    Io(std::io::Error),
    Db(rusqlite::Error),
    NotFound(i64),
    InvalidPath(String),
    /// The DB says this mod exists at `folder_path`, but nothing is there — most likely the
    /// user deleted or moved it outside the app. Distinct from `Io` (which would otherwise
    /// surface as a raw, confusing OS "cannot find the path" error from the *rename* call that
    /// follows) so the frontend can recognize this specific, recoverable case and offer to just
    /// remove the now-orphaned DB row instead.
    ModFolderMissing(PathBuf),
    /// `replace_mod_folder` failed to swap in the new contents AND the automatic rollback of
    /// the original contents also failed. The mod's real files are not lost — they're still
    /// intact at `backup_dir` — but they're no longer at the path the rest of the app expects,
    /// so this is surfaced distinctly rather than folded into `Io` and silently discarded.
    SwapAndRollbackFailed {
        backup_dir: PathBuf,
        swap_error: std::io::Error,
        rollback_error: std::io::Error,
    },
}

impl fmt::Display for FsOpsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FsOpsError::Io(e) => write!(f, "filesystem error: {e}"),
            FsOpsError::Db(e) => write!(f, "database error: {e}"),
            FsOpsError::NotFound(id) => write!(f, "mod {id} not found"),
            FsOpsError::InvalidPath(p) => write!(f, "invalid mod folder path: {p}"),
            FsOpsError::ModFolderMissing(path) => write!(
                f,
                "{MOD_FOLDER_MISSING_PREFIX} (was it deleted or moved outside the app?): {}",
                path.display()
            ),
            FsOpsError::SwapAndRollbackFailed {
                backup_dir,
                swap_error,
                rollback_error,
            } => write!(
                f,
                "failed to update the mod folder ({swap_error}), and the automatic rollback also failed ({rollback_error}) — your original files are safe at {}, but you'll need to move them back manually",
                backup_dir.display()
            ),
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

/// Exposed so a freshly extracted mod's folder can be created already `DISABLED_`-prefixed —
/// `insert_mod` always starts a new row `enabled = false` (see `mods_repo`), and without this
/// the on-disk folder would be created with a clean name (i.e. actually *active* to XXMI) while
/// the DB and UI both say disabled, a real mismatch until the user happened to toggle it off and
/// back on.
pub(crate) fn to_disabled_name(name: &str) -> String {
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
    if !old_path.exists() {
        return Err(FsOpsError::ModFolderMissing(old_path));
    }
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
        // Confirm the target can actually be enabled *before* disabling any sibling — otherwise
        // a target with a missing folder would fail here having already disabled a perfectly
        // working sibling as a side effect, leaving the slot with nothing enabled at all
        // (worse than before the call) instead of leaving everything untouched.
        if !PathBuf::from(&target.folder_path).exists() {
            return Err(FsOpsError::ModFolderMissing(PathBuf::from(
                &target.folder_path,
            )));
        }

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

static BACKUP_DIR_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Atomically-as-possible swaps `current_dir`'s contents for `staging_dir`'s — used by
/// `update_installed_mod` to replace an already-installed mod's files in place without
/// disturbing its identity (folder name, including any `DISABLED_` prefix, is untouched).
/// `staging_dir` must be a sibling of `current_dir` (same volume) so both renames are cheap
/// atomic filesystem operations rather than a slow, non-atomic cross-volume copy — never pass
/// a path under `%TEMP%` here unless it happens to share a volume with the mods folder.
///
/// On success, `current_dir` holds what used to be `staging_dir`'s contents and `staging_dir`
/// no longer exists (renamed away). On failure partway through, the original contents are
/// rolled back into `current_dir` before the error is returned — the mod's folder is never
/// left missing or half-swapped, unless the rollback itself also fails, which is reported
/// distinctly via `FsOpsError::SwapAndRollbackFailed` rather than silently discarded.
pub fn replace_mod_folder(current_dir: &Path, staging_dir: &Path) -> Result<(), FsOpsError> {
    if !current_dir.exists() {
        return Err(FsOpsError::ModFolderMissing(current_dir.to_path_buf()));
    }
    let leaf = leaf_name(current_dir)?;
    let parent = current_dir
        .parent()
        .ok_or_else(|| FsOpsError::InvalidPath(current_dir.display().to_string()))?;
    // Suffixed with a process-lifetime counter (not just `leaf`) so two concurrent calls
    // targeting the same `current_dir` — e.g. a double-click before the UI disables the
    // trigger — can't collide on the same backup path.
    let unique = BACKUP_DIR_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let backup_dir = parent.join(format!(".ether-backup-{unique}-{leaf}"));

    fs::rename(current_dir, &backup_dir)?;

    if let Err(swap_error) = fs::rename(staging_dir, current_dir) {
        // Roll back before surfacing the error — a failed swap must never leave the mod's
        // folder missing. But the rollback itself can fail too (transient lock, AV scan,
        // permissions), and that must not be silently swallowed: the mod's real files would
        // still be safe at `backup_dir`, just not where anything else expects them.
        if let Err(rollback_error) = fs::rename(&backup_dir, current_dir) {
            return Err(FsOpsError::SwapAndRollbackFailed {
                backup_dir,
                swap_error,
                rollback_error,
            });
        }
        return Err(FsOpsError::Io(swap_error));
    }

    let _ = fs::remove_dir_all(&backup_dir);
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

    #[test]
    fn to_disabled_name_prefixes_a_clean_name_and_is_idempotent() {
        assert_eq!(to_disabled_name("pinkdress"), "DISABLED_pinkdress");
        assert_eq!(
            to_disabled_name("DISABLED_pinkdress"),
            "DISABLED_pinkdress",
            "must not double-prefix an already-disabled name"
        );
    }

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_dir(label: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ether-manager-fs-ops-test-{label}-{n}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// `replace_mod_folder`'s backup dir name now includes a uniqueness counter (fixed to
    /// prevent concurrent-call collisions), so tests check for the prefix rather than an
    /// exact name.
    fn has_any_backup_dir(root: &Path) -> bool {
        fs::read_dir(root).unwrap().any(|entry| {
            entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with(".ether-backup-")
        })
    }

    fn insert_mod_with_folder(db: &Db, character_id: &str, slot: Slot, folder: &Path) -> Mod {
        fs::create_dir_all(folder).unwrap();
        db.insert_mod(NewMod {
            character_id: character_id.to_string(),
            slot,
            display_name: "Test Mod".to_string(),
            folder_path: folder.to_string_lossy().to_string(),
            thumbnail_url: None,
            gamebanana_mod_id: None,
            gamebanana_file_id: None,
            gamebanana_md5: None,
        })
        .unwrap()
    }

    #[test]
    fn ensure_character_slot_dir_creates_nested_path() {
        let root = temp_dir("create-dir");
        let dir = ensure_character_slot_dir(&root, "belle", Slot::CharacterSkin).unwrap();

        assert!(dir.is_dir());
        assert_eq!(dir, root.join("Characters").join("belle").join("Character Skin"));

        fs::remove_dir_all(&root).unwrap();
    }

    /// A mod deleted or moved outside the app must fail toggling with a specific, recognizable
    /// error (so the frontend can offer "Remove from library") — not a raw OS "cannot find the
    /// path" error from the rename call that would otherwise be the first thing to fail.
    #[test]
    fn toggling_a_mod_whose_folder_is_gone_returns_mod_folder_missing() {
        let root = temp_dir("missing-folder-toggle");
        let db = Db::open_in_memory().unwrap();
        let slot_dir = root.join("Characters").join("belle").join("Character Skin");
        let mod_dir = slot_dir.join("pinkdress");
        let m = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &mod_dir);

        fs::remove_dir_all(&mod_dir).unwrap();

        let err = set_mod_enabled(&db, m.id, true).unwrap_err();
        assert!(matches!(err, FsOpsError::ModFolderMissing(_)));
        assert!(err.to_string().starts_with(MOD_FOLDER_MISSING_PREFIX));

        fs::remove_dir_all(&root).unwrap();
    }

    /// Caught live while QA-testing the fix above: enabling a mod whose folder is missing must
    /// fail before touching any sibling — otherwise a doomed enable call would still disable a
    /// perfectly working sibling as a side effect, leaving the slot worse off than before the
    /// call (nothing enabled) instead of leaving it untouched.
    #[test]
    fn enabling_a_mod_with_a_missing_folder_does_not_disable_a_working_sibling() {
        let root = temp_dir("missing-folder-enable-sibling");
        let db = Db::open_in_memory().unwrap();
        let slot_dir = root.join("Characters").join("belle").join("Character Skin");

        let working_dir = slot_dir.join("neondream");
        let working = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &working_dir);
        set_mod_enabled(&db, working.id, true).unwrap();

        let missing_dir = slot_dir.join("schooluniform");
        let missing = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &missing_dir);
        fs::remove_dir_all(&missing_dir).unwrap();

        let err = set_mod_enabled(&db, missing.id, true).unwrap_err();
        assert!(matches!(err, FsOpsError::ModFolderMissing(_)));

        let working_after = db.get_mod(working.id).unwrap().unwrap();
        assert!(
            working_after.enabled,
            "the working sibling must stay enabled when the doomed enable call fails"
        );

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn disabling_prefixes_leaf_folder_only() {
        let root = temp_dir("disable");
        let db = Db::open_in_memory().unwrap();
        let slot_dir = root.join("Characters").join("belle").join("Character Skin");
        let mod_dir = slot_dir.join("pinkdress");
        let m = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &mod_dir);

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
        let slot_dir = root.join("Characters").join("belle").join("Character Skin");
        let mod_dir = slot_dir.join("DISABLED_pinkdress");
        let m = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &mod_dir);

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
        let slot_dir = root.join("Characters").join("belle").join("Character Skin");

        let first_dir = slot_dir.join("neondream");
        let first = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &first_dir);
        let second_dir = slot_dir.join("schooluniform");
        let second = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &second_dir);

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

    /// A real character only ever has one slot (`CharacterSkin`) now, so "different slots not
    /// interfering" means different `(character_id, slot)` pairs generally — covered here via
    /// two different characters, and separately via a character vs. a global pseudo-category
    /// in `enabling_a_character_mod_and_a_ui_mod_does_not_affect_each_other`.
    #[test]
    fn enabling_mods_for_different_characters_does_not_affect_each_other() {
        let root = temp_dir("different-slots");
        let db = Db::open_in_memory().unwrap();
        let belle_dir = root
            .join("Characters")
            .join("belle")
            .join("Character Skin")
            .join("neondream");
        let anby_dir = root
            .join("Characters")
            .join("anby-demara")
            .join("Character Skin")
            .join("goldcatalyst");
        let belle = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &belle_dir);
        let anby = insert_mod_with_folder(&db, "anby-demara", Slot::CharacterSkin, &anby_dir);

        set_mod_enabled(&db, belle.id, true).unwrap();
        set_mod_enabled(&db, anby.id, true).unwrap();

        assert!(db.get_mod(belle.id).unwrap().unwrap().enabled);
        assert!(db.get_mod(anby.id).unwrap().unwrap().enabled);

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn enabling_a_character_mod_and_a_ui_mod_does_not_affect_each_other() {
        let root = temp_dir("character-vs-ui-slot");
        let db = Db::open_in_memory().unwrap();
        let skin_dir = root
            .join("Characters")
            .join("belle")
            .join("Character Skin")
            .join("neondream");
        let ui_dir = root.join("Characters").join("ui").join("UI").join("hudtweak");
        let skin = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &skin_dir);
        let ui = insert_mod_with_folder(&db, "ui", Slot::Ui, &ui_dir);

        set_mod_enabled(&db, skin.id, true).unwrap();
        set_mod_enabled(&db, ui.id, true).unwrap();

        assert!(db.get_mod(skin.id).unwrap().unwrap().enabled);
        assert!(db.get_mod(ui.id).unwrap().unwrap().enabled);

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn character_slot_dir_rejects_path_traversal_attempts() {
        let root = temp_dir("path-traversal");

        assert!(character_slot_dir(&root, "../../../Windows", Slot::CharacterSkin).is_err());
        assert!(character_slot_dir(&root, "..", Slot::CharacterSkin).is_err());
        assert!(character_slot_dir(&root, "belle/../../escape", Slot::CharacterSkin).is_err());
        assert!(character_slot_dir(&root, "belle\\..\\..\\escape", Slot::CharacterSkin).is_err());
        assert!(character_slot_dir(&root, "", Slot::CharacterSkin).is_err());

        assert!(character_slot_dir(&root, "belle", Slot::CharacterSkin).is_ok());

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn replace_mod_folder_on_a_missing_current_dir_returns_mod_folder_missing() {
        let root = temp_dir("replace-missing-current");
        let current_dir = root.join("MyMod"); // never created
        let staging_dir = root.join("MyMod-staging");
        fs::create_dir_all(&staging_dir).unwrap();

        let err = replace_mod_folder(&current_dir, &staging_dir).unwrap_err();
        assert!(matches!(err, FsOpsError::ModFolderMissing(_)));
        assert!(
            staging_dir.exists(),
            "must fail before touching staging_dir, not partway through"
        );

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn replace_mod_folder_swaps_contents_and_leaves_no_backup_or_staging_dirs() {
        let root = temp_dir("replace-happy");
        let current_dir = root.join("MyMod");
        fs::create_dir_all(&current_dir).unwrap();
        fs::write(current_dir.join("old.txt"), "old").unwrap();

        let staging_dir = root.join("MyMod-staging");
        fs::create_dir_all(&staging_dir).unwrap();
        fs::write(staging_dir.join("new.txt"), "new").unwrap();

        replace_mod_folder(&current_dir, &staging_dir).unwrap();

        assert!(current_dir.join("new.txt").exists());
        assert!(!current_dir.join("old.txt").exists());
        assert!(
            !staging_dir.exists(),
            "staging dir must be consumed by the swap"
        );
        assert!(
            !has_any_backup_dir(&root),
            "backup dir must be cleaned up on success"
        );

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn replace_mod_folder_preserves_a_disabled_prefixed_leaf_name() {
        let root = temp_dir("replace-disabled-prefix");
        let current_dir = root.join("DISABLED_MyMod");
        fs::create_dir_all(&current_dir).unwrap();

        let staging_dir = root.join("MyMod-staging");
        fs::create_dir_all(&staging_dir).unwrap();
        fs::write(staging_dir.join("new.txt"), "new").unwrap();

        replace_mod_folder(&current_dir, &staging_dir).unwrap();

        assert!(current_dir.join("new.txt").exists());
        assert_eq!(leaf_name(&current_dir).unwrap(), "DISABLED_MyMod");

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn replace_mod_folder_restores_original_contents_when_the_swap_fails() {
        let root = temp_dir("replace-rollback");
        let current_dir = root.join("MyMod");
        fs::create_dir_all(&current_dir).unwrap();
        fs::write(current_dir.join("old.txt"), "old").unwrap();

        let nonexistent_staging = root.join("does-not-exist");

        let result = replace_mod_folder(&current_dir, &nonexistent_staging);

        assert!(result.is_err());
        assert!(current_dir.is_dir(), "original folder must be restored");
        assert!(
            current_dir.join("old.txt").exists(),
            "original contents must be intact after a failed swap"
        );
        assert!(
            !has_any_backup_dir(&root),
            "backup dir must not be left behind after a successful rollback"
        );

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn swap_and_rollback_failed_error_names_the_backup_location() {
        let backup_dir = PathBuf::from("/tmp/example/.ether-backup-3-MyMod");
        let err = FsOpsError::SwapAndRollbackFailed {
            backup_dir: backup_dir.clone(),
            swap_error: std::io::Error::new(std::io::ErrorKind::NotFound, "swap failed"),
            rollback_error: std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "rollback failed",
            ),
        };
        let message = err.to_string();

        assert!(
            message.contains(&backup_dir.display().to_string()),
            "message must name where the user's real files ended up: {message}"
        );
        assert!(message.contains("swap failed"));
        assert!(message.contains("rollback failed"));
    }

    #[test]
    fn delete_mod_files_removes_folder_from_disk() {
        let root = temp_dir("delete");
        let db = Db::open_in_memory().unwrap();
        let mod_dir = root
            .join("Characters")
            .join("belle")
            .join("Character Skin")
            .join("pinkdress");
        fs::create_dir_all(&mod_dir).unwrap();
        fs::write(mod_dir.join("mod.ini"), "test").unwrap();
        let m = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &mod_dir);

        delete_mod_files(&m).unwrap();

        assert!(!mod_dir.exists());

        fs::remove_dir_all(&root).unwrap();
    }
}
