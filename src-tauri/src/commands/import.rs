//! Bringing in a mod the app did not download.
//!
//! Plenty of mods never touch GameBanana — they arrive as a `.zip` from a Patreon post, a
//! Discord attachment, or a folder someone already unpacked. The app's job for those is the
//! part a person would otherwise do by hand: look inside, work out what is in there and who it
//! is for, and put it where the library expects to find it.
//!
//! It runs in two halves on purpose. `begin_import` unpacks somewhere disposable and reports
//! what it found; nothing is filed until `commit_import`, and `cancel_import` throws the whole
//! thing away. That split is what lets the app show you a pack's five variants and let you pick
//! two, rather than installing all five and making you delete three.
//!
//! Unpacking to a staging directory means an archive is written out once and then moved, rather
//! than read twice. Where the staging directory and the mods folder share a volume — the normal
//! case, since both default to the system drive — the move is a rename and costs nothing. The
//! alternative, listing an archive's entries to plan and then extracting only the chosen parts,
//! would need separate implementations for zip, 7z and rar, and would still have to unpack the
//! preview image to show it.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use super::mods::{is_known_character, slot_for, slugify_display_name, unique_variant_dir};
use super::unique_temp_id;
use crate::db::{Mod, NewMod};
use crate::import::ImportPlan;
use crate::{archive, fs_ops, import, AppState};

/// Extensions the archive reader handles. Matches `archive::extract_archive`'s own match arms.
const ARCHIVE_EXTENSIONS: [&str; 3] = ["zip", "7z", "rar"];

/// A preview shown before anything is installed crosses the bridge as base64, so it is capped.
/// Comfortably above any real preview, and far below what would be worth turning into a string.
const MAX_PREVIEW_BYTES: u64 = 8 * 1024 * 1024;

/// An import that has been unpacked and inspected but not yet filed.
pub struct ImportSession {
    /// The tree the plan's relative paths are relative to.
    tree_root: PathBuf,
    /// True when the app extracted this tree and therefore owns it: it can be moved out of, and
    /// must be deleted when the session ends. A folder the user pointed at belongs to them, so
    /// it is copied from and left exactly as it was.
    owns_tree: bool,
}

/// The session map, kept in `AppState`.
pub type ImportSessions = HashMap<u64, ImportSession>;

/// What `begin_import` hands back: an id to commit or cancel with, and what was found.
#[derive(Debug, Clone, Serialize)]
pub struct BegunImport {
    pub session_id: u64,
    /// The name of the file or folder the user picked, for the sheet to show.
    pub source_label: String,
    pub plan: ImportPlan,
}

/// One mod the user confirmed, out of what the plan offered.
#[derive(Debug, Clone, Deserialize)]
pub struct ImportSelection {
    /// Which candidate this is, by the `rel_path` the plan gave it.
    pub rel_path: String,
    pub display_name: String,
    pub character_id: String,
    /// The plan's suggestion, or `None` to install without card art. Passed back rather than
    /// looked up so the sheet can offer to drop a preview it guessed wrong about.
    pub preview_rel_path: Option<String>,
}

/// A mod placed on disk, waiting only to be recorded.
struct PlacedMod {
    character_id: String,
    display_name: String,
    folder_path: PathBuf,
    bundled_thumbnail: Option<String>,
}

/// The native file picker, filtered to the archives the app can read.
///
/// A command rather than the dialog plugin's JS binding, matching `pick_mods_folder` — the
/// frontend has no `@tauri-apps/plugin-dialog` dependency and does not need one for this.
#[tauri::command]
pub fn pick_mod_archive(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .add_filter("Mod archives", &ARCHIVE_EXTENSIONS)
        .blocking_pick_file()
        .map(|path| path.to_string())
}

/// Unpacks a dropped archive or reads a dropped folder, and reports what is in it.
///
/// Writes nothing outside a staging directory of its own, so abandoning the import costs the
/// user nothing. Extraction runs off the UI thread — a large `.7z` takes long enough that doing
/// it inline would freeze the window, which is the one thing `add_mod` never solved.
#[tauri::command]
pub async fn begin_import(state: State<'_, AppState>, path: String) -> Result<BegunImport, String> {
    let source = PathBuf::from(&path);
    if !source.exists() {
        return Err(format!("{path} is not there any more"));
    }

    let source_label = source
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let session_id = unique_temp_id();
    let is_dir = source.is_dir();
    if !is_dir && !is_supported_archive(&source) {
        return Err(format!(
            "{source_label} is not a mod — drop a .zip, .7z or .rar, or a folder"
        ));
    }

    let staging = staging_dir(session_id);
    let label_for_task = source_label.clone();
    let (tree_root, plan) = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let tree_root = if is_dir {
            source
        } else {
            archive::extract_archive(&source, &staging).map_err(|e| e.to_string())?;
            staging
        };
        let plan = import::plan_for(&tree_root, &label_for_task);
        Ok((tree_root, plan))
    })
    .await
    .map_err(|e| format!("unpacking did not finish: {e}"))??;

    state
        .import_sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(
            session_id,
            ImportSession {
                tree_root,
                owns_tree: !is_dir,
            },
        );

    Ok(BegunImport {
        session_id,
        source_label,
        plan,
    })
}

/// The preview image for one candidate, as a `data:` URL.
///
/// The sheet has to show a picture that is still sitting in a staging directory, which the
/// webview cannot reach. Handing over the bytes is simpler than widening the asset protocol's
/// scope to the temp folder for the lifetime of a dialog.
#[tauri::command]
pub fn read_import_preview(
    state: State<AppState>,
    session_id: u64,
    rel_path: String,
) -> Result<String, String> {
    let sessions = state.import_sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| "that import is no longer open".to_string())?;

    let path = resolve_inside(&session.tree_root, &rel_path)?;
    let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > MAX_PREVIEW_BYTES {
        return Err("that preview is too large to show".to_string());
    }

    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mime = match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        _ => "image/jpeg",
    };
    Ok(format!("data:{mime};base64,{}", base64(&bytes)))
}

/// Files the chosen mods into the library and records them.
///
/// Each mod's folder is lifted out of the tree on its own, which is what drops the wrapper
/// folder archives habitually carry: `Nicole-BottomHeavy/` becomes the mod's folder rather than
/// sitting one level inside it.
///
/// A failure part-way leaves what already went in — those mods are installed and recorded — and
/// keeps the session open, so the rest can be retried or thrown away. Silently rolling back
/// would mean deleting folders the user can already see in their library.
#[tauri::command]
pub async fn commit_import(
    state: State<'_, AppState>,
    session_id: u64,
    selections: Vec<ImportSelection>,
) -> Result<Vec<Mod>, String> {
    if selections.is_empty() {
        return Err("nothing was selected".to_string());
    }
    for selection in &selections {
        if selection.display_name.trim().is_empty() {
            return Err("a mod needs a name".to_string());
        }
        if !is_known_character(&selection.character_id) {
            return Err(format!(
                "{} is not a character or category",
                selection.character_id
            ));
        }
    }

    let mods_root = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        PathBuf::from(
            db.get_setting("mods_folder")
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "mods folder is not set yet".to_string())?,
        )
    };

    let (tree_root, owns_tree) = {
        let sessions = state.import_sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions
            .get(&session_id)
            .ok_or_else(|| "that import is no longer open".to_string())?;
        (session.tree_root.clone(), session.owns_tree)
    };

    let placed = tokio::task::spawn_blocking(move || {
        place_mods(&tree_root, owns_tree, &mods_root, &selections)
    })
    .await
    .map_err(|e| format!("installing did not finish: {e}"))??;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut installed = Vec::with_capacity(placed.len());
    for mod_on_disk in placed {
        installed.push(
            db.insert_mod(NewMod {
                slot: slot_for(&mod_on_disk.character_id),
                character_id: mod_on_disk.character_id,
                display_name: mod_on_disk.display_name,
                folder_path: mod_on_disk.folder_path.to_string_lossy().to_string(),
                thumbnail_url: None,
                gamebanana_mod_id: None,
                gamebanana_file_id: None,
                gamebanana_md5: None,
                variant_label: None,
                bundled_thumbnail: mod_on_disk.bundled_thumbnail,
            })
            .map_err(|e| e.to_string())?,
        );
    }
    drop(db);

    discard_session(&state, session_id)?;
    Ok(installed)
}

/// Throws away everything an unfinished import unpacked.
#[tauri::command]
pub fn cancel_import(state: State<AppState>, session_id: u64) -> Result<(), String> {
    discard_session(&state, session_id)
}

fn discard_session(state: &State<AppState>, session_id: u64) -> Result<(), String> {
    let session = state
        .import_sessions
        .lock()
        .map_err(|e| e.to_string())?
        .remove(&session_id);

    if let Some(session) = session {
        if session.owns_tree {
            // Best effort: the tree is in the temp folder, and a failure to remove it costs a
            // little disk until the OS sweeps it — not worth failing an otherwise good import.
            let _ = std::fs::remove_dir_all(&session.tree_root);
        }
    }
    Ok(())
}

/// Moves or copies each selected mod into its character's folder. No database and no `State`, so
/// it can run off the UI thread, and so it is testable on its own.
fn place_mods(
    tree_root: &Path,
    owns_tree: bool,
    mods_root: &Path,
    selections: &[ImportSelection],
) -> Result<Vec<PlacedMod>, String> {
    let mut placed = Vec::with_capacity(selections.len());

    for selection in selections {
        let source = resolve_inside(tree_root, &selection.rel_path)?;
        let character_dir = fs_ops::ensure_mod_home_dir(mods_root, &selection.character_id)
            .map_err(|e| e.to_string())?;

        // A mod arrives switched off, so the folder is created in its DISABLED_ spelling; a clean
        // name would be one the game loads before anyone asked it to. `insert_mod` stores the
        // canonical spelling of this same path.
        let canonical_dest =
            fs_ops::unique_mod_dir(&character_dir, &slugify_display_name(&selection.display_name));
        let dest = fs_ops::disabled_path(&canonical_dest);

        // Where the preview is has to be settled before the folder moves, since it may be inside.
        let preview = selection
            .preview_rel_path
            .as_deref()
            .map(|rel| resolve_inside(tree_root, rel))
            .transpose()?;
        let preview_inside = preview
            .as_ref()
            .map(|p| p.starts_with(&source))
            .unwrap_or(false);

        if owns_tree {
            fs_ops::move_dir(&source, &dest)
                .map_err(|e| format!("could not install {}: {e}", selection.display_name))?;
        } else {
            fs_ops::copy_dir_recursive(&source, &dest)
                .map_err(|e| format!("could not install {}: {e}", selection.display_name))?;
        }

        let bundled_thumbnail = match preview {
            None => None,
            // It travelled with the folder, so it is already in place — just say where.
            Some(preview) if preview_inside => preview
                .strip_prefix(&source)
                .ok()
                .map(to_forward_slashes),
            // It was loose beside the mod, so bring a copy along. Otherwise it would be left
            // behind in staging and deleted the moment the session closed.
            Some(preview) => copy_preview_into(&preview, &dest),
        };

        placed.push(PlacedMod {
            character_id: selection.character_id.clone(),
            display_name: selection.display_name.trim().to_string(),
            folder_path: dest,
            bundled_thumbnail,
        });
    }

    Ok(placed)
}

/// Copies a loose preview into the mod's own folder, returning its name there.
///
/// Failing to copy it is not failing to install: the mod is already on disk and works. It just
/// gets the same placeholder card as anything else without art.
fn copy_preview_into(preview: &Path, dest: &Path) -> Option<String> {
    let name = preview.file_name()?.to_string_lossy().to_string();
    let target = unique_variant_dir(dest, &name);
    std::fs::copy(preview, &target).ok()?;
    target.file_name().map(|n| n.to_string_lossy().to_string())
}

/// Joins a relative path from the frontend onto the tree, refusing anything that climbs out.
///
/// The relative paths originate in `import::plan_for`, but they cross to the webview and come
/// back, so they are input. Without this a crafted `../../..` would reach any folder the app can
/// write to — and this one both copies *from* and, on commit, deletes.
fn resolve_inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    if rel.is_empty() {
        return Ok(root.to_path_buf());
    }

    let mut resolved = root.to_path_buf();
    for part in rel.split('/').filter(|p| !p.is_empty() && *p != ".") {
        if part == ".." || part.contains('\\') {
            return Err(format!("{rel} is not a path inside this import"));
        }
        resolved.push(part);
    }
    if !resolved.starts_with(root) {
        return Err(format!("{rel} is not a path inside this import"));
    }
    Ok(resolved)
}

fn to_forward_slashes(path: &Path) -> String {
    path.components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/")
}

fn is_supported_archive(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| ARCHIVE_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn staging_dir(session_id: u64) -> PathBuf {
    std::env::temp_dir().join(format!("ether-manager-import-{session_id}"))
}

/// A base64 encoder, rather than a dependency for the one place the app needs one.
fn base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);

    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            chunk.get(1).copied().unwrap_or(0),
            chunk.get(2).copied().unwrap_or(0),
        ];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(ALPHABET[((n >> 18) & 63) as usize] as char);
        out.push(ALPHABET[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_dir(label: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ether-manager-commit-test-{label}-{n}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(root: &Path, rel: &str, contents: &[u8]) {
        let path = root.join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    fn selection(rel_path: &str, name: &str, preview: Option<&str>) -> ImportSelection {
        ImportSelection {
            rel_path: rel_path.to_string(),
            display_name: name.to_string(),
            character_id: "nicole-demara".to_string(),
            preview_rel_path: preview.map(|p| p.to_string()),
        }
    }

    #[test]
    fn the_archives_the_importer_accepts_are_told_apart_by_extension() {
        assert!(is_supported_archive(Path::new("mod.zip")));
        assert!(is_supported_archive(Path::new("mod.RAR")));
        assert!(is_supported_archive(Path::new("mod.7z")));
        assert!(!is_supported_archive(Path::new("mod_folder")));
        assert!(!is_supported_archive(Path::new("readme.txt")));
    }

    #[test]
    fn base64_matches_the_worked_examples_including_both_paddings() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
        assert_eq!(base64(&[0xff, 0xef, 0xfe]), "/+/+");
    }

    #[test]
    fn a_relative_path_that_climbs_out_of_the_tree_is_refused() {
        let root = Path::new("/tmp/tree");
        assert!(resolve_inside(root, "../secrets").is_err());
        assert!(resolve_inside(root, "mod/../../secrets").is_err());
        assert!(resolve_inside(root, "..\\secrets").is_err());
        assert_eq!(resolve_inside(root, "").unwrap(), root);
        assert_eq!(
            resolve_inside(root, "Nicole-BottomHeavy").unwrap(),
            root.join("Nicole-BottomHeavy")
        );
    }

    #[test]
    fn the_wrapper_folder_is_dropped_so_the_ini_lands_in_the_mods_own_folder() {
        let tree = temp_dir("wrapper-tree");
        let mods_root = temp_dir("wrapper-mods");
        write(&tree, "Nicole-BottomHeavy/NicoleBH.ini", b"");

        let placed = place_mods(
            &tree,
            true,
            &mods_root,
            &[selection("Nicole-BottomHeavy", "Nicole Bottom Heavy", None)],
        )
        .unwrap();

        assert_eq!(placed.len(), 1);
        assert!(
            placed[0].folder_path.join("NicoleBH.ini").is_file(),
            "the ini must sit directly in the mod's folder, not one level down"
        );
        assert!(
            placed[0]
                .folder_path
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("DISABLED_"),
            "a new mod starts disabled, and the folder has to say so"
        );
    }

    #[test]
    fn a_preview_loose_beside_the_mod_is_brought_along() {
        let tree = temp_dir("preview-tree");
        let mods_root = temp_dir("preview-mods");
        write(&tree, "NicoleAmillion/Nicole.ini", b"");
        write(&tree, "NicolePreview.png", b"pretend png");

        let placed = place_mods(
            &tree,
            true,
            &mods_root,
            &[selection(
                "NicoleAmillion",
                "Nicole Amillion",
                Some("NicolePreview.png"),
            )],
        )
        .unwrap();

        assert_eq!(
            placed[0].bundled_thumbnail.as_deref(),
            Some("NicolePreview.png")
        );
        assert!(
            placed[0].folder_path.join("NicolePreview.png").is_file(),
            "it would be deleted with the staging folder if it were left behind"
        );
    }

    #[test]
    fn a_preview_already_inside_the_mod_is_recorded_where_it_landed() {
        let tree = temp_dir("inside-tree");
        let mods_root = temp_dir("inside-mods");
        write(&tree, "NicoleAmillion/Nicole.ini", b"");
        write(&tree, "NicoleAmillion/preview.png", b"pretend png");

        let placed = place_mods(
            &tree,
            true,
            &mods_root,
            &[selection(
                "NicoleAmillion",
                "Nicole Amillion",
                Some("NicoleAmillion/preview.png"),
            )],
        )
        .unwrap();

        assert_eq!(placed[0].bundled_thumbnail.as_deref(), Some("preview.png"));
    }

    #[test]
    fn a_pack_installs_each_chosen_variant_into_its_own_folder() {
        let tree = temp_dir("pack-tree");
        let mods_root = temp_dir("pack-mods");
        write(&tree, "Pack/Red/Remielle.ini", b"");
        write(&tree, "Pack/Blue/Remielle.ini", b"");

        let placed = place_mods(
            &tree,
            true,
            &mods_root,
            &[
                selection("Pack/Red", "Remielle Red", None),
                selection("Pack/Blue", "Remielle Blue", None),
            ],
        )
        .unwrap();

        assert_eq!(placed.len(), 2);
        assert_ne!(placed[0].folder_path, placed[1].folder_path);
        assert!(placed[0].folder_path.join("Remielle.ini").is_file());
        assert!(placed[1].folder_path.join("Remielle.ini").is_file());
    }

    #[test]
    fn two_variants_sharing_a_name_do_not_collide_on_disk() {
        let tree = temp_dir("collide-tree");
        let mods_root = temp_dir("collide-mods");
        write(&tree, "Pack/Red/Remielle.ini", b"");
        write(&tree, "Pack/Blue/Remielle.ini", b"");

        let placed = place_mods(
            &tree,
            true,
            &mods_root,
            &[
                selection("Pack/Red", "Remielle", None),
                selection("Pack/Blue", "Remielle", None),
            ],
        )
        .unwrap();

        assert_ne!(placed[0].folder_path, placed[1].folder_path);
        assert!(placed[1].folder_path.join("Remielle.ini").is_file());
    }

    #[test]
    fn a_folder_the_user_pointed_at_is_copied_and_left_where_it_was() {
        let tree = temp_dir("borrowed-tree");
        let mods_root = temp_dir("borrowed-mods");
        write(&tree, "NicoleAmillion/Nicole.ini", b"");

        let placed = place_mods(
            &tree,
            false,
            &mods_root,
            &[selection("NicoleAmillion", "Nicole Amillion", None)],
        )
        .unwrap();

        assert!(placed[0].folder_path.join("Nicole.ini").is_file());
        assert!(
            tree.join("NicoleAmillion/Nicole.ini").is_file(),
            "the user's own folder must not be moved out from under them"
        );
    }
}
