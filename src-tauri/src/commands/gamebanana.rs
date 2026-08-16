use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::Duration;

use serde::Serialize;
use tauri::State;

use std::sync::Mutex;

use crate::commands::mods::{slugify_display_name, unique_variant_dir};
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
/// `Hide` drops mature winners outright rather than blurring them, matching `search_mods`. The
/// banner then shows fewer slides, which is the honest outcome — there is no second-place
/// fallback to promote, since GameBanana ranks these and this app does not.
#[tauri::command]
pub async fn get_featured_mods(state: State<'_, AppState>) -> Result<Vec<GbFeaturedMod>, String> {
    let visibility_pref = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_mature_content_visibility()
            .map_err(|e| e.to_string())?
    };

    let featured = state
        .gamebanana
        .get_featured_mods()
        .await
        .map_err(|e| e.to_string())?;

    Ok(match visibility_pref {
        MatureVisibility::Show | MatureVisibility::Blur => featured,
        MatureVisibility::Hide => featured
            .into_iter()
            .filter(|f| !f.record.is_mature)
            .collect(),
    })
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
) -> Result<Bookmark, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_bookmark(NewBookmark {
        gamebanana_mod_id,
        name,
        thumbnail_url,
    })
    .map_err(|e| e.to_string())
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
) -> Result<(PathBuf, GbFile), String> {
    let InstallRequest {
        gamebanana_mod_id,
        gamebanana_file_id,
        character_id,
        slot,
        display_name,
        staging,
    } = request;

    // Raced like the download itself: this lookup is the other await standing between pressing
    // install and the first byte, and a download nobody can abandon while it is still starting is
    // the complaint that put the race here.
    let detail = tokio::select! {
        found = gamebanana.get_mod_detail(gamebanana_mod_id) => found.map_err(|e| e.to_string())?,
        _ = crate::gamebanana::wait_for_stop(&should_stop) => {
            return Err(GameBananaError::Cancelled.to_string())
        }
    };

    let file = detail
        .files
        .into_iter()
        .find(|f| f.id == gamebanana_file_id)
        .ok_or_else(|| format!("file {gamebanana_file_id} not found on mod {gamebanana_mod_id}"))?;

    let slot_dir = fs_ops::ensure_character_slot_dir(mods_root, character_id, slot)
        .map_err(|e| e.to_string())?;
    // A newly inserted mod always starts disabled (see insert_mod) — extract straight into a
    // DISABLED_-prefixed folder so the disk matches that from the start, instead of a clean
    // name that XXMI would actually treat as active despite the app showing it as off.
    let base_name = fs_ops::to_disabled_name(&slugify_display_name(display_name));
    let dest_dir = unique_variant_dir(&slot_dir, &base_name);

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
    on_extract_start();
    archive::extract_archive(&staging.path, &dest_dir).map_err(|e| e.to_string())?;

    Ok((dest_dir, file))
}

/// Downloads a specific GameBanana file, extracts it into the given character/slot, and
/// records it as an installed mod — the GameBanana counterpart to `commands::mods::add_mod`.
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

    let (dest_dir, file) = download_and_extract_gamebanana_file(
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
    record_installed_mod(state, dest_dir, file, character_id, slot, display_name).await
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

        let (dest_dir, file) = download_and_extract_gamebanana_file(
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

        assert!(dest_dir.starts_with(mods_root.join("Characters").join("belle").join("Character Skin")));
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
