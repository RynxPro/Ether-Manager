use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::{Db, Slot};

/// Where a download has got to.
///
/// `Extracting` is worth separating from `Downloading` because it is the phase with no progress
/// to report — a large archive sits at 100% for a noticeable stretch, and without a name for
/// that the app looks stalled at the exact moment it is working hardest.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Extracting,
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
            "Installed" => Some(DownloadStatus::Installed),
            "Failed" => Some(DownloadStatus::Failed),
            "Cancelled" => Some(DownloadStatus::Cancelled),
            _ => None,
        }
    }

    /// Whether this is a resting state — nothing further will happen without the user asking.
    /// Drives both `finished_at` and what `clear_finished_downloads` is allowed to delete.
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
        created_at: row.get("created_at")?,
        finished_at: row.get("finished_at")?,
    })
}

impl Db {
    pub fn enqueue_download(&self, new: NewDownload) -> rusqlite::Result<Download> {
        self.conn.execute(
            "INSERT INTO downloads (
                gamebanana_mod_id, gamebanana_file_id, mod_name, file_name, thumbnail_url,
                character_id, slot, display_name, status, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
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

    /// Written once, when the job stops — not on every progress tick. The live figure reaches
    /// the UI through events many times a second, and writing each one would be thousands of
    /// pointless transactions per download; nothing reads the stored value until the row is at
    /// rest. A download interrupted by a crash keeps its zeroes, which is harmless: the startup
    /// sweep marks it failed, so that count is never shown.
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

    /// Puts a finished download back in the queue, on the same row rather than a new one — a
    /// retry is another attempt at the same download, not a second entry in the history.
    pub fn requeue_download(&self, id: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE downloads
                SET status = ?1, error = NULL, finished_at = NULL, downloaded_bytes = 0
              WHERE id = ?2",
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

    /// Run once at startup. A download that was queued or running when the app last exited has
    /// no task behind it anymore, and would otherwise sit in the list claiming to be in progress
    /// forever. Marking it failed is both true and useful: the row keeps everything needed to
    /// retry it.
    pub fn fail_interrupted_downloads(&self) -> rusqlite::Result<usize> {
        self.conn.execute(
            "UPDATE downloads
                SET status = ?1, error = ?2, finished_at = ?3
              WHERE status IN (?4, ?5, ?6)",
            params![
                DownloadStatus::Failed.as_str(),
                "interrupted when the app closed",
                now(),
                DownloadStatus::Queued.as_str(),
                DownloadStatus::Downloading.as_str(),
                DownloadStatus::Extracting.as_str(),
            ],
        )
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
        }
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
    fn startup_sweep_fails_downloads_left_running_and_leaves_finished_ones_alone() {
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

        let swept = db.fail_interrupted_downloads().unwrap();

        assert_eq!(swept, 3, "queued, downloading and extracting all count");
        for id in [running, extracting, waiting] {
            let row = db.get_download(id).unwrap().unwrap();
            assert_eq!(row.status, DownloadStatus::Failed);
            assert!(row.error.is_some(), "a swept row must say why it failed");
        }
        assert_eq!(
            db.get_download(done).unwrap().unwrap().status,
            DownloadStatus::Installed,
            "an already-finished download must not be rewritten"
        );
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
