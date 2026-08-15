use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::commands::gamebanana::{install_gamebanana_file, InstallRequest, PROGRESS_EMIT_INTERVAL};
use crate::db::{Download, DownloadStatus, NewDownload, Slot};
use crate::AppState;

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

/// Cancels a download whether it has started or not.
///
/// A running one is stopped by flipping its flag and letting the worker unwind, so the partial
/// file still gets cleaned up. A queued one is marked cancelled here and discarded when its turn
/// comes — it never opens a connection at all.
#[tauri::command]
pub fn cancel_download(app: AppHandle, state: State<AppState>, id: i64) -> Result<(), String> {
    let running = {
        let flags = state.download_cancels.lock().map_err(|e| e.to_string())?;
        flags.get(&id).cloned()
    };

    match running {
        Some(flag) => flag.store(true, Ordering::Relaxed),
        None => {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.set_download_status(id, DownloadStatus::Cancelled, None)
                .map_err(|e| e.to_string())?;
        }
    }
    notify_changed(&app);
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

    let cancel = Arc::new(AtomicBool::new(false));
    {
        let Ok(mut flags) = state.download_cancels.lock() else {
            return;
        };
        flags.insert(id, cancel.clone());
    }

    set_status(&app, &state, id, DownloadStatus::Downloading, None);

    // The last bytes seen, kept so they can be written to the row once the job stops. Without
    // this an installed download reports a size of zero forever: the live figures only ever
    // existed in events, which are gone the moment the page stops listening.
    let last_seen = Arc::new(std::sync::Mutex::new((0u64, None::<u64>)));

    let progress_app = app.clone();
    let progress_cancel = cancel.clone();
    let progress_seen = last_seen.clone();
    let mut last_emit = Instant::now() - PROGRESS_EMIT_INTERVAL;
    let on_progress = move |downloaded: u64, total: Option<u64>| {
        if progress_cancel.load(Ordering::Relaxed) {
            return true;
        }
        if let Ok(mut seen) = progress_seen.lock() {
            *seen = (downloaded, total);
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
        false
    };

    let extract_app = app.clone();
    let on_extract_start = move || {
        // Straight to an event rather than through `set_status`: this fires from inside the
        // install, where taking the DB lock would mean holding it across the extraction.
        let _ = extract_app.emit("download-phase", DownloadPhase { id });
    };

    let result = install_gamebanana_file(
        &state.gamebanana,
        &state.db,
        InstallRequest {
            gamebanana_mod_id: download.gamebanana_mod_id,
            gamebanana_file_id: download.gamebanana_file_id,
            character_id: &download.character_id,
            slot: download.slot,
            display_name: &download.display_name,
        },
        on_progress,
        on_extract_start,
    )
    .await;

    if let Ok(mut flags) = state.download_cancels.lock() {
        flags.remove(&id);
    }

    // One write, after the transfer rather than during it: a row per progress tick would be
    // thousands of transactions per download, and nothing reads the stored figure until the job
    // has stopped anyway. A download interrupted by a crash keeps zeroes, which is harmless —
    // the startup sweep marks it failed, so its byte count is never shown.
    {
        let (downloaded, total) = last_seen.lock().map(|seen| *seen).unwrap_or((0, None));
        if let Ok(db) = state.db.lock() {
            if let Err(e) = db.set_download_progress(id, downloaded as i64, total.map(|t| t as i64))
            {
                eprintln!("could not record download {id} byte counts: {e}");
            }
        }
    }

    match result {
        Ok(_) => set_status(&app, &state, id, DownloadStatus::Installed, None),
        // The download layer reports cancellation as just another error, so the flag is what
        // separates "you stopped this" from "this broke". Getting that backwards would put a red
        // failure on the page every time someone cancelled deliberately.
        Err(_) if cancel.load(Ordering::Relaxed) => {
            set_status(&app, &state, id, DownloadStatus::Cancelled, None)
        }
        Err(error) => set_status(&app, &state, id, DownloadStatus::Failed, Some(&error)),
    }
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
