use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

use crate::db::{Db, Mod, Slot};

/// XXMI/ZZMI convention, confirmed directly by the user against a real XXMI dev:
/// disabling a mod prepends this to its own leaf folder name (`pinkdress` -> `DISABLED_pinkdress`).
/// Never applied to the parent character folder.
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

/// Where a mod for this character lives on disk.
///
/// A real character gets `<mods_root>/Characters/<character_id>/`, with the mod folders sitting
/// directly inside it. There used to be a slot folder between the two, from when a character had
/// several slots to fill; slots collapsed to the point where every real character uses exactly
/// `Character Skin`, leaving a level that named a constant. `Slot` still exists in the database
/// and still drives the UI and Misc tabs — it simply stopped being somewhere on disk.
///
/// `ui` and `misc` are not characters. They are pseudo-characters the database uses so that
/// library-wide mods have somewhere to hang, and filing them under `Characters/` said they were
/// two more members of the roster. They get `<mods_root>/UI/` and `<mods_root>/Misc/` instead,
/// beside `Characters/` rather than inside it.
pub fn mod_home_dir(mods_root: &Path, character_id: &str) -> Result<PathBuf, FsOpsError> {
    if !is_safe_path_segment(character_id) {
        return Err(FsOpsError::InvalidPath(character_id.to_string()));
    }
    Ok(match character_id {
        crate::characters::UI_PSEUDO_CHARACTER_ID => mods_root.join(Slot::Ui.as_str()),
        crate::characters::MISC_PSEUDO_CHARACTER_ID => mods_root.join(Slot::Misc.as_str()),
        _ => mods_root.join("Characters").join(character_id),
    })
}

/// Creates the directory [`mod_home_dir`] names, if it doesn't already exist.
pub fn ensure_mod_home_dir(mods_root: &Path, character_id: &str) -> Result<PathBuf, FsOpsError> {
    let dir = mod_home_dir(mods_root, character_id)?;
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
/// Affects exactly the one mod named. Any number can be on at once, per character and per slot.
pub fn set_mod_enabled(db: &Db, mod_id: i64, enabled: bool) -> Result<(), FsOpsError> {
    let target = db.get_mod(mod_id)?.ok_or(FsOpsError::NotFound(mod_id))?;

    // Enabling one mod no longer disables its slot-mates. ZZMI will load several at once, and
    // whether that is wise depends on what they touch — two skins for the same character usually
    // fight over the same model, while two mods that merely share a slot may not overlap at all.
    // That judgement belongs to whoever installed them, so the UI cautions when more than one is
    // on instead of the app quietly switching the others off, which is what used to happen with
    // no mention of it anywhere.
    if enabled && !PathBuf::from(&target.folder_path).exists() {
        return Err(FsOpsError::ModFolderMissing(PathBuf::from(
            &target.folder_path,
        )));
    }

    set_single_enabled(db, &target, enabled)
}

/// Moves any mod that is not where [`mod_home_dir`] says it belongs, and reports how many moved.
///
/// The layout has changed twice: mods used to live under a slot folder, and the `ui`/`misc`
/// pseudo-characters used to be filed under `Characters/` as though they were roster members.
/// Both changes only affect where *new* mods land, because the database records each existing
/// mod's own path — so without this the folders already installed would stay exactly where they
/// are and the library would be part one shape and part another indefinitely.
///
/// One rule covers both, and any later move: put every managed mod where the current layout
/// says it goes. That also makes it self-correcting rather than a pair of one-shot migrations
/// to keep track of.
///
/// A mod whose folder is outside `mods_root` entirely is left alone — a library pointed
/// somewhere else, or a path edited by hand, must not be dragged in by a sweep guessing at what
/// it meant. Failures are per-mod and non-fatal for the same reason: one unmovable folder (open
/// in Explorer, locked by the game) should not strand the rest.
pub fn settle_mod_folders(db: &Db, mods_root: &Path) -> Result<usize, FsOpsError> {
    let mut moved = 0;

    for m in db.list_all_mods()? {
        let current = PathBuf::from(&m.folder_path);
        let Ok(home) = mod_home_dir(mods_root, &m.character_id) else {
            continue;
        };
        let Some(parent) = current.parent() else {
            continue;
        };
        if parent == home || !current.starts_with(mods_root) {
            continue;
        }
        let Some(leaf) = current.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        // Two old locations can hold the same leaf name — two slot folders under one character,
        // or a name that already exists at the destination. A rename that silently ate a mod
        // folder is not a risk worth carrying for the sake of a shorter function.
        fs::create_dir_all(&home)?;
        let dest = crate::commands::mods::unique_variant_dir(&home, leaf);
        if fs::rename(&current, &dest).is_err() {
            continue;
        }
        db.update_folder_path(m.id, &dest.to_string_lossy())?;
        moved += 1;

        // The folder it came from has done its job. `remove_dir` rather than `remove_dir_all`,
        // so it goes only when empty — anything the user left in there is theirs, not ours to
        // bin. Walking up clears the grandparent too, which is what removes a `Characters/misc`
        // once its one mod has moved out to `Misc/`.
        let mut spent = parent;
        while spent.starts_with(mods_root) && spent != mods_root && fs::remove_dir(spent).is_ok() {
            let Some(next) = spent.parent() else { break };
            spent = next;
        }
    }

    Ok(moved)
}

/// Moves a mod folder, falling back to a copy when a plain rename cannot do it.
///
/// `fs::rename` is the whole job on one volume and refuses across two, which is not exotic here:
/// a mods folder on a second drive is a normal way to run this. The fallback copies and then
/// removes the original, and only removes it once the copy has succeeded — a half-moved mod that
/// still exists where it was is recoverable, one that exists nowhere is not.
pub fn move_dir(from: &Path, to: &Path) -> Result<(), FsOpsError> {
    if fs::rename(from, to).is_ok() {
        return Ok(());
    }
    copy_dir_recursive(from, to)?;
    fs::remove_dir_all(from)?;
    Ok(())
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
            variant_label: None,
        })
        .unwrap()
    }

    #[test]
    fn ensure_mod_home_dir_creates_nested_path() {
        let root = temp_dir("create-dir");
        let dir = ensure_mod_home_dir(&root, "belle").unwrap();

        assert!(dir.is_dir());
        assert_eq!(dir, root.join("Characters").join("belle"));

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

    /// A failed enable must change nothing at all. Caught live while QA-testing the fix above,
    /// back when a doomed call disabled a sibling on its way to failing. Siblings are no longer
    /// touched by a successful enable either, but the rule still needs pinning: a mod whose
    /// folder has gone must not take the rest of the slot down with it.
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

    /// Turning one mod on leaves its slot-mates alone. ZZMI loads more than one, and stacking
    /// them is the user's call to make — the app cautions about it rather than deciding for
    /// them, which is what the old one-per-slot rule did without saying so.
    #[test]
    fn enabling_a_second_mod_in_a_slot_leaves_the_first_enabled() {
        let root = temp_dir("multi-per-slot");
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
            first_after.enabled,
            "enabling a sibling must not silently switch off the mod already on"
        );
        assert!(second_after.enabled);
        // Both leaf folders carry their enabled name, which is what ZZMI actually reads —
        // the DB agreeing is not enough on its own.
        assert!(slot_dir.join("neondream").is_dir());
        assert!(slot_dir.join("schooluniform").is_dir());

        fs::remove_dir_all(&root).unwrap();
    }

    /// Disabling stays surgical now that enabling is: turning one of several off must not
    /// disturb the rest, or the caution the UI shows would stop matching what is on disk.
    #[test]
    fn disabling_one_of_several_enabled_mods_leaves_the_others_on() {
        let root = temp_dir("multi-per-slot-disable");
        let db = Db::open_in_memory().unwrap();
        let slot_dir = root.join("Characters").join("belle").join("Character Skin");

        let first_dir = slot_dir.join("neondream");
        let first = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &first_dir);
        let second_dir = slot_dir.join("schooluniform");
        let second = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &second_dir);

        set_mod_enabled(&db, first.id, true).unwrap();
        set_mod_enabled(&db, second.id, true).unwrap();
        set_mod_enabled(&db, first.id, false).unwrap();

        assert!(!db.get_mod(first.id).unwrap().unwrap().enabled);
        assert!(db.get_mod(second.id).unwrap().unwrap().enabled);
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
    fn mod_home_dir_rejects_path_traversal_attempts() {
        let root = temp_dir("path-traversal");

        assert!(mod_home_dir(&root, "../../../Windows").is_err());
        assert!(mod_home_dir(&root, "..").is_err());
        assert!(mod_home_dir(&root, "belle/../../escape").is_err());
        assert!(mod_home_dir(&root, "belle\\..\\..\\escape").is_err());
        assert!(mod_home_dir(&root, "").is_err());

        assert!(mod_home_dir(&root, "belle").is_ok());

        fs::remove_dir_all(&root).unwrap();
    }

    /// The migration's whole job: a mod installed under the old layout ends up beside one
    /// installed under the new, with the row pointing at where it actually is and the emptied
    /// slot folder gone.
    #[test]
    fn flattening_lifts_a_slot_nested_mod_up_beside_a_flat_one() {
        let root = temp_dir("flatten");
        let db = Db::open_in_memory().unwrap();
        let char_dir = root.join("Characters").join("belle");

        let nested_dir = char_dir.join("Character Skin").join("neondream");
        let nested = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &nested_dir);
        let flat_dir = char_dir.join("schooluniform");
        let flat = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &flat_dir);

        assert_eq!(settle_mod_folders(&db, &root).unwrap(), 1);

        let nested_after = db.get_mod(nested.id).unwrap().unwrap();
        assert_eq!(
            PathBuf::from(&nested_after.folder_path),
            char_dir.join("neondream"),
            "the row has to follow the folder, or the app looks for a mod that moved"
        );
        assert!(char_dir.join("neondream").is_dir());
        assert!(!char_dir.join("Character Skin").exists(), "emptied slot dir");

        let flat_after = db.get_mod(flat.id).unwrap().unwrap();
        assert_eq!(
            PathBuf::from(&flat_after.folder_path),
            flat_dir,
            "an already-flat mod must not be touched"
        );

        // Running twice must be a no-op, since it runs on every launch.
        assert_eq!(settle_mod_folders(&db, &root).unwrap(), 0);

        fs::remove_dir_all(&root).unwrap();
    }

    /// Two slots under one character could hold the same leaf name. Renaming one onto the other
    /// would destroy a mod, so the collision has to be given its own name instead.
    #[test]
    fn flattening_two_slots_sharing_a_leaf_name_keeps_both() {
        let root = temp_dir("flatten-collision");
        let db = Db::open_in_memory().unwrap();
        let char_dir = root.join("Characters").join("belle");

        let skin_dir = char_dir.join("Character Skin").join("pinkdress");
        let skin = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &skin_dir);
        let outfit_dir = char_dir.join("Outfit").join("pinkdress");
        let outfit = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &outfit_dir);

        assert_eq!(settle_mod_folders(&db, &root).unwrap(), 2);

        let skin_path = PathBuf::from(db.get_mod(skin.id).unwrap().unwrap().folder_path);
        let outfit_path = PathBuf::from(db.get_mod(outfit.id).unwrap().unwrap().folder_path);
        assert_ne!(skin_path, outfit_path, "one must not overwrite the other");
        assert!(skin_path.is_dir());
        assert!(outfit_path.is_dir());

        fs::remove_dir_all(&root).unwrap();
    }

    /// `move_dir` is what refiling a mod under a different character leans on, so a folder with
    /// contents has to arrive whole — and the original has to be gone, or the next launch's
    /// `settle_mod_folders` would find two mods where there is one.
    #[test]
    fn moving_a_mod_folder_takes_its_contents_and_leaves_nothing_behind() {
        let root = temp_dir("move-dir");
        let from = root.join("Characters").join("belle").join("pinkdress");
        fs::create_dir_all(from.join("nested")).unwrap();
        fs::write(from.join("mod.ini"), b"[Mod]").unwrap();
        fs::write(from.join("nested").join("texture.dds"), b"pixels").unwrap();

        let to = root.join("Misc").join("pinkdress");
        fs::create_dir_all(to.parent().unwrap()).unwrap();
        move_dir(&from, &to).unwrap();

        assert!(!from.exists(), "the folder must not still be where it was");
        assert_eq!(fs::read(to.join("mod.ini")).unwrap(), b"[Mod]");
        assert_eq!(
            fs::read(to.join("nested").join("texture.dds")).unwrap(),
            b"pixels"
        );

        fs::remove_dir_all(&root).unwrap();
    }

    /// `ui` and `misc` are not roster members, so their mods belong beside `Characters/` rather
    /// than inside it, where they read as two more characters.
    #[test]
    fn the_pseudo_characters_live_outside_the_characters_folder() {
        let root = temp_dir("pseudo-home");

        assert_eq!(mod_home_dir(&root, "ui").unwrap(), root.join("UI"));
        assert_eq!(mod_home_dir(&root, "misc").unwrap(), root.join("Misc"));
        assert_eq!(
            mod_home_dir(&root, "belle").unwrap(),
            root.join("Characters").join("belle")
        );

        fs::remove_dir_all(&root).unwrap();
    }

    /// The second layout change this sweep has to undo: pseudo-character mods filed under
    /// `Characters/` move out to the root, and the folder that held them goes with them.
    #[test]
    fn settling_moves_a_pseudo_character_mod_out_of_the_characters_folder() {
        let root = temp_dir("settle-pseudo");
        let db = Db::open_in_memory().unwrap();

        let old_dir = root
            .join("Characters")
            .join("misc")
            .join("Misc")
            .join("glowfx");
        let m = insert_mod_with_folder(&db, "misc", Slot::Misc, &old_dir);

        assert_eq!(settle_mod_folders(&db, &root).unwrap(), 1);

        let after = db.get_mod(m.id).unwrap().unwrap();
        assert_eq!(
            PathBuf::from(&after.folder_path),
            root.join("Misc").join("glowfx")
        );
        assert!(root.join("Misc").join("glowfx").is_dir());
        assert!(
            !root.join("Characters").join("misc").exists(),
            "the pseudo-character's old home should go once it is empty"
        );

        fs::remove_dir_all(&root).unwrap();
    }

    /// A mod outside the mods folder entirely — a library pointed somewhere else, or a path
    /// edited by hand — is left exactly where it is. Inside the mods folder the sweep is
    /// deliberately assertive, since the app owns that tree and the database is the source of
    /// truth for it; outside it, it has no standing to move anything.
    #[test]
    fn settling_leaves_a_mod_outside_the_mods_folder_alone() {
        let root = temp_dir("settle-foreign");
        let outside = temp_dir("settle-foreign-elsewhere");
        let db = Db::open_in_memory().unwrap();

        let stray_dir = outside.join("hand_placed_mod");
        let stray = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &stray_dir);

        assert_eq!(settle_mod_folders(&db, &root).unwrap(), 0);

        assert_eq!(
            PathBuf::from(db.get_mod(stray.id).unwrap().unwrap().folder_path),
            stray_dir
        );
        assert!(stray_dir.is_dir());

        fs::remove_dir_all(&root).unwrap();
        fs::remove_dir_all(&outside).unwrap();
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
