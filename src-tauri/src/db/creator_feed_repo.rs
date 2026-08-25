use rusqlite::{params, Row};
use serde::{Deserialize, Serialize};

use super::Db;

/// How long an entry stays in the bell before it is pruned.
///
/// The table would otherwise grow for the life of the install. Two months is well past the point
/// where "new from someone you follow" is still news, and comfortably past any plausible gap
/// between launches — the dropdown shows the most recent handful anyway.
const RETENTION_SECS: i64 = 60 * 24 * 60 * 60;

/// A mod a followed creator posted, as the notification bell shows it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatorFeedItem {
    pub gamebanana_mod_id: i64,
    pub gamebanana_member_id: i64,
    pub creator_name: String,
    pub creator_avatar_url: Option<String>,
    pub mod_name: String,
    pub thumbnail_url: Option<String>,
    pub is_mature: bool,
    /// When GameBanana says the mod was submitted — what the list is ordered by, and what the
    /// row's "3 days ago" is measured from. Not when this app noticed.
    pub date_added: i64,
    /// When this app first saw it. Kept apart from `date_added` so a mod posted while the app
    /// was closed still reads as posted then, rather than as posted at the next launch.
    pub discovered_at: i64,
    /// `None` while unread. The badge counts exactly these.
    pub seen_at: Option<i64>,
}

/// One entry on its way in, before the database stamps it.
pub struct NewCreatorFeedItem {
    pub gamebanana_mod_id: i64,
    pub gamebanana_member_id: i64,
    pub creator_name: String,
    pub creator_avatar_url: Option<String>,
    pub mod_name: String,
    pub thumbnail_url: Option<String>,
    pub is_mature: bool,
    pub date_added: i64,
}

fn row_to_feed_item(row: &Row) -> rusqlite::Result<CreatorFeedItem> {
    Ok(CreatorFeedItem {
        gamebanana_mod_id: row.get("gamebanana_mod_id")?,
        gamebanana_member_id: row.get("gamebanana_member_id")?,
        creator_name: row.get("creator_name")?,
        creator_avatar_url: row.get("creator_avatar_url")?,
        mod_name: row.get("mod_name")?,
        thumbnail_url: row.get("thumbnail_url")?,
        is_mature: row.get::<_, i64>("is_mature")? != 0,
        date_added: row.get("date_added")?,
        discovered_at: row.get("discovered_at")?,
        seen_at: row.get("seen_at")?,
    })
}

impl Db {
    /// Files newly-found entries, ignoring any mod already on the list, and returns how many
    /// were genuinely new.
    ///
    /// `INSERT OR IGNORE` rather than an upsert, deliberately: an entry that is already here may
    /// well have been read, and rewriting it would either resurrect it as unread or silently
    /// change text the user has already seen. The mod id is the primary key, so a mod that keeps
    /// reappearing in the feed page after page costs nothing after the first sighting.
    ///
    /// Pruning happens here rather than on a timer because this is the only thing that grows the
    /// table, so it is the only place that can put it out of bounds.
    pub fn record_creator_feed_items(
        &self,
        items: &[NewCreatorFeedItem],
        now: i64,
    ) -> rusqlite::Result<usize> {
        let mut inserted = 0usize;
        for item in items {
            inserted += self.conn.execute(
                "INSERT OR IGNORE INTO creator_feed
                    (gamebanana_mod_id, gamebanana_member_id, creator_name, creator_avatar_url,
                     mod_name, thumbnail_url, is_mature, date_added, discovered_at, seen_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL)",
                params![
                    item.gamebanana_mod_id,
                    item.gamebanana_member_id,
                    item.creator_name,
                    item.creator_avatar_url,
                    item.mod_name,
                    item.thumbnail_url,
                    i64::from(item.is_mature),
                    item.date_added,
                    now,
                ],
            )?;
        }

        self.conn.execute(
            "DELETE FROM creator_feed WHERE date_added < ?1",
            params![now - RETENTION_SECS],
        )?;

        Ok(inserted)
    }

    /// The most recent entries, newest submission first, capped at `limit`.
    ///
    /// Ordered by `date_added` rather than by when we noticed: a dropdown that put a two-week-old
    /// mod above yesterday's because it happened to be discovered later would be reporting on
    /// this app's polling schedule instead of on the creator's.
    pub fn list_creator_feed(&self, limit: i64) -> rusqlite::Result<Vec<CreatorFeedItem>> {
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM creator_feed ORDER BY date_added DESC LIMIT ?1")?;
        let rows = stmt.query_map(params![limit], row_to_feed_item)?;
        rows.collect()
    }

    /// How many entries have not been read — the number on the badge.
    pub fn count_unseen_creator_feed(&self) -> rusqlite::Result<i64> {
        self.conn.query_row(
            "SELECT COUNT(*) FROM creator_feed WHERE seen_at IS NULL",
            [],
            |row| row.get(0),
        )
    }

    /// Marks everything read, which is what opening the dropdown means.
    ///
    /// All at once rather than per row: the list is short and entirely visible when it opens, so
    /// tracking which individual rows were "looked at" would be inventing a distinction the user
    /// never made. Entries stay in the list afterwards — read is not gone.
    ///
    /// Only touches rows that are still unread, so re-opening the dropdown does not keep moving
    /// the timestamps of things read days ago.
    pub fn mark_creator_feed_seen(&self, now: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE creator_feed SET seen_at = ?1 WHERE seen_at IS NULL",
            params![now],
        )?;
        Ok(())
    }

    /// Drops one creator's entries. Called when they are unfollowed — the bell is news from
    /// people you follow, so news from someone you no longer follow has no standing to keep
    /// sitting in it, unread badge included.
    pub fn clear_creator_feed_for(&self, gamebanana_member_id: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "DELETE FROM creator_feed WHERE gamebanana_member_id = ?1",
            params![gamebanana_member_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::NewCreatorBookmark;

    const NOW: i64 = 1_787_000_000;

    fn db() -> Db {
        Db::open_in_memory().expect("in-memory db")
    }

    fn item(mod_id: i64, member_id: i64, date_added: i64) -> NewCreatorFeedItem {
        NewCreatorFeedItem {
            gamebanana_mod_id: mod_id,
            gamebanana_member_id: member_id,
            creator_name: "examplemodder".to_string(),
            creator_avatar_url: None,
            mod_name: format!("Mod {mod_id}"),
            thumbnail_url: None,
            is_mature: false,
            date_added,
        }
    }

    #[test]
    fn records_items_and_counts_them_unseen() {
        let db = db();
        let inserted = db
            .record_creator_feed_items(&[item(1, 10, NOW), item(2, 10, NOW - 100)], NOW)
            .unwrap();

        assert_eq!(inserted, 2);
        assert_eq!(db.count_unseen_creator_feed().unwrap(), 2);
    }

    #[test]
    fn re_recording_the_same_mod_adds_nothing() {
        let db = db();
        db.record_creator_feed_items(&[item(1, 10, NOW)], NOW)
            .unwrap();
        let again = db
            .record_creator_feed_items(&[item(1, 10, NOW), item(2, 10, NOW)], NOW)
            .unwrap();

        assert_eq!(again, 1, "only the mod not already on the list is new");
        assert_eq!(db.list_creator_feed(50).unwrap().len(), 2);
    }

    /// The badge must not come back for something already read just because the same mod turns
    /// up in the feed again — it stays in the window for days after it is posted.
    #[test]
    fn a_read_item_stays_read_when_the_feed_repeats_it() {
        let db = db();
        db.record_creator_feed_items(&[item(1, 10, NOW)], NOW)
            .unwrap();
        db.mark_creator_feed_seen(NOW).unwrap();
        db.record_creator_feed_items(&[item(1, 10, NOW)], NOW + 60)
            .unwrap();

        assert_eq!(db.count_unseen_creator_feed().unwrap(), 0);
    }

    #[test]
    fn listing_is_newest_submission_first_regardless_of_discovery_order() {
        let db = db();
        // The older mod is discovered second — ordering must follow the submission date.
        db.record_creator_feed_items(&[item(1, 10, NOW - 5_000)], NOW)
            .unwrap();
        db.record_creator_feed_items(&[item(2, 10, NOW)], NOW + 60)
            .unwrap();

        let listed = db.list_creator_feed(50).unwrap();
        assert_eq!(
            listed
                .iter()
                .map(|i| i.gamebanana_mod_id)
                .collect::<Vec<_>>(),
            vec![2, 1]
        );
    }

    #[test]
    fn marking_seen_leaves_the_entries_in_the_list() {
        let db = db();
        db.record_creator_feed_items(&[item(1, 10, NOW)], NOW)
            .unwrap();
        db.mark_creator_feed_seen(NOW).unwrap();

        assert_eq!(db.count_unseen_creator_feed().unwrap(), 0);
        let listed = db.list_creator_feed(50).unwrap();
        assert_eq!(listed.len(), 1, "read is not gone");
        assert_eq!(listed[0].seen_at, Some(NOW));
    }

    #[test]
    fn marking_seen_twice_keeps_the_first_timestamp() {
        let db = db();
        db.record_creator_feed_items(&[item(1, 10, NOW)], NOW)
            .unwrap();
        db.mark_creator_feed_seen(NOW).unwrap();
        db.mark_creator_feed_seen(NOW + 10_000).unwrap();

        assert_eq!(db.list_creator_feed(50).unwrap()[0].seen_at, Some(NOW));
    }

    #[test]
    fn unfollowing_a_creator_clears_their_entries_and_leaves_the_rest() {
        let db = db();
        db.add_creator_bookmark(NewCreatorBookmark {
            gamebanana_member_id: 10,
            name: "examplemodder".to_string(),
            avatar_url: None,
            mod_count: 3,
        })
        .unwrap();
        db.record_creator_feed_items(&[item(1, 10, NOW), item(2, 11, NOW)], NOW)
            .unwrap();

        db.remove_creator_bookmark(10).unwrap();

        let left = db.list_creator_feed(50).unwrap();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].gamebanana_member_id, 11);
        assert_eq!(db.count_unseen_creator_feed().unwrap(), 1);
    }

    #[test]
    fn entries_older_than_the_retention_window_are_pruned_on_write() {
        let db = db();
        db.record_creator_feed_items(&[item(1, 10, NOW - RETENTION_SECS - 1)], NOW)
            .unwrap();

        assert!(
            db.list_creator_feed(50).unwrap().is_empty(),
            "an entry older than the window must not survive the write that added it"
        );
    }

    #[test]
    fn limit_caps_the_listing() {
        let db = db();
        let items: Vec<_> = (1..=10).map(|i| item(i, 10, NOW - i)).collect();
        db.record_creator_feed_items(&items, NOW).unwrap();

        assert_eq!(db.list_creator_feed(3).unwrap().len(), 3);
    }

    #[test]
    fn mature_flag_survives_the_round_trip() {
        let db = db();
        let mut mature = item(1, 10, NOW);
        mature.is_mature = true;
        db.record_creator_feed_items(&[mature], NOW).unwrap();

        assert!(db.list_creator_feed(50).unwrap()[0].is_mature);
    }
}
