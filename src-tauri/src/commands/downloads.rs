use std::path::Path;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::gamebanana::{
    install_gamebanana_file, staging_path, InstallRequest, Staging, PROGRESS_EMIT_INTERVAL,
};
use crate::db::{Download, DownloadStatus, NewDownload, Slot};
use crate::AppState;

/// Downloads a file and swaps it into an existing mod's folder, leaving the row where it is.
///
/// The queue's counterpart to `install_gamebanana_file`: same fetch, same resume, same stop
/// flag, different ending. `folder_path`, `enabled` (including any `DISABLED_` prefix),
/// `display_name`, `character_id` and `slot` all survive untouched — only the folder's contents
/// and the file the row says it holds change.
///
/// The mod is re-read here rather than trusted from when the download was queued, because a
/// queued reinstall can sit behind others for minutes and the mod may have been deleted or moved
/// in the meantime. A row that has gone is an error, not something to recreate: the user asked to
/// replace a mod, and quietly installing a fresh copy instead is a different act.
#[allow(clippy::too_many_arguments)]
async fn reinstall_over_existing_mod(
    state: &AppState,
    target_mod_id: i64,
    download: &Download,
    staging: Staging,
    on_validator: impl FnOnce(Option<&str>),
    on_progress: impl FnMut(u64, Option<u64>) -> bool,
    on_extract_start: impl FnOnce(),
    should_stop: impl Fn() -> bool,
) -> Result<crate::db::Mod, String> {
    let existing = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.get_mod(target_mod_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("mod {target_mod_id} is no longer in the library"))?
    };
    let current_dir = std::path::PathBuf::from(&existing.folder_path);
    if !current_dir.exists() {
        return Err(format!(
            "{}: {}",
            crate::fs_ops::MOD_FOLDER_MISSING_PREFIX,
            current_dir.display()
        ));
    }

    let chosen = crate::commands::gamebanana::fetch_gamebanana_file(
        &state.gamebanana,
        download.gamebanana_mod_id,
        download.gamebanana_file_id,
        &should_stop,
    )
    .await?;
    let file = &chosen.file;

    crate::commands::gamebanana::download_to_staging(
        &state.gamebanana,
        file,
        &staging,
        on_validator,
        on_progress,
        &should_stop,
    )
    .await?;

    on_extract_start();
    crate::commands::updates::swap_archive_into_mod_folder(&current_dir, &staging.path)?;
    // Only now is the archive spent. Leaving it until after the swap means a failed extraction
    // does not also throw away the megabytes it would need to try again.
    let _ = std::fs::remove_file(&staging.path);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    // The label moves with the file, so a reinstall that lands on a different one of the mod's
    // archives relabels the row rather than leaving it describing what used to be there.
    db.set_gamebanana_file(
        target_mod_id,
        file.id,
        &file.md5_checksum,
        chosen.variant_label.as_deref(),
    )
    .map_err(|e| e.to_string())?;
    // The row now holds exactly what GameBanana offers, so any pending "update available" note
    // against it is stale — clearing it here is what stops the card keeping its badge.
    db.upsert_update_check(
        target_mod_id,
        &crate::updates::UpdateOutcome {
            status: crate::updates::UpdateStatus::UpToDate,
            reason: None,
            suggested_file_id: None,
            suggested_file_name: None,
            is_ambiguous: false,
        },
        None,
    )
    .map_err(|e| e.to_string())?;
    db.get_mod(target_mod_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("mod {target_mod_id} vanished immediately after being reinstalled"))
}

/// How often the byte count reaches the database while a transfer runs.
///
/// Far slower than the progress events, because nothing on screen reads the stored figure — it
/// exists so a transfer stopped without warning knows where to pick up. Two seconds costs a
/// handful of writes per download and caps what a hard kill can throw away at two seconds of
/// transfer rather than the whole thing.
const PROGRESS_PERSIST_INTERVAL: Duration = Duration::from_secs(2);

/// Why a running download was asked to stop.
///
/// Pause and cancel unwind through exactly the same path — the transfer layer reports both as an
/// abandoned transfer, indistinguishable from the outside — so the difference has to be recorded
/// before the unwinding starts. It decides two things once the dust settles: what the row says,
/// and whether the part-downloaded file is kept or deleted.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Stop {
    Running,
    Paused,
    Cancelled,
}

impl Stop {
    fn as_u8(self) -> u8 {
        match self {
            Stop::Running => 0,
            Stop::Paused => 1,
            Stop::Cancelled => 2,
        }
    }

    fn from_u8(value: u8) -> Self {
        match value {
            1 => Stop::Paused,
            2 => Stop::Cancelled,
            _ => Stop::Running,
        }
    }
}

/// Live byte counts for one download. Carries the id because several downloads can be on the
/// page at once — the older `gamebanana-install-progress` event has none, which was fine while
/// exactly one modal owned the only install in flight and is not fine now.
#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    pub id: i64,
    pub downloaded: u64,
    pub total: Option<u64>,
}

/// Marks the switch from downloading to unpacking. A separate event from `downloads-changed` so
/// it costs no refetch, and separate from progress because extraction has none to report.
#[derive(Clone, Serialize)]
struct DownloadPhase {
    id: i64,
}

/// Emitted whenever any download changes state. Deliberately payload-free: the frontend refetches
/// the list rather than patching a row, so there is exactly one description of the queue and it
/// is the database's.
const DOWNLOADS_CHANGED: &str = "downloads-changed";

fn notify_changed(app: &AppHandle) {
    let _ = app.emit(DOWNLOADS_CHANGED, ());
}

/// Records a download and starts working on it. Returns as soon as the row exists, which is what
/// lets the install dialog close immediately — the work outlives whatever asked for it.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn enqueue_download(
    app: AppHandle,
    state: State<'_, AppState>,
    gamebanana_mod_id: i64,
    gamebanana_file_id: i64,
    mod_name: String,
    file_name: String,
    thumbnail_url: Option<String>,
    character_id: String,
    slot: Slot,
    display_name: String,
    // When set, this download replaces that mod's files where they stand instead of adding a
    // second copy — a reinstall riding the same queue as a first install, so it gets the same
    // pausing, cancelling and crash recovery.
    target_mod_id: Option<i64>,
) -> Result<Download, String> {
    let download = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.enqueue_download(NewDownload {
            gamebanana_mod_id,
            gamebanana_file_id,
            mod_name,
            file_name,
            thumbnail_url,
            character_id,
            slot,
            display_name,
            target_mod_id,
        })
        .map_err(|e| e.to_string())?
    };

    notify_changed(&app);
    spawn_download(app, download.id);
    Ok(download)
}

#[tauri::command]
pub fn list_downloads(state: State<AppState>) -> Result<Vec<Download>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_downloads().map_err(|e| e.to_string())
}

/// Cancels a download whether it has started or not, and throws away what it fetched.
///
/// A running one is stopped by flipping its flag and letting the worker unwind, which is also
/// what cleans up the staging file. Anything not running is marked here — a queued one is
/// discarded when its turn comes, never opening a connection at all, and a paused one has a
/// staged file that must be deleted now because nothing will ever come back for it.
///
/// A download that has already finished is left exactly as it is. There is a real window for this:
/// the worker drops its flag before writing the final status, so a cancel arriving in that gap
/// finds nothing running and would otherwise stamp `Cancelled` over a completed install — leaving
/// the history denying a mod that is sitting in the library.
#[tauri::command]
pub fn cancel_download(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    let running = {
        let flags = state.download_stops.lock().map_err(|e| e.to_string())?;
        flags.get(&id).cloned()
    };

    match running {
        Some(flag) => flag.store(Stop::Cancelled.as_u8(), Ordering::Relaxed),
        None => {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let Some(download) = db.get_download(id).map_err(|e| e.to_string())? else {
                return Ok(());
            };
            if download.status.is_finished() {
                return Ok(());
            }
            discard_staging(&staging_path(id, &download.file_name));
            db.set_download_status(id, DownloadStatus::Cancelled, None)
                .map_err(|e| e.to_string())?;
        }
    }
    notify_changed(&app);
    Ok(())
}

/// Stops a download but keeps everything it has already fetched.
///
/// The staged bytes stay on disk and the row remembers how far they got, so resuming asks the
/// server for the rest rather than starting again. A download still waiting its turn pauses too —
/// it has nothing staged yet, but the point of pausing it is that it will not start.
///
/// Like cancelling, this leaves an already-finished download alone: pausing something that
/// completed a moment ago would move a finished install back into the queue as unfinished work.
#[tauri::command]
pub fn pause_download(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    let running = {
        let flags = state.download_stops.lock().map_err(|e| e.to_string())?;
        flags.get(&id).cloned()
    };

    match running {
        Some(flag) => flag.store(Stop::Paused.as_u8(), Ordering::Relaxed),
        None => {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let Some(download) = db.get_download(id).map_err(|e| e.to_string())? else {
                return Ok(());
            };
            if download.status.is_finished() {
                return Ok(());
            }
            db.set_download_status(id, DownloadStatus::Paused, None)
                .map_err(|e| e.to_string())?;
        }
    }
    notify_changed(&app);
    Ok(())
}

/// Puts a paused download back to work, continuing from the bytes already staged.
///
/// It rejoins at the back of the queue: arrival order is the only ordering this queue has, and
/// pressing resume is a fresh arrival. Unlike a retry, the byte count and validator survive — that
/// is the whole difference between the two.
#[tauri::command]
pub fn resume_download(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let download = db
            .get_download(id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("download {id} no longer exists"))?;
        if download.status != DownloadStatus::Paused {
            return Err("that download is not paused".to_string());
        }
        db.unpause_download(id).map_err(|e| e.to_string())?;
    }

    notify_changed(&app);
    spawn_download(app, id);
    Ok(())
}

/// Runs a finished download again on its own row. Everything needed is already stored, so this
/// works for one that failed days ago — including one interrupted by the app closing.
#[tauri::command]
pub fn retry_download(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        let download = db
            .get_download(id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("download {id} no longer exists"))?;
        if !download.status.is_finished() {
            return Err("that download is still in progress".to_string());
        }
        db.requeue_download(id).map_err(|e| e.to_string())?;
    }

    notify_changed(&app);
    spawn_download(app, id);
    Ok(())
}

#[tauri::command]
pub fn clear_finished_downloads(app: AppHandle, state: State<AppState>) -> Result<usize, String> {
    let removed = {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.clear_finished_downloads().map_err(|e| e.to_string())?
    };
    notify_changed(&app);
    Ok(removed)
}

fn spawn_download(app: AppHandle, id: i64) {
    tauri::async_runtime::spawn(async move {
        run_download(app, id).await;
    });
}

/// One download, start to finish.
///
/// Failure is recorded rather than returned: nothing is awaiting this task, and the whole point
/// of the queue is that an install which fails after its dialog closed still reports somewhere.
/// The row is the report.
async fn run_download(app: AppHandle, id: i64) {
    let state = app.state::<AppState>();

    // One at a time. tokio's Mutex hands the permit to waiters in arrival order, so the queue is
    // FIFO without needing a scheduler of its own — and holding it for the whole job is what
    // stops two large archives from halving each other's speed and both looking stalled.
    let _permit = state.download_slot.lock().await;

    // Re-read rather than trusting what was queued: it may have been cancelled while waiting, and
    // coming back in from `retry_download` the row is the only source of the parameters.
    let download = {
        let Ok(db) = state.db.lock() else { return };
        match db.get_download(id) {
            Ok(Some(found)) => found,
            _ => return,
        }
    };
    if download.status != DownloadStatus::Queued {
        return;
    }

    let stop = Arc::new(AtomicU8::new(Stop::Running.as_u8()));
    {
        let Ok(mut flags) = state.download_stops.lock() else {
            return;
        };
        flags.insert(id, stop.clone());
    }

    set_status(&app, &state, id, DownloadStatus::Downloading, None);

    let staged = staging_path(id, &download.file_name);
    // The row is the authority on how far the transfer got, but never past what is actually on
    // disk. A run cut short by the app being killed can leave the two disagreeing in either
    // direction — bytes that landed after the last row write, or bytes the row counted that never
    // reached the platter — and the smaller number is the only one true of both.
    let on_disk = tokio::fs::metadata(&staged)
        .await
        .map(|meta| meta.len())
        .unwrap_or(0);
    let resume_from = (download.downloaded_bytes.max(0) as u64).min(on_disk);

    // The last bytes seen, kept so they can be written to the row once the job stops. Without
    // this an installed download reports a size of zero forever: the live figures only ever
    // existed in events, which are gone the moment the page stops listening.
    //
    // Seeded from the row, not from nothing. This is written back verbatim when the job stops, so
    // a resumed download that fails or is paused before its first chunk — which is now possible,
    // since the wait for the connection is interruptible — would otherwise erase the total the row
    // already knew and leave the size unknown for the rest of its life.
    let last_seen = Arc::new(std::sync::Mutex::new((
        resume_from,
        download.total_bytes.map(|total| total.max(0) as u64),
    )));

    // Borrowed from `state` above rather than re-fetched from the handle inside each closure:
    // both are consumed by the install below, well within this function, so they can hold a plain
    // reference — and a `State` guard created inside a closure does not outlive the lock it hands
    // out.
    let db = &state.db;

    let on_validator = move |etag: Option<&str>| {
        // Written the moment the headers land, not at the end. A paused transfer is one that
        // never reached the end, and without this it would have no validator to resume against.
        if let Ok(db) = db.lock() {
            if let Err(e) = db.set_download_etag(id, etag) {
                eprintln!("could not record download {id} validator: {e}");
            }
        }
    };

    let stop_check = stop.clone();
    let progress_app = app.clone();
    let progress_stop = stop.clone();
    let progress_seen = last_seen.clone();
    let mut last_emit = Instant::now() - PROGRESS_EMIT_INTERVAL;
    let mut last_persist = Instant::now();
    let on_progress = move |downloaded: u64, total: Option<u64>| {
        // Recorded before the stop is acted on, not after. The chunk this call is reporting is
        // already on disk by the time it arrives, so returning early without noting it would
        // leave the row one chunk short of the file every single time a download is paused — and
        // resume trusts the smaller of the two, so that chunk would be fetched twice.
        if let Ok(mut seen) = progress_seen.lock() {
            *seen = (downloaded, total);
        }
        if Stop::from_u8(progress_stop.load(Ordering::Relaxed)) != Stop::Running {
            return true;
        }
        if last_emit.elapsed() >= PROGRESS_EMIT_INTERVAL {
            last_emit = Instant::now();
            let _ = progress_app.emit(
                "download-progress",
                DownloadProgress {
                    id,
                    downloaded,
                    total,
                },
            );
        }
        // A slow second heartbeat to the row, so a transfer that never gets to stop cleanly still
        // knows roughly where it was. Brief lock, never held across an await — this is a plain
        // synchronous callback running between chunks.
        if last_persist.elapsed() >= PROGRESS_PERSIST_INTERVAL {
            last_persist = Instant::now();
            if let Ok(db) = db.lock() {
                let _ = db.set_download_progress(id, downloaded as i64, total.map(|t| t as i64));
            }
        }
        false
    };

    let extract_app = app.clone();
    let on_extract_start = move || {
        // Straight to an event rather than through `set_status`: this fires from inside the
        // install, where taking the DB lock would mean holding it across the extraction.
        let _ = extract_app.emit("download-phase", DownloadPhase { id });
    };

    // A reinstall replaces one row's files where they stand; a first install adds a row. Both
    // arrive here having fetched the archive through the queue, so they share everything above
    // this point — the resume, the stop flag, the progress — and differ only in what becomes of
    // the bytes. Exclusive branches, so each may consume the callbacks.
    let result = if let Some(target_mod_id) = download.target_mod_id {
        reinstall_over_existing_mod(
            &state,
            target_mod_id,
            &download,
            Staging {
                path: staged.clone(),
                resume_from,
                etag: download.etag.clone(),
            },
            on_validator,
            on_progress,
            on_extract_start,
            || Stop::from_u8(stop_check.load(Ordering::Relaxed)) != Stop::Running,
        )
        .await
    } else {
        install_gamebanana_file(
        &state.gamebanana,
        &state.db,
        InstallRequest {
            gamebanana_mod_id: download.gamebanana_mod_id,
            gamebanana_file_id: download.gamebanana_file_id,
            character_id: &download.character_id,
            slot: download.slot,
            display_name: &download.display_name,
            staging: Staging {
                path: staged.clone(),
                resume_from,
                etag: download.etag.clone(),
            },
        },
        on_validator,
        on_progress,
        on_extract_start,
        // Asked during the stretch before any bytes exist — the mod lookup and the connection to
        // GameBanana's file host — where the progress callback has not been reached yet and so
        // could not carry a stop. Without this a download is unstoppable for as long as it takes
        // to start, which on a slow link is most of the time you spend looking at it.
        || Stop::from_u8(stop_check.load(Ordering::Relaxed)) != Stop::Running,
        )
        .await
    };

    if let Ok(mut flags) = state.download_stops.lock() {
        flags.remove(&id);
    }

    // The final say on the byte counts, so the history line and any later resume both read the
    // number the transfer actually reached rather than the last heartbeat before it stopped.
    {
        let (downloaded, total) = last_seen
            .lock()
            .map(|seen| *seen)
            .unwrap_or((resume_from, download.total_bytes.map(|t| t.max(0) as u64)));
        if let Ok(db) = state.db.lock() {
            if let Err(e) = db.set_download_progress(id, downloaded as i64, total.map(|t| t as i64))
            {
                eprintln!("could not record download {id} byte counts: {e}");
            }
        }
    }

    match result {
        Ok(_) => {
            discard_staging(&staged);
            set_status(&app, &state, id, DownloadStatus::Installed, None)
        }
        // The transfer layer reports every abandoned download as the same error, so the flag is
        // the only thing that separates "you paused this", "you cancelled this" and "this broke".
        // Getting it backwards would put a red failure on the page every time someone stopped a
        // download on purpose — and, worse, delete the bytes a pause was meant to keep.
        Err(_) if Stop::from_u8(stop.load(Ordering::Relaxed)) == Stop::Paused => {
            set_status(&app, &state, id, DownloadStatus::Paused, None)
        }
        Err(_) if Stop::from_u8(stop.load(Ordering::Relaxed)) == Stop::Cancelled => {
            discard_staging(&staged);
            set_status(&app, &state, id, DownloadStatus::Cancelled, None)
        }
        Err(error) => {
            // A genuine failure throws the partial away. Whatever went wrong might have left the
            // staged bytes in any state, and `retry` starts from nothing precisely because
            // nothing here is worth trusting.
            discard_staging(&staged);
            set_status(&app, &state, id, DownloadStatus::Failed, Some(&error))
        }
    }
}

/// Deletes a staging file, if it is still there. Failure is ignored on purpose: a leftover file in
/// the temp folder is the operating system's problem, and nothing about the download's outcome
/// changes because it could not be removed.
fn discard_staging(path: &Path) {
    let _ = std::fs::remove_file(path);
}

fn set_status(
    app: &AppHandle,
    state: &State<'_, AppState>,
    id: i64,
    status: DownloadStatus,
    error: Option<&str>,
) {
    if let Ok(db) = state.db.lock() {
        // A failed status write is worth a log line and nothing more: the download itself already
        // happened, and there is no caller waiting on this to fail at.
        if let Err(e) = db.set_download_status(id, status, error) {
            eprintln!("could not record download {id} as {}: {e}", status.as_str());
        }
    }
    notify_changed(app);
}
