use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::{Db, Slot};

/// Where a download has got to.
///
/// `Extracting` is worth separating from `Downloading` because it is the phase with no progress
/// to report — a large archive sits at 100% for a noticeable stretch, and without a name for
/// that the app looks stalled at the exact moment it is working hardest.
///
/// `Paused` is deliberately not a finished state: the row still owns a part-downloaded file, so
/// clearing history must leave it alone and the badge must keep counting it. It is the one state
/// that is at rest without being over.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Extracting,
    Paused,
    Installed,
    Failed,
    Cancelled,
}

impl DownloadStatus {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            DownloadStatus::Queued => "Queued",
            DownloadStatus::Downloading => "Downloading",
            DownloadStatus::Extracting => "Extracting",
            DownloadStatus::Paused => "Paused",
            DownloadStatus::Installed => "Installed",
            DownloadStatus::Failed => "Failed",
            DownloadStatus::Cancelled => "Cancelled",
        }
    }

    fn from_str(value: &str) -> Option<Self> {
        match value {
            "Queued" => Some(DownloadStatus::Queued),
            "Downloading" => Some(DownloadStatus::Downloading),
            "Extracting" => Some(DownloadStatus::Extracting),
            "Paused" => Some(DownloadStatus::Paused),
            "Installed" => Some(DownloadStatus::Installed),
            "Failed" => Some(DownloadStatus::Failed),
            "Cancelled" => Some(DownloadStatus::Cancelled),
            _ => None,
        }
    }

    /// Whether this is a resting state — nothing further will happen without the user asking.
    /// Drives both `finished_at` and what `clear_finished_downloads` is allowed to delete.
    ///
    /// `Paused` is excluded on purpose: deleting a paused row would strand the partial file it is
    /// the only record of, and stamping it with a finish time would claim it was over.
    pub(crate) fn is_finished(self) -> bool {
        matches!(
            self,
            DownloadStatus::Installed | DownloadStatus::Failed | DownloadStatus::Cancelled
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Download {
    pub id: i64,
    pub gamebanana_mod_id: i64,
    pub gamebanana_file_id: i64,
    pub mod_name: String,
    pub file_name: String,
    pub thumbnail_url: Option<String>,
    pub character_id: String,
    pub slot: Slot,
    pub display_name: String,
    pub status: DownloadStatus,
    pub error: Option<String>,
    /// `None` until the server sends a Content-Length, and sometimes for the whole download —
    /// GameBanana does not always send one, which is why the progress bar has an indeterminate
    /// mode at all.
    pub total_bytes: Option<i64>,
    pub downloaded_bytes: i64,
    /// The validator the staged bytes were served with, kept so a resume can send `If-Range` and
    /// find out whether they still belong to the file it is asking for. `None` on a row that has
    /// never reached the server, and on one whose host sent no ETag — resume still works there,
    /// it just cannot detect the file changing underneath it.
    pub etag: Option<String>,
    /// Set when this download replaces an existing mod's files in place rather than adding a
    /// new one. `None` is an ordinary install.
    pub target_mod_id: Option<i64>,
    pub created_at: i64,
    pub finished_at: Option<i64>,
}

pub struct NewDownload {
    pub gamebanana_mod_id: i64,
    pub gamebanana_file_id: i64,
    pub mod_name: String,
    pub file_name: String,
    pub thumbnail_url: Option<String>,
    pub character_id: String,
    pub slot: Slot,
    pub display_name: String,
    /// Set when this download replaces an existing mod's files rather than adding a new mod.
    pub target_mod_id: Option<i64>,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock is before unix epoch")
        .as_secs() as i64
}

fn row_to_download(row: &Row) -> rusqlite::Result<Download> {
    let slot_text: String = row.get("slot")?;
    let status_text: String = row.get("status")?;
    Ok(Download {
        id: row.get("id")?,
        gamebanana_mod_id: row.get("gamebanana_mod_id")?,
        gamebanana_file_id: row.get("gamebanana_file_id")?,
        mod_name: row.get("mod_name")?,
        file_name: row.get("file_name")?,
        thumbnail_url: row.get("thumbnail_url")?,
        character_id: row.get("character_id")?,
        display_name: row.get("display_name")?,
        // Fails loud on an unknown value rather than defaulting, matching `mods_repo::get_mod`:
        // a row this app cannot interpret must not be silently reinterpreted as something else.
        slot: Slot::from_str(&slot_text).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                format!("unknown slot {slot_text:?}").into(),
            )
        })?,
        status: DownloadStatus::from_str(&status_text).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                format!("unknown download status {status_text:?}").into(),
            )
        })?,
        error: row.get("error")?,
        total_bytes: row.get("total_bytes")?,
        downloaded_bytes: row.get("downloaded_bytes")?,
        etag: row.get("etag")?,
        target_mod_id: row.get("target_mod_id")?,
        created_at: row.get("created_at")?,
        finished_at: row.get("finished_at")?,
    })
}

impl Db {
    pub fn enqueue_download(&self, new: NewDownload) -> rusqlite::Result<Download> {
        self.conn.execute(
            "INSERT INTO downloads (
                gamebanana_mod_id, gamebanana_file_id, mod_name, file_name, thumbnail_url,
                character_id, slot, display_name, status, target_mod_id, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                new.gamebanana_mod_id,
                new.gamebanana_file_id,
                new.mod_name,
                new.file_name,
                new.thumbnail_url,
                new.character_id,
                new.slot.as_str(),
                new.display_name,
                DownloadStatus::Queued.as_str(),
                new.target_mod_id,
                now(),
            ],
        )?;
        self.get_download(self.conn.last_insert_rowid())
            .map(|found| found.expect("row just inserted must exist"))
    }

    pub fn get_download(&self, id: i64) -> rusqlite::Result<Option<Download>> {
        self.conn
            .query_row(
                "SELECT * FROM downloads WHERE id = ?1",
                params![id],
                row_to_download,
            )
            .optional()
    }

    /// Newest first. `id DESC` breaks ties because `created_at` is whole seconds and several
    /// downloads queued in one burst share a timestamp — without it their order would wobble
    /// between reads.
    pub fn list_downloads(&self) -> rusqlite::Result<Vec<Download>> {
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM downloads ORDER BY created_at DESC, id DESC")?;
        let downloads = stmt.query_map([], row_to_download)?.collect();
        downloads
    }

    /// `finished_at` is stamped by the status itself rather than by the caller, so a terminal
    /// row can never end up without one.
    pub fn set_download_status(
        &self,
        id: i64,
        status: DownloadStatus,
        error: Option<&str>,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE downloads SET status = ?1, error = ?2, finished_at = ?3 WHERE id = ?4",
            params![status.as_str(), error, status.is_finished().then(now), id],
        )?;
        Ok(())
    }

    /// How far the staged file has got. Written when the job stops, and on a slow throttle while
    /// it runs — far slower than the progress events, because nothing on screen reads the stored
    /// figure. It exists so a transfer stopped without warning knows where to pick up, which
    /// bounds what a hard kill can cost to the throttle interval rather than the whole download.
    pub fn set_download_progress(
        &self,
        id: i64,
        downloaded_bytes: i64,
        total_bytes: Option<i64>,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE downloads SET downloaded_bytes = ?1, total_bytes = ?2 WHERE id = ?3",
            params![downloaded_bytes, total_bytes, id],
        )?;
        Ok(())
    }

    /// Records which version of the remote file the staged bytes came from. Written as soon as
    /// the response headers arrive rather than at the end, because a paused transfer is one that
    /// never reached the end and would otherwise have nothing to validate against.
    pub fn set_download_etag(&self, id: i64, etag: Option<&str>) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE downloads SET etag = ?1 WHERE id = ?2",
            params![etag, id],
        )?;
        Ok(())
    }

    /// Puts a finished download back in the queue, on the same row rather than a new one — a
    /// retry is another attempt at the same download, not a second entry in the history.
    ///
    /// Byte counts reset because a retry starts over: the staged file is discarded the moment a
    /// download fails or is cancelled, so there is nothing left to continue from and a surviving
    /// count would send the next attempt asking for a range of a file that is not there.
    pub fn requeue_download(&self, id: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE downloads
                SET status = ?1, error = NULL, finished_at = NULL, downloaded_bytes = 0, etag = NULL
              WHERE id = ?2",
            params![DownloadStatus::Queued.as_str(), id],
        )?;
        Ok(())
    }

    /// Puts a paused download back in the queue with its byte count and validator intact — the
    /// difference from `requeue_download`, and the whole of what makes it a resume rather than a
    /// retry. It rejoins at the back: the queue is arrival-ordered, and pressing resume is a
    /// fresh arrival.
    pub fn unpause_download(&self, id: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE downloads SET status = ?1, error = NULL, finished_at = NULL WHERE id = ?2",
            params![DownloadStatus::Queued.as_str(), id],
        )?;
        Ok(())
    }

    /// Clears the history, leaving anything still queued or running alone — otherwise the
    /// button would look like it cancelled the download it just removed from view.
    pub fn clear_finished_downloads(&self) -> rusqlite::Result<usize> {
        self.conn.execute(
            "DELETE FROM downloads WHERE status IN (?1, ?2, ?3)",
            params![
                DownloadStatus::Installed.as_str(),
                DownloadStatus::Failed.as_str(),
                DownloadStatus::Cancelled.as_str(),
            ],
        )
    }

    /// Run once at startup. A download that was mid-flight when the app last exited has no task
    /// behind it anymore, and would otherwise sit in the list claiming to be in progress forever.
    ///
    /// Queued and downloading rows become **paused**, not failed. Whatever had already been
    /// fetched is still staged on disk, so "stopped, and it can carry on" is both the truer
    /// description and the more useful one — closing the app mid-download stops costing the
    /// megabytes it had already pulled. Extracting is the exception: unpacking cannot be picked up
    /// part-way through, and a row resumed from a complete archive would only ask the server for a
    /// range past the end of the file, so those fail and retry from the top.
    ///
    /// Returns how many rows it touched.
    pub fn park_interrupted_downloads(&self) -> rusqlite::Result<usize> {
        let paused = self.conn.execute(
            "UPDATE downloads
                SET status = ?1, error = ?2, finished_at = NULL
              WHERE status IN (?3, ?4)",
            params![
                DownloadStatus::Paused.as_str(),
                "interrupted when the app closed",
                DownloadStatus::Queued.as_str(),
                DownloadStatus::Downloading.as_str(),
            ],
        )?;
        let failed = self.conn.execute(
            "UPDATE downloads
                SET status = ?1, error = ?2, finished_at = ?3
              WHERE status = ?4",
            params![
                DownloadStatus::Failed.as_str(),
                "the app closed while this was unpacking",
                now(),
                DownloadStatus::Extracting.as_str(),
            ],
        )?;
        Ok(paused + failed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new_test_download(mod_id: i64) -> NewDownload {
        NewDownload {
            gamebanana_mod_id: mod_id,
            gamebanana_file_id: 1776071,
            mod_name: "Compact Damage Numbers".to_string(),
            file_name: "compact_dmg.zip".to_string(),
            thumbnail_url: None,
            character_id: "belle".to_string(),
            slot: Slot::CharacterSkin,
            display_name: "Compact Damage Numbers".to_string(),
            target_mod_id: None,
        }
    }

    /// The column that separates a reinstall from a first install has to survive the round trip,
    /// because the worker reads it back to decide which of the two it is doing.
    #[test]
    fn a_reinstall_row_remembers_the_mod_it_replaces() {
        let db = Db::open_in_memory().unwrap();

        let plain = db.enqueue_download(new_test_download(1)).unwrap();
        assert_eq!(plain.target_mod_id, None);

        let mut reinstall = new_test_download(2);
        reinstall.target_mod_id = Some(42);
        let queued = db.enqueue_download(reinstall).unwrap();
        assert_eq!(queued.target_mod_id, Some(42));

        let listed = db.list_downloads().unwrap();
        let found = listed.iter().find(|d| d.id == queued.id).unwrap();
        assert_eq!(found.target_mod_id, Some(42));
    }

    #[test]
    fn enqueue_starts_queued_and_unfinished() {
        let db = Db::open_in_memory().unwrap();
        let download = db.enqueue_download(new_test_download(645291)).unwrap();

        assert_eq!(download.status, DownloadStatus::Queued);
        assert_eq!(download.downloaded_bytes, 0);
        assert!(download.total_bytes.is_none());
        assert!(download.finished_at.is_none());
        assert!(download.error.is_none());
    }

    /// The retry path depends on this: everything the installer needs must survive the round
    /// trip, or a failed download could not be run again without reopening the mod page.
    #[test]
    fn a_download_row_carries_everything_needed_to_run_it_again() {
        let db = Db::open_in_memory().unwrap();
        let id = db.enqueue_download(new_test_download(645291)).unwrap().id;

        let stored = db.get_download(id).unwrap().unwrap();
        assert_eq!(stored.gamebanana_mod_id, 645291);
        assert_eq!(stored.gamebanana_file_id, 1776071);
        assert_eq!(stored.character_id, "belle");
        assert_eq!(stored.slot, Slot::CharacterSkin);
        assert_eq!(stored.display_name, "Compact Damage Numbers");
    }

    #[test]
    fn finishing_stamps_finished_at_and_running_states_do_not() {
        let db = Db::open_in_memory().unwrap();
        let id = db.enqueue_download(new_test_download(1)).unwrap().id;

        db.set_download_status(id, DownloadStatus::Downloading, None)
            .unwrap();
        assert!(db.get_download(id).unwrap().unwrap().finished_at.is_none());

        db.set_download_status(id, DownloadStatus::Failed, Some("connection reset"))
            .unwrap();
        let failed = db.get_download(id).unwrap().unwrap();
        assert!(failed.finished_at.is_some());
        assert_eq!(failed.error.as_deref(), Some("connection reset"));
    }

    /// Retrying must clear the previous attempt's failure, or the row would show an error while
    /// actively downloading.
    #[test]
    fn requeueing_clears_the_previous_attempts_error_and_finish_time() {
        let db = Db::open_in_memory().unwrap();
        let id = db.enqueue_download(new_test_download(1)).unwrap().id;
        db.set_download_status(id, DownloadStatus::Failed, Some("connection reset"))
            .unwrap();

        db.requeue_download(id).unwrap();

        let retried = db.get_download(id).unwrap().unwrap();
        assert_eq!(retried.status, DownloadStatus::Queued);
        assert!(retried.error.is_none());
        assert!(retried.finished_at.is_none());
        assert_eq!(retried.downloaded_bytes, 0);
    }

    #[test]
    fn clearing_history_keeps_anything_still_running_or_queued() {
        let db = Db::open_in_memory().unwrap();
        let done = db.enqueue_download(new_test_download(1)).unwrap().id;
        let running = db.enqueue_download(new_test_download(2)).unwrap().id;
        let waiting = db.enqueue_download(new_test_download(3)).unwrap().id;
        db.set_download_status(done, DownloadStatus::Installed, None)
            .unwrap();
        db.set_download_status(running, DownloadStatus::Downloading, None)
            .unwrap();

        let removed = db.clear_finished_downloads().unwrap();

        assert_eq!(removed, 1);
        assert!(db.get_download(done).unwrap().is_none());
        assert!(db.get_download(running).unwrap().is_some());
        assert!(db.get_download(waiting).unwrap().is_some());
    }

    /// Without the startup sweep, a download running when the app was killed would sit in the
    /// list forever claiming to be in progress, with nothing left to drive it.
    #[test]
    fn startup_sweep_parks_downloads_left_running_and_leaves_finished_ones_alone() {
        let db = Db::open_in_memory().unwrap();
        let running = db.enqueue_download(new_test_download(1)).unwrap().id;
        let extracting = db.enqueue_download(new_test_download(2)).unwrap().id;
        let waiting = db.enqueue_download(new_test_download(3)).unwrap().id;
        let done = db.enqueue_download(new_test_download(4)).unwrap().id;
        db.set_download_status(running, DownloadStatus::Downloading, None)
            .unwrap();
        db.set_download_status(extracting, DownloadStatus::Extracting, None)
            .unwrap();
        db.set_download_status(done, DownloadStatus::Installed, None)
            .unwrap();

        let swept = db.park_interrupted_downloads().unwrap();

        assert_eq!(swept, 3, "queued, downloading and extracting all count");
        for id in [running, waiting] {
            let row = db.get_download(id).unwrap().unwrap();
            assert_eq!(
                row.status,
                DownloadStatus::Paused,
                "an interrupted transfer still has its staged bytes, so it can carry on"
            );
            assert!(row.error.is_some(), "a swept row must say what happened");
            assert!(
                row.finished_at.is_none(),
                "paused is not finished — a finish time would take it out of the active list"
            );
        }
        assert_eq!(
            db.get_download(extracting).unwrap().unwrap().status,
            DownloadStatus::Failed,
            "unpacking cannot be picked up part-way, so it retries from the top instead"
        );
        assert_eq!(
            db.get_download(done).unwrap().unwrap().status,
            DownloadStatus::Installed,
            "an already-finished download must not be rewritten"
        );
    }

    /// The difference between resume and retry, on the only thing that distinguishes them: a
    /// resume keeps what it already fetched, a retry throws it away.
    #[test]
    fn resuming_keeps_the_staged_bytes_where_retrying_discards_them() {
        let db = Db::open_in_memory().unwrap();
        let resumed = db.enqueue_download(new_test_download(1)).unwrap().id;
        let retried = db.enqueue_download(new_test_download(2)).unwrap().id;
        for id in [resumed, retried] {
            db.set_download_progress(id, 90_000, Some(182_101)).unwrap();
            db.set_download_etag(id, Some("\"6a74e743-2c755\"")).unwrap();
        }
        db.set_download_status(resumed, DownloadStatus::Paused, None)
            .unwrap();
        db.set_download_status(retried, DownloadStatus::Failed, Some("connection reset"))
            .unwrap();

        db.unpause_download(resumed).unwrap();
        db.requeue_download(retried).unwrap();

        let resumed = db.get_download(resumed).unwrap().unwrap();
        assert_eq!(resumed.status, DownloadStatus::Queued);
        assert_eq!(resumed.downloaded_bytes, 90_000);
        assert_eq!(resumed.etag.as_deref(), Some("\"6a74e743-2c755\""));

        let retried = db.get_download(retried).unwrap().unwrap();
        assert_eq!(retried.status, DownloadStatus::Queued);
        assert_eq!(
            retried.downloaded_bytes, 0,
            "the staged file is gone by the time a failed download is retried, so a surviving \
             count would ask the server to continue a file that is not there"
        );
        assert!(retried.etag.is_none());
        assert!(retried.error.is_none());
    }

    /// Clearing history must not touch a paused download: its row is the only record of the
    /// partial file on disk, and deleting it would strand those bytes with nothing to resume them.
    #[test]
    fn clearing_history_leaves_paused_downloads_alone() {
        let db = Db::open_in_memory().unwrap();
        let paused = db.enqueue_download(new_test_download(1)).unwrap().id;
        let done = db.enqueue_download(new_test_download(2)).unwrap().id;
        db.set_download_status(paused, DownloadStatus::Paused, None)
            .unwrap();
        db.set_download_status(done, DownloadStatus::Installed, None)
            .unwrap();

        let removed = db.clear_finished_downloads().unwrap();

        assert_eq!(removed, 1);
        assert!(db.get_download(paused).unwrap().is_some());
    }

    /// A paused download knows its own size, and must not lose that by being resumed.
    ///
    /// The worker writes its byte counts back when the job stops, whatever the outcome. A resume
    /// that dies before its first chunk — a dropped connection, or a pause during the wait for one
    /// — therefore writes back what it started with, and if that carried no total the row would
    /// forget how big the file is and never find out again. Writing the row's own total back is a
    /// no-op; writing `None` over it is the bug this guards.
    #[test]
    fn writing_progress_back_unchanged_leaves_a_known_total_intact() {
        let db = Db::open_in_memory().unwrap();
        let id = db.enqueue_download(new_test_download(1)).unwrap().id;
        db.set_download_progress(id, 90_000, Some(182_101)).unwrap();
        db.set_download_status(id, DownloadStatus::Paused, None)
            .unwrap();

        let paused = db.get_download(id).unwrap().unwrap();
        // Exactly what the worker does when it stops without having seen a chunk.
        db.set_download_progress(id, paused.downloaded_bytes, paused.total_bytes)
            .unwrap();

        let after = db.get_download(id).unwrap().unwrap();
        assert_eq!(after.downloaded_bytes, 90_000);
        assert_eq!(
            after.total_bytes,
            Some(182_101),
            "a resume that never got started must not erase the size the row already knew"
        );
    }

    /// `is_finished` is what pause and cancel check before touching a row, so which states it
    /// covers is a behavioural decision, not an implementation detail. Getting it wrong lets a
    /// late cancel stamp itself over a completed install, leaving the history denying a mod that
    /// is sitting in the library — which is exactly what happened once before this guard existed.
    #[test]
    fn only_installed_failed_and_cancelled_count_as_finished() {
        for status in [
            DownloadStatus::Installed,
            DownloadStatus::Failed,
            DownloadStatus::Cancelled,
        ] {
            assert!(status.is_finished(), "{} must be terminal", status.as_str());
        }
        for status in [
            DownloadStatus::Queued,
            DownloadStatus::Downloading,
            DownloadStatus::Extracting,
            DownloadStatus::Paused,
        ] {
            assert!(
                !status.is_finished(),
                "{} still has work left in it",
                status.as_str()
            );
        }
    }

    /// Pausing must not stamp a finish time, or the row would drop out of the active list and
    /// into history while it still has work left to do.
    #[test]
    fn pausing_does_not_mark_the_download_finished() {
        let db = Db::open_in_memory().unwrap();
        let id = db.enqueue_download(new_test_download(1)).unwrap().id;

        db.set_download_status(id, DownloadStatus::Paused, None)
            .unwrap();

        let paused = db.get_download(id).unwrap().unwrap();
        assert_eq!(paused.status, DownloadStatus::Paused);
        assert!(paused.finished_at.is_none());
        assert!(!DownloadStatus::Paused.is_finished());
    }

    /// The history line reads its size from the row, and the row is the only place it survives —
    /// the live figures exist solely in events. This was shipped broken once: the write was never
    /// called, so a finished install reported zero bytes forever.
    #[test]
    fn byte_counts_survive_on_the_row_after_the_job_stops() {
        let db = Db::open_in_memory().unwrap();
        let id = db.enqueue_download(new_test_download(1)).unwrap().id;

        db.set_download_progress(id, 182_400, Some(182_400)).unwrap();
        db.set_download_status(id, DownloadStatus::Installed, None)
            .unwrap();

        let stored = db.get_download(id).unwrap().unwrap();
        assert_eq!(stored.downloaded_bytes, 182_400);
        assert_eq!(stored.total_bytes, Some(182_400));
    }

    /// GameBanana does not always send a Content-Length, so a total of `None` has to be storable
    /// alongside a real downloaded count rather than failing or zeroing it.
    #[test]
    fn a_download_with_no_content_length_still_records_what_it_fetched() {
        let db = Db::open_in_memory().unwrap();
        let id = db.enqueue_download(new_test_download(1)).unwrap().id;

        db.set_download_progress(id, 4_096, None).unwrap();

        let stored = db.get_download(id).unwrap().unwrap();
        assert_eq!(stored.downloaded_bytes, 4_096);
        assert_eq!(stored.total_bytes, None);
    }

    #[test]
    fn list_downloads_returns_newest_first() {
        let db = Db::open_in_memory().unwrap();
        let first = db.enqueue_download(new_test_download(1)).unwrap().id;
        let second = db.enqueue_download(new_test_download(2)).unwrap().id;

        let ids: Vec<i64> = db.list_downloads().unwrap().iter().map(|d| d.id).collect();

        assert_eq!(ids, vec![second, first]);
    }
}
