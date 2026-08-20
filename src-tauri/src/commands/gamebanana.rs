use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::Duration;

use serde::Serialize;
use tauri::State;

use std::sync::Mutex;

use crate::commands::mods::slugify_display_name;
use crate::db::{Bookmark, Db, Mod, NewBookmark, NewMod, Slot};
use crate::content_rating::MatureVisibility;
use crate::gamebanana::{
    GameBananaClient, GameBananaError, GbFeaturedMod, GbFile, GbModDetail, GbSearchResult, ModSort,
    ResumePoint,
};
use crate::{archive, fs_ops, AppState};

/// How often progress events are emitted at most, so a fast connection delivering many small
/// chunks doesn't flood the IPC channel with an event per chunk. Shared with
/// `commands::updates::update_installed_mod`, which reuses this same throttle and the
/// `InstallProgress` event payload below rather than duplicating either.
pub(crate) const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(150);

#[derive(Clone, Serialize)]
pub struct InstallProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

/// Under this, browsing feels immediate — the app is not the thing you are waiting on.
/// Measured live: the API answers in roughly 140ms on a warm connection and 0.4-0.9s cold,
/// so a cold first call must not read as a fault.
const API_GOOD_UNDER: Duration = Duration::from_millis(700);
/// Under this, browsing is visibly slow but still usable. Past it, it isn't.
const API_FAIR_UNDER: Duration = Duration::from_millis(2000);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub enum ApiHealth {
    Good,
    Fair,
    Poor,
}

/// What the sidebar's signal reports: how quickly GameBanana answered a browse request.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct ApiStatus {
    pub health: ApiHealth,
    /// `None` when the request never completed, which is the one case with no number to show.
    pub latency_ms: Option<u64>,
}

impl ApiStatus {
    fn from_latency(elapsed: Duration) -> Self {
        let health = if elapsed < API_GOOD_UNDER {
            ApiHealth::Good
        } else if elapsed < API_FAIR_UNDER {
            ApiHealth::Fair
        } else {
            ApiHealth::Poor
        };
        Self {
            health,
            latency_ms: Some(elapsed.as_millis() as u64),
        }
    }

    fn unreachable() -> Self {
        Self {
            health: ApiHealth::Poor,
            latency_ms: None,
        }
    }
}

/// Polled by the sidebar. Never returns `Err`: a probe that fails *is* the reading — "GameBanana
/// is not answering" is precisely what the lowest signal means — and erroring instead would
/// blank the indicator at the exact moment it has something to say.
#[tauri::command]
pub async fn check_gamebanana_api(state: State<'_, AppState>) -> Result<ApiStatus, String> {
    Ok(match state.gamebanana.check_health().await {
        Ok(elapsed) => ApiStatus::from_latency(elapsed),
        Err(_) => ApiStatus::unreachable(),
    })
}

#[tauri::command]
pub async fn search_gamebanana_mods(
    state: State<'_, AppState>,
    query: Option<String>,
    category_id: Option<i64>,
    sort: ModSort,
    page: u32,
) -> Result<GbSearchResult, String> {
    let visibility_pref = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_mature_content_visibility()
            .map_err(|e| e.to_string())?
    };

    let result = state
        .gamebanana
        .search_mods(query.as_deref(), category_id, sort, page)
        .await
        .map_err(|e| e.to_string())?;

    Ok(crate::content_rating::apply_visibility(
        result,
        visibility_pref,
    ))
}

/// The featured banner's six slides: the top mod of the day, week, month, half-year, year and
/// all time.
///
/// Under `Hide` the preference is pushed down into the pick rather than applied to its result.
/// Filtering afterwards discarded the whole window along with its winner, which left the band
/// showing a single slide; each window offers several ranked candidates, so the next one down
/// can take the place instead. A window is lost only when none of its candidates qualify, and
/// with GameBanana's ZZZ charts as mature as they are that is most of them — the band is
/// genuinely short under `Hide`, and how short depends on the day. GameBanana's own site shows
/// the same handful.
///
/// The slides that remain are still true to their headline: "top this week" means top among the
/// mods this user has asked to see, the same reading the Browse grid already uses.
#[tauri::command]
pub async fn get_featured_mods(state: State<'_, AppState>) -> Result<Vec<GbFeaturedMod>, String> {
    let visibility_pref = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_mature_content_visibility()
            .map_err(|e| e.to_string())?
    };

    state
        .gamebanana
        .get_featured_mods(visibility_pref == MatureVisibility::Hide)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_gamebanana_mod_detail(
    state: State<'_, AppState>,
    mod_id: i64,
) -> Result<GbModDetail, String> {
    state
        .gamebanana
        .get_mod_detail(mod_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_bookmarks(state: State<AppState>) -> Result<Vec<Bookmark>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_bookmarks().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_bookmark(
    state: State<AppState>,
    gamebanana_mod_id: i64,
    name: String,
    thumbnail_url: Option<String>,
    // The mod's most specific GameBanana category, so the Bookmarks page can shelve it the way
    // the library does. Optional because not every screen that offers a bookmark knows it, and
    // a bookmark is worth saving either way — `backfill_bookmark_characters` fills the gaps.
    category_name: Option<String>,
) -> Result<Bookmark, String> {
    let character_id = category_name
        .as_deref()
        .and_then(crate::characters::character_id_for_category);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_bookmark(NewBookmark {
        gamebanana_mod_id,
        name,
        thumbnail_url,
        character_id,
    })
    .map_err(|e| e.to_string())
}

/// Works out which character the already-saved bookmarks belong to.
///
/// Bookmarks predate the column, so without this the page would show a wall of "Unsorted" until
/// every one of them happened to be re-saved. One GameBanana request each, run once — the rows
/// it fills stop being candidates, so a second run is a no-op and costs nothing.
///
/// Returns how many it placed. A mod whose category the roster does not recognise stays null and
/// will be retried on a later run, which is cheap and eventually right if the roster gains a row.
#[tauri::command]
pub async fn backfill_bookmark_characters(state: State<'_, AppState>) -> Result<usize, String> {
    let pending = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.list_bookmarks_missing_character()
            .map_err(|e| e.to_string())?
    };

    let mut placed = 0;
    for bookmark in pending {
        // One failure must not abandon the rest: a mod taken down since it was bookmarked would
        // otherwise stop every later one from ever being placed.
        let Ok(detail) = state
            .gamebanana
            .get_mod_detail(bookmark.gamebanana_mod_id)
            .await
        else {
            continue;
        };
        let Some(character_id) =
            crate::characters::character_id_for_category(&detail.category.name)
        else {
            continue;
        };
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.set_bookmark_character(bookmark.gamebanana_mod_id, &character_id)
            .map_err(|e| e.to_string())?;
        placed += 1;
    }
    Ok(placed)
}

#[tauri::command]
pub fn remove_bookmark(state: State<AppState>, gamebanana_mod_id: i64) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.remove_bookmark(gamebanana_mod_id)
        .map_err(|e| e.to_string())
}

/// What to install and where to file it — bundled into one struct so the function below
/// stays under clippy's argument-count limit.
pub(crate) struct InstallRequest<'a> {
    pub gamebanana_mod_id: i64,
    pub gamebanana_file_id: i64,
    pub character_id: &'a str,
    pub slot: Slot,
    pub display_name: &'a str,
    pub staging: Staging,
}

/// Where the archive is staged on its way in, and how much of it is already there.
///
/// Nothing here is deleted by the install. Whoever chose the path owns it, because only they know
/// whether a stopped transfer is meant to be kept or thrown away — the install cannot tell a pause
/// from a cancel, since both reach it as the same abandoned transfer.
pub(crate) struct Staging {
    pub path: PathBuf,
    /// Bytes at `path` the transfer may continue from, and the validator they were served with.
    /// Zero starts clean regardless of what the file holds.
    pub resume_from: u64,
    pub etag: Option<String>,
}

/// Names the staging file for a download row.
///
/// Keyed on the row id rather than a random suffix, which is the whole basis of resume: a paused
/// transfer has to be findable again by whatever picks it up, possibly in a later run of the app.
/// The file name is appended only so a half-finished download is recognisable to anyone who opens
/// their temp folder.
///
/// That name comes from GameBanana, so it is scrubbed to plain characters first — interpolating a
/// remote string straight into a path is how a file called `..\..\something` ends up written
/// outside the folder that was meant to hold it. The fixed prefix does the rest of the work: the
/// result is always a single path component, and can never itself be `..`.
/// Finds one file on a mod, racing the lookup against the stop flag.
///
/// Shared by installing and reinstalling because it is the same question either way, and because
/// the race matters equally to both: this lookup is one of the two awaits standing between
/// pressing a button and the first byte, and a transfer nobody can abandon while it is still
/// starting was the original complaint that put the race here.
pub(crate) async fn fetch_gamebanana_file(
    gamebanana: &GameBananaClient,
    gamebanana_mod_id: i64,
    gamebanana_file_id: i64,
    should_stop: &impl Fn() -> bool,
) -> Result<ChosenFile, String> {
    let detail = tokio::select! {
        found = gamebanana.get_mod_detail(gamebanana_mod_id) => found.map_err(|e| e.to_string())?,
        _ = crate::gamebanana::wait_for_stop(should_stop) => {
            return Err(GameBananaError::Cancelled.to_string())
        }
    };

    let file = detail
        .files
        .iter()
        .find(|f| f.id == gamebanana_file_id)
        .ok_or_else(|| format!("file {gamebanana_file_id} not found on mod {gamebanana_mod_id}"))?
        .clone();
    // Computed here because this is where the mod's whole file list is in hand: naming which
    // variant this is needs to know what the alternatives were.
    let variant_label = crate::variant_label::variant_label(&detail.files, &file);
    Ok(ChosenFile {
        file,
        variant_label,
    })
}

/// A file picked out of a mod's list, with the label saying which one of them it is.
pub(crate) struct ChosenFile {
    pub file: GbFile,
    /// `None` when the mod ships one file, or when nothing about this one reads as a name.
    pub variant_label: Option<String>,
}

/// Pulls a file down to its staged path, resuming from whatever is already there.
///
/// Shared for the same reason as the lookup above: installing and reinstalling fetch identically,
/// and only differ in what they do with the archive afterwards. Nothing here deletes the staged
/// file — whoever owns the path decides that, since only they can tell a pause from a failure.
pub(crate) async fn download_to_staging(
    gamebanana: &GameBananaClient,
    file: &GbFile,
    staging: &Staging,
    on_validator: impl FnOnce(Option<&str>),
    on_progress: impl FnMut(u64, Option<u64>) -> bool,
    should_stop: &impl Fn() -> bool,
) -> Result<(), String> {
    gamebanana
        .download_file(
            &file.download_url,
            &staging.path,
            ResumePoint {
                have: staging.resume_from,
                etag: staging.etag.as_deref(),
            },
            on_validator,
            on_progress,
            should_stop,
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn staging_path(download_id: i64, file_name: &str) -> PathBuf {
    let safe: String = file_name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    std::env::temp_dir().join(format!("ether-manager-download-{download_id}-{safe}"))
}

/// Core install logic, kept free of `State`/`Db` so it's directly unit-testable against the
/// live API without a mock Tauri app. Downloads the given GameBanana file to `request.staging`
/// (never straight into `dest_dir`, so a failed or partial download never leaves a half-installed
/// folder under the character/slot tree) and extracts it in place.
///
/// `on_extract_start` fires between the two phases. Extraction reports no progress of its own, so
/// without this the caller cannot tell a large archive being unpacked from a download that has
/// stalled at 100% — they look identical from outside. `on_validator` fires earlier still, as soon
/// as the response headers land, so a transfer that is later paused has recorded which version of
/// the file its bytes came from.
///
/// The staging file is left where it is on every exit path, success included. Deleting it is the
/// caller's job: only the caller knows whether an abandoned transfer was paused, and is worth
/// keeping, or cancelled.
async fn download_and_extract_gamebanana_file(
    gamebanana: &GameBananaClient,
    mods_root: &Path,
    request: InstallRequest<'_>,
    on_validator: impl FnOnce(Option<&str>),
    on_progress: impl FnMut(u64, Option<u64>) -> bool,
    on_extract_start: impl FnOnce(),
    should_stop: impl Fn() -> bool,
// Returns where it landed, which file it was, and which of the mod's files that is in words.
) -> Result<(PathBuf, GbFile, Option<String>), String> {
    let InstallRequest {
        gamebanana_mod_id,
        gamebanana_file_id,
        character_id,
        // The slot is still recorded on the row — it drives the UI and Misc tabs — but it no
        // longer names a folder, so nothing on the extract path needs it.
        slot: _,
        display_name,
        staging,
    } = request;

    let chosen = fetch_gamebanana_file(
        gamebanana,
        gamebanana_mod_id,
        gamebanana_file_id,
        &should_stop,
    )
    .await?;

    let character_dir =
        fs_ops::ensure_mod_home_dir(mods_root, character_id).map_err(|e| e.to_string())?;
    // A mod arrives switched off, so it is extracted straight into the DISABLED_ spelling of its
    // folder. A clean name would hand the mod to the game the instant the download finished,
    // before anyone had chosen to turn it on. `insert_mod` stores the canonical spelling of this
    // same path — the database has no opinion about which mods are on.
    let canonical_dir = fs_ops::unique_mod_dir(&character_dir, &slugify_display_name(display_name));
    let dest_dir = fs_ops::disabled_path(&canonical_dir);

    download_to_staging(
        gamebanana,
        &chosen.file,
        &staging,
        on_validator,
        on_progress,
        &should_stop,
    )
    .await?;
    on_extract_start();
    archive::extract_archive(&staging.path, &dest_dir).map_err(|e| e.to_string())?;

    Ok((dest_dir, chosen.file, chosen.variant_label))
}

/// Downloads a specific GameBanana file, extracts it into the given character/slot, and
/// records it as an installed mod — the GameBanana counterpart to `commands::import`.
/// `character_id`/`slot`/`display_name` are assumed already confirmed by the user (the auto
/// slot guess is only ever a suggestion, never applied silently — see the Milestone 2 plan's
/// Assumption 2); this runs the install once that confirmation happened.
///
/// Not a `#[tauri::command]`: the frontend never installs directly anymore. Every install goes
/// through the download queue (`commands::downloads`), which owns this call so that an install
/// survives the dialog being closed and has somewhere to report a failure to. Taking the pieces
/// of `AppState` rather than `State` is what lets the queue's spawned task call it — a
/// `State<'_, _>` borrow cannot be moved into a task.
pub(crate) async fn install_gamebanana_file(
    gamebanana: &GameBananaClient,
    db: &Mutex<Db>,
    request: InstallRequest<'_>,
    on_validator: impl FnOnce(Option<&str>),
    on_progress: impl FnMut(u64, Option<u64>) -> bool,
    on_extract_start: impl FnOnce(),
    should_stop: impl Fn() -> bool,
) -> Result<Mod, String> {
    let (gamebanana_mod_id, gamebanana_file_id) =
        (request.gamebanana_mod_id, request.gamebanana_file_id);
    let (character_id, slot, display_name) = (
        request.character_id.to_string(),
        request.slot,
        request.display_name.to_string(),
    );

    let mods_folder = {
        let db = db.lock().map_err(|e| e.to_string())?;
        db.get_setting("mods_folder")
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "mods folder is not set yet".to_string())?
    };
    let mods_root = PathBuf::from(mods_folder);

    let (dest_dir, file, variant_label) = download_and_extract_gamebanana_file(
        gamebanana,
        &mods_root,
        request,
        on_validator,
        on_progress,
        on_extract_start,
        should_stop,
    )
    .await?;
    let state = InstallRecording {
        gamebanana,
        db,
        gamebanana_mod_id,
        gamebanana_file_id,
    };
    record_installed_mod(
        state,
        dest_dir,
        file,
        character_id,
        slot,
        display_name,
        variant_label,
    )
    .await
}

/// The handful of things `record_installed_mod` needs, grouped to stay under clippy's
/// argument-count limit.
struct InstallRecording<'a> {
    gamebanana: &'a GameBananaClient,
    db: &'a Mutex<Db>,
    gamebanana_mod_id: i64,
    gamebanana_file_id: i64,
}

async fn record_installed_mod(
    recording: InstallRecording<'_>,
    dest_dir: PathBuf,
    file: GbFile,
    character_id: String,
    slot: Slot,
    display_name: String,
    variant_label: Option<String>,
) -> Result<Mod, String> {
    let InstallRecording {
        gamebanana,
        db,
        gamebanana_mod_id,
        gamebanana_file_id,
    } = recording;

    // One extra request against a mod we just pulled megabytes from: the preview image only
    // appears on the detail endpoint, not on the file list the download used. A mod with no
    // preview — or a hiccup fetching it — must never fail an install that already succeeded,
    // so this degrades to None and the card shows its "no preview" state.
    let thumbnail_url = gamebanana
        .get_mod_detail(gamebanana_mod_id)
        .await
        .ok()
        .and_then(|detail| detail.preview_media.thumbnail_url());

    let db = db.lock().map_err(|e| e.to_string())?;
    db.insert_mod(NewMod {
        character_id,
        slot,
        display_name,
        folder_path: dest_dir.to_string_lossy().to_string(),
        thumbnail_url,
        gamebanana_mod_id: Some(gamebanana_mod_id),
        gamebanana_file_id: Some(gamebanana_file_id),
        gamebanana_md5: Some(file.md5_checksum),
        variant_label,
        // GameBanana serves its own preview, so there is nothing to dig out of the archive.
        bundled_thumbnail: None,
    })
    .map_err(|e| e.to_string())
}

/// Fills in preview URLs for mods installed before the installer started storing them.
/// Costs one detail request per mod that is actually missing one and has a GameBanana id to
/// look it up with, so it settles to zero requests once every eligible mod has a preview and
/// is safe to run on every launch. Hand-added mods have no remote listing and are skipped
/// permanently. Returns how many rows were filled.
///
/// A mod that fails to fetch is skipped rather than aborting the run — one dead listing must
/// not stop the rest of the library from getting its previews.
#[tauri::command]
pub async fn backfill_mod_thumbnails(state: State<'_, AppState>) -> Result<usize, String> {
    // Collect first, then release the lock: the DB guard cannot be held across an await.
    let pending: Vec<(i64, i64)> = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.list_all_mods()
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter(|m| m.thumbnail_url.is_none())
            .filter_map(|m| m.gamebanana_mod_id.map(|gb_id| (m.id, gb_id)))
            .collect()
    };

    let mut filled = 0;
    for (mod_id, gb_mod_id) in pending {
        let Ok(detail) = state.gamebanana.get_mod_detail(gb_mod_id).await else {
            continue;
        };
        let Some(url) = detail.preview_media.thumbnail_url() else {
            continue;
        };
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.set_thumbnail_url(mod_id, &url).map_err(|e| e.to_string())?;
        filled += 1;
    }
    Ok(filled)
}

/// Signals the in-flight `updates::update_installed_mod` call (if any) to abort. A no-op if no
/// update is currently running (e.g. the user double-clicks cancel, or it already finished).
///
/// Only the update flow uses this now — installs moved to the download queue, which owns a
/// stop flag per download (`AppState::download_stops`) because a single shared slot made
/// the first of two concurrent jobs uncancellable.
#[tauri::command]
pub fn cancel_gamebanana_install(state: State<AppState>) -> Result<(), String> {
    let guard = state.install_cancel.lock().map_err(|e| e.to_string())?;
    if let Some(flag) = guard.as_ref() {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// "Compact Damage Numbers" — a real, small (~178KB) ZZZ mod zip, kept fast for CI.
    const SAMPLE_MOD_ID: i64 = 645291;
    const SAMPLE_FILE_ID: i64 = 1776071;

    #[test]
    fn each_band_of_latency_reports_its_own_signal() {
        let health = |ms| ApiStatus::from_latency(Duration::from_millis(ms)).health;

        assert_eq!(health(140), ApiHealth::Good, "a warm call is not a warning");
        assert_eq!(health(650), ApiHealth::Good, "a cold call is still fine");
        assert_eq!(health(700), ApiHealth::Fair, "the boundary is exclusive");
        assert_eq!(health(1_900), ApiHealth::Fair);
        assert_eq!(health(2_000), ApiHealth::Poor);
        assert_eq!(health(31_000), ApiHealth::Poor);
    }

    /// The one reading with no number behind it — the row has to render without a latency to
    /// show, rather than falling back to a misleading zero.
    #[test]
    fn a_probe_that_never_answered_reports_no_latency_at_all() {
        let status = ApiStatus::unreachable();

        assert_eq!(status.health, ApiHealth::Poor);
        assert_eq!(status.latency_ms, None);
    }

    #[test]
    fn a_measured_probe_always_carries_its_latency() {
        let status = ApiStatus::from_latency(Duration::from_millis(2_500));

        assert_eq!(status.health, ApiHealth::Poor);
        assert_eq!(
            status.latency_ms,
            Some(2_500),
            "slow is not the same as unreachable, and the number is what separates them"
        );
    }

    #[tokio::test]
    async fn installs_a_real_small_zzz_mod_end_to_end() {
        let gamebanana = GameBananaClient::new();
        let mods_root =
            std::env::temp_dir().join(format!("ether-manager-install-test-{}", std::process::id()));

        // Keeps the real extension: `extract_archive` chooses its extractor from it, which is why
        // `staging_path` preserves dots when it scrubs a remote file name.
        let staged = std::env::temp_dir().join(format!(
            "ether-manager-install-test-archive-{}.zip",
            std::process::id()
        ));

        let (dest_dir, file, _variant_label) = download_and_extract_gamebanana_file(
            &gamebanana,
            &mods_root,
            InstallRequest {
                gamebanana_mod_id: SAMPLE_MOD_ID,
                gamebanana_file_id: SAMPLE_FILE_ID,
                character_id: "belle",
                slot: Slot::CharacterSkin,
                display_name: "Compact Damage Numbers Test Install",
                staging: Staging {
                    path: staged.clone(),
                    resume_from: 0,
                    etag: None,
                },
            },
            |_| {},
            |_, _| false,
            || {},
            || false,
        )
        .await
        .unwrap();

        // Directly under the character, with no slot folder between — the slot is a property of
        // the row, not a place on disk.
        assert_eq!(
            dest_dir.parent(),
            Some(mods_root.join("Characters").join("belle").as_path())
        );
        assert!(dest_dir.exists());
        assert!(
            dest_dir.read_dir().unwrap().next().is_some(),
            "extracted mod folder must not be empty"
        );
        assert!(
            dest_dir
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("DISABLED_"),
            "a fresh install's folder must already be DISABLED_-prefixed on disk, matching the \
             disabled row insert_mod is about to create — otherwise XXMI would treat it as \
             active despite the app showing it as off"
        );
        assert_eq!(file.id, SAMPLE_FILE_ID);
        assert!(!file.md5_checksum.is_empty());
        assert!(
            staged.exists(),
            "the install must leave the staging file alone — deleting it is the caller's call, \
             since only the caller knows whether a stopped transfer was paused or abandoned"
        );

        std::fs::remove_file(&staged).unwrap();
        std::fs::remove_dir_all(&mods_root).unwrap();
    }

    /// A file name comes from GameBanana, and the staging path is built from it. Without the
    /// scrub, a name carrying separators would place the partial download outside the temp folder
    /// entirely — and resume made these paths predictable, which is exactly when that matters.
    #[test]
    fn a_staging_path_stays_one_component_inside_the_temp_folder() {
        let temp = std::env::temp_dir();

        for hostile in [
            "..\\..\\Windows\\System32\\evil.dll",
            "../../etc/passwd",
            "..",
            "sub/dir/mod.zip",
        ] {
            let path = staging_path(7, hostile);
            assert_eq!(
                path.parent(),
                Some(temp.as_path()),
                "{hostile:?} escaped the temp folder as {path:?}"
            );
            assert!(path
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("ether-manager-download-7-"));
        }
    }

    /// The id has to survive into the name, or two downloads would stage on top of each other and
    /// resume would pick up someone else's bytes.
    #[test]
    fn staging_paths_differ_per_download_row() {
        assert_ne!(
            staging_path(1, "mod.zip"),
            staging_path(2, "mod.zip"),
            "two rows staging to the same path would corrupt each other"
        );
        assert_eq!(
            staging_path(1, "mod.zip"),
            staging_path(1, "mod.zip"),
            "the path must be stable across calls, or a paused transfer could never be found again"
        );
    }
}
