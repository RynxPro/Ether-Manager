use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

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

/// A mod folder's path with any `DISABLED_` stripped from its leaf: the one spelling that stands
/// for the mod itself rather than for its current state, and so the one the database stores.
///
/// Idempotent, and only ever touches the leaf — a character folder that happened to start with
/// the prefix is left alone, since the prefix means nothing there.
pub fn canonical_path(path: &Path) -> PathBuf {
    match (path.parent(), path.file_name().and_then(|n| n.to_str())) {
        (Some(parent), Some(leaf)) => parent.join(to_enabled_name(leaf)),
        _ => path.to_path_buf(),
    }
}

/// Whether this path is already the `DISABLED_` spelling — i.e. the game will skip it.
pub fn is_disabled(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(is_disabled_name)
}

/// The `DISABLED_` spelling of a mod folder's path — what the game skips.
pub fn disabled_path(path: &Path) -> PathBuf {
    match (path.parent(), path.file_name().and_then(|n| n.to_str())) {
        (Some(parent), Some(leaf)) => parent.join(to_disabled_name(leaf)),
        _ => path.to_path_buf(),
    }
}

/// What the disk says about one mod.
///
/// Whether a mod is on is not recorded anywhere. It *is* the presence of an unprefixed folder,
/// which is precisely what 3DMigoto reads: `d3dx.ini` carries `include_recursive = Mods` and
/// `exclude_recursive = DISABLED*`, matched against each name as it walks the tree. Deriving the
/// answer here rather than storing it alongside is what makes it impossible for the app to
/// disagree with the game, because there is only one copy of the fact. It used to be stored too,
/// and the two copies drifted in ordinary use: XXMI renames folders in this same tree every time
/// the game launches, and a rename the app did not make left it insisting a mod was installed at
/// a path nothing was at — then offering to remove the "missing" mod from the library.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Presence {
    /// The unprefixed folder is there, so the game loads this mod.
    Enabled(PathBuf),
    /// Only the `DISABLED_` spelling is there: installed, deliberately not loaded.
    Disabled(PathBuf),
    /// Neither spelling is there — deleted or moved outside the app.
    Missing,
}

/// Resolves a mod's stored path against the two names it can have on disk.
///
/// Accepts either spelling, so a caller holding a path from before it was stored canonical still
/// gets the right answer. Enabled wins if somehow both exist, because that is what the game does.
pub fn resolve_presence(path: &Path) -> Presence {
    let enabled = canonical_path(path);
    if enabled.exists() {
        return Presence::Enabled(enabled);
    }
    let disabled = disabled_path(&enabled);
    if disabled.exists() {
        return Presence::Disabled(disabled);
    }
    Presence::Missing
}

/// A canonical mod-folder path under `parent` that *neither* spelling of the name is using.
///
/// Both have to be free, not just the one about to be written. Checking only the spelling being
/// created would let an incoming disabled mod take `DISABLED_nicole` while an enabled `nicole`
/// already sat beside it — two mods sharing one canonical path, which [`resolve_presence`] then
/// cannot tell apart, and both cards would read as enabled.
pub fn unique_mod_dir(parent: &Path, base_name: &str) -> PathBuf {
    let base_name = to_enabled_name(base_name);
    let taken = |candidate: &Path| candidate.exists() || disabled_path(candidate).exists();

    let mut candidate = parent.join(&base_name);
    let mut n = 1;
    while taken(&candidate) {
        candidate = parent.join(format!("{base_name}_{n}"));
        n += 1;
    }
    candidate
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

/// Turns one mod on or off, by renaming its folder into the spelling that says so.
///
/// The rename is the whole operation: nothing is written to the database, because the database
/// no longer holds an opinion about which mods are on. See [`Presence`] for why that matters.
///
/// Affects exactly the one mod named. Any number can be on at once, per character and per slot.
/// Enabling one mod no longer disables its slot-mates: ZZMI will load several at once, and
/// whether that is wise depends on what they touch — two skins for the same character usually
/// fight over the same model, while two mods that merely share a slot may not overlap at all.
/// That judgement belongs to whoever installed them, so the UI cautions when more than one is on
/// instead of the app quietly switching the others off.
pub fn set_mod_enabled(db: &Db, mod_id: i64, enabled: bool) -> Result<(), FsOpsError> {
    let target = db.get_mod(mod_id)?.ok_or(FsOpsError::NotFound(mod_id))?;
    let canonical = canonical_path(Path::new(&target.folder_path));

    let current = match resolve_presence(&canonical) {
        Presence::Missing => return Err(FsOpsError::ModFolderMissing(canonical)),
        Presence::Enabled(path) | Presence::Disabled(path) => path,
    };

    let desired = if enabled {
        canonical
    } else {
        disabled_path(&canonical)
    };

    // Already in the spelling being asked for. Toggling a mod that some other program already
    // toggled the same way is a no-op rather than an error — the disk is what was wanted.
    if current != desired {
        retrying(|| fs::rename(&current, &desired))?;
    }
    Ok(())
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
        let dest_canonical = unique_mod_dir(&home, leaf);
        // Relocating a mod must not also switch it on or off, so the folder that lands at the
        // destination keeps whichever spelling the source had.
        let dest = if is_disabled_name(leaf) {
            disabled_path(&dest_canonical)
        } else {
            dest_canonical.clone()
        };
        // No retry here, unlike the operations a user is waiting on. This sweep runs during
        // startup and already has somewhere to put a failure: skip the mod and try again next
        // launch. Waiting out a lock would stall the window opening for seconds, per stuck mod,
        // to bring forward tidying that nobody asked for and nobody is watching.
        if fs::rename(&current, &dest).is_err() {
            continue;
        }
        db.update_folder_path(m.id, &dest_canonical.to_string_lossy())?;
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

/// How long [`retrying`] keeps trying before giving up.
///
/// Two seconds, not the ten XXMI's own file helpers wait. Every caller here sits behind something
/// the user is watching — a toggle, a delete — and a UI that freezes for ten seconds reads as
/// broken rather than as patient. Two comfortably outlasts a virus scanner glancing at a folder,
/// which is the case worth surviving. The other common holder is the running game, and no amount
/// of waiting helps there, so failing promptly and saying so is the better answer.
const RETRY_BUDGET: Duration = Duration::from_secs(2);
const RETRY_FIRST_WAIT: Duration = Duration::from_millis(1);
const RETRY_MAX_WAIT: Duration = Duration::from_millis(250);

/// Whether this failure is Windows saying "something else is holding that right now".
///
/// These clear on their own, usually within a moment: Defender scanning a file that was just
/// extracted, XXMI's optimizer walking the tree on game launch, an Explorer window left open on a
/// mod folder.
///
/// `NotFound` is deliberately absent, though XXMI's equivalent list includes it. A missing path is
/// not a busy path — it is how this module tells that a mod's files are genuinely gone, and
/// `ModFolderMissing` is built on exactly that. Retrying it for two seconds would turn a real,
/// reportable answer into a pause followed by the same answer.
fn is_transient(error: &std::io::Error) -> bool {
    // 32 ERROR_SHARING_VIOLATION, 33 ERROR_LOCK_VIOLATION, 145 ERROR_DIR_NOT_EMPTY — the last
    // shows up when a directory is emptied while something is still writing into it.
    const WINDOWS_BUSY: [i32; 3] = [32, 33, 145];
    matches!(error.kind(), std::io::ErrorKind::PermissionDenied)
        || error
            .raw_os_error()
            .is_some_and(|code| WINDOWS_BUSY.contains(&code))
}

/// Runs a filesystem operation, retrying while it fails for a reason that clears on its own.
///
/// Backs off from a millisecond, doubling to a quarter-second ceiling, and stops at
/// [`RETRY_BUDGET`]. No jitter: that exists to decorrelate several contenders retrying in step,
/// and there is only ever one of this app.
///
/// Anything that is not [`is_transient`] comes straight back on the first attempt.
fn retrying<T>(mut operation: impl FnMut() -> std::io::Result<T>) -> std::io::Result<T> {
    let deadline = Instant::now() + RETRY_BUDGET;
    let mut wait = RETRY_FIRST_WAIT;
    loop {
        match operation() {
            Ok(value) => return Ok(value),
            Err(error) => {
                if !is_transient(&error) || Instant::now() + wait >= deadline {
                    return Err(error);
                }
                std::thread::sleep(wait);
                wait = (wait * 2).min(RETRY_MAX_WAIT);
            }
        }
    }
}

/// How deep [`normalize_ini_extensions`] will walk. Mod folders are a couple of levels at most —
/// this only exists so a symlink or junction pointing back up its own tree cannot spin forever.
const MAX_NORMALIZE_DEPTH: usize = 16;

/// Renames every `.ini` whose extension is not already lowercase, and reports how many changed.
///
/// 3DMigoto picks ini files out of its recursive scan with a case-*sensitive* comparison against
/// `.ini` — unlike the `exclude_recursive` patterns a few lines above it in the same loop, which
/// are matched case-insensitively. So a mod shipping `NicoleBH.INI` installs cleanly, appears in
/// the library, toggles on, and sits in a folder with no `DISABLED_` prefix — every signal the app
/// can give says it is working — while the game never loads it and nothing says why.
///
/// Renaming the extension into the form the loader insists on is the same kind of change as
/// adding the `DISABLED_` prefix: it makes the folder on disk mean what the app says it means.
/// Only the extension is touched, because the loader compares the last four characters and
/// nothing else — a mod's own capitalisation of its name is left alone.
///
/// A file that cannot be renamed is skipped rather than failing the install: a mod that is on
/// disk and otherwise working must not be undone by one stubborn file.
///
/// Deliberately silent in the UI. Import already drops a mod's wrapper folder, copies a loose
/// preview inside it and applies the `DISABLED_` prefix without announcing any of it, because
/// they are all just "make the installed mod correct" — and this is the same. XXMI puts its own
/// repairs in front of the user, but those involve a real choice (disable this whole mod?
/// comment out lines that change how it renders?); there is no choice to offer here, since
/// nobody wants their mod inert. It logs instead, so the change is discoverable but not noise.
pub fn normalize_ini_extensions(dir: &Path) -> usize {
    let renamed = normalize_ini_extensions_at(dir, 0);
    if renamed > 0 {
        println!(
            "renamed {renamed} ini file(s) to a lowercase extension in {} so the game will load them",
            dir.display()
        );
    }
    renamed
}

fn normalize_ini_extensions_at(dir: &Path, depth: usize) -> usize {
    if depth > MAX_NORMALIZE_DEPTH {
        return 0;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return 0;
    };

    let mut renamed = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            renamed += normalize_ini_extensions_at(&path, depth + 1);
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        // Split off the last four bytes only where that lands on a character boundary, so a name
        // ending in a multi-byte character cannot panic the walk.
        let Some(split) = name.len().checked_sub(4) else {
            continue;
        };
        if !name.is_char_boundary(split) {
            continue;
        }
        let (stem, extension) = name.split_at(split);
        if extension == ".ini" || !extension.eq_ignore_ascii_case(".ini") {
            continue;
        }
        let target = path.with_file_name(format!("{stem}.ini"));
        // The two names differ only in the case of those four bytes, so on Windows they are the
        // same file and a bare `exists()` check would refuse every rename this function is for.
        // Compare what each name actually resolves to, and stand aside only for a genuinely
        // different file — which needs a case-sensitive share to happen at all.
        let target_is_another_file = match (fs::canonicalize(&target), fs::canonicalize(&path)) {
            (Ok(existing), Ok(source)) => existing != source,
            _ => false,
        };
        if target_is_another_file {
            continue;
        }
        if fs::rename(&path, &target).is_ok() {
            renamed += 1;
        }
    }
    renamed
}

/// Moves a mod folder, falling back to a copy when a plain rename cannot do it.
///
/// `fs::rename` is the whole job on one volume and refuses across two, which is not exotic here:
/// a mods folder on a second drive is a normal way to run this. The fallback copies and then
/// removes the original, and only removes it once the copy has succeeded — a half-moved mod that
/// still exists where it was is recoverable, one that exists nowhere is not.
pub fn move_dir(from: &Path, to: &Path) -> Result<(), FsOpsError> {
    if retrying(|| fs::rename(from, to)).is_ok() {
        return Ok(());
    }
    copy_dir_recursive(from, to)?;
    retrying(|| fs::remove_dir_all(from))?;
    Ok(())
}

/// Removes a mod's folder from disk entirely. Does not touch the DB row — callers
/// are expected to also call `Db::delete_mod` once this succeeds.
pub fn delete_mod_files(m: &Mod) -> std::io::Result<()> {
    let path = PathBuf::from(&m.folder_path);
    if path.exists() {
        retrying(|| fs::remove_dir_all(&path))?;
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

    retrying(|| fs::rename(current_dir, &backup_dir))?;

    if let Err(swap_error) = retrying(|| fs::rename(staging_dir, current_dir)) {
        // Roll back before surfacing the error — a failed swap must never leave the mod's
        // folder missing. But the rollback itself can fail too (transient lock, AV scan,
        // permissions), and that must not be silently swallowed: the mod's real files would
        // still be safe at `backup_dir`, just not where anything else expects them.
        if let Err(rollback_error) = retrying(|| fs::rename(&backup_dir, current_dir)) {
            return Err(FsOpsError::SwapAndRollbackFailed {
                backup_dir,
                swap_error,
                rollback_error,
            });
        }
        return Err(FsOpsError::Io(swap_error));
    }

    let _ = retrying(|| fs::remove_dir_all(&backup_dir));
    Ok(())
}

/// Recursively copies `src`'s contents into `dst`, creating `dst` if needed. Used by
/// `commands::import::place_mods` when the source is a folder the user pointed at rather than
/// an archive the app unpacked — theirs stays where it is, so it is copied and not moved.
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

    /// The failure this change exists to remove. XXMI's ini optimizer disables mods by renaming
    /// their folders, on every game launch, with no way to tell this app. The old code recorded
    /// the mod's path in the database and checked *that* path existed, so after XXMI had renamed
    /// it every toggle returned `ModFolderMissing` — and the library offered to remove a mod
    /// whose files were sitting right there under the other name.
    #[test]
    fn toggling_still_works_after_another_program_renamed_the_folder() {
        let root = temp_dir("external-rename");
        let db = Db::open_in_memory().unwrap();
        let canonical = root.join("pinkdress");
        let m = insert_mod_with_folder(&db, "belle", Slot::CharacterSkin, &canonical);
        set_mod_enabled(&db, m.id, true).unwrap();
        assert!(canonical.is_dir());

        // XXMI switches it off behind the app's back.
        fs::rename(&canonical, disabled_path(&canonical)).unwrap();
        let after_rename = db.get_mod(m.id).unwrap().unwrap();
        assert!(!after_rename.files_missing, "off is not the same as gone");
        assert!(!after_rename.enabled);

        // Turning it back on finds the folder under the name XXMI gave it.
        set_mod_enabled(&db, m.id, true).unwrap();
        assert!(canonical.is_dir(), "the mod is back under its enabled name");
        assert!(db.get_mod(m.id).unwrap().unwrap().enabled);

        // And asking for a state the disk is already in is a no-op, not an error.
        set_mod_enabled(&db, m.id, true).unwrap();
        assert!(canonical.is_dir());

        fs::remove_dir_all(&root).unwrap();
    }

    /// 3DMigoto's recursive scan compares the last four characters of a filename against `.ini`
    /// with `wcscmp`, so an uppercase extension is simply never collected. A mod shipping one
    /// installs and reads as enabled everywhere in this app while the game ignores it.
    #[test]
    fn ini_extensions_are_lowercased_so_the_loader_actually_sees_them() {
        let root = temp_dir("normalize-ini");
        fs::create_dir_all(root.join("Variants")).unwrap();
        fs::write(root.join("NicoleBH.INI"), b"").unwrap();
        fs::write(root.join("Variants/Nsfw.Ini"), b"").unwrap();
        fs::write(root.join("Nicole.ini"), b"").unwrap();
        fs::write(root.join("ReadMe.TXT"), b"").unwrap();

        let renamed = normalize_ini_extensions(&root);

        assert_eq!(renamed, 2, "only the two miscased inis should have moved");
        // Checked against the real directory listing, not `exists()`: on Windows the old spelling
        // still "exists" after the rename, because it resolves to the very file we renamed.
        let listed: Vec<String> = fs::read_dir(&root)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert!(
            listed.contains(&"NicoleBH.ini".to_string()),
            "on-disk name should now be lowercase, got {listed:?}"
        );
        assert!(
            root.join("Variants/Nsfw.ini").is_file(),
            "a variant folder is part of the mod, so the walk has to reach it"
        );
        assert!(
            root.join("Nicole.ini").is_file(),
            "an already-lowercase ini is left exactly as it is"
        );
        assert!(
            root.join("ReadMe.TXT").is_file(),
            "nothing but the ini extension is this function's business"
        );

        // Installers call it on every install, so a second pass must find nothing left to do.
        assert_eq!(normalize_ini_extensions(&root), 0);

        fs::remove_dir_all(&root).unwrap();
    }

    /// Short names have no four-byte extension to split off, and a name ending in a multi-byte
    /// character must not be split mid-character. Both would panic a naive implementation.
    #[test]
    fn normalizing_survives_names_too_short_or_not_on_a_character_boundary() {
        let root = temp_dir("normalize-edge");
        fs::write(root.join("a"), b"").unwrap();
        fs::write(root.join("ini"), b"").unwrap();
        fs::write(root.join("ニコ.INI"), b"").unwrap();
        fs::write(root.join("モデル名"), b"").unwrap();

        let renamed = normalize_ini_extensions(&root);

        assert_eq!(renamed, 1, "only the real miscased ini should have moved");
        assert!(root.join("ニコ.ini").is_file());
        assert!(root.join("a").is_file());
        assert!(root.join("ini").is_file(), "a bare `ini` is not an extension");
        assert!(root.join("モデル名").is_file());

        fs::remove_dir_all(&root).unwrap();
    }

    fn busy_error() -> std::io::Error {
        // ERROR_SHARING_VIOLATION — what Windows returns while another process holds the file.
        std::io::Error::from_raw_os_error(32)
    }

    /// The everyday case: Defender or XXMI has the folder for a moment, then lets go.
    #[test]
    fn a_busy_file_is_retried_until_whatever_held_it_lets_go() {
        let mut attempts = 0;
        let result = retrying(|| {
            attempts += 1;
            if attempts < 4 {
                Err(busy_error())
            } else {
                Ok("renamed")
            }
        });

        assert_eq!(result.unwrap(), "renamed");
        assert_eq!(attempts, 4, "it should have kept trying, not given up at one");
    }

    /// A missing path is an answer, not a delay. `ModFolderMissing` is built on it, so retrying
    /// would turn something worth reporting into two seconds of nothing and then the same result.
    #[test]
    fn a_missing_path_comes_back_immediately_instead_of_being_retried() {
        let mut attempts = 0;
        let result = retrying(|| {
            attempts += 1;
            Err::<(), _>(std::io::Error::from(std::io::ErrorKind::NotFound))
        });

        assert!(result.is_err());
        assert_eq!(attempts, 1, "not-found must not be treated as busy");
    }

    /// Something holding the folder for good — the running game, most likely — has to end as a
    /// reported failure rather than an indefinite wait.
    #[test]
    fn a_file_that_never_frees_up_eventually_gives_up_and_reports_it() {
        let started = Instant::now();
        let mut attempts = 0;
        let result = retrying(|| {
            attempts += 1;
            Err::<(), _>(busy_error())
        });

        assert!(result.is_err());
        assert!(attempts > 1, "it should have tried more than once");
        assert!(
            started.elapsed() < RETRY_BUDGET * 2,
            "giving up must happen near the budget, not long after it"
        );
    }

    #[test]
    fn only_the_failures_that_clear_on_their_own_count_as_transient() {
        assert!(is_transient(&busy_error()));
        assert!(is_transient(&std::io::Error::from_raw_os_error(145)));
        assert!(is_transient(&std::io::Error::from(
            std::io::ErrorKind::PermissionDenied
        )));
        assert!(!is_transient(&std::io::Error::from(
            std::io::ErrorKind::NotFound
        )));
        assert!(!is_transient(&std::io::Error::from(
            std::io::ErrorKind::InvalidInput
        )));
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
            bundled_thumbnail: None,
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
