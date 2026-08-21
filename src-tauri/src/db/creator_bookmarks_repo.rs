use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::Db;

/// A mod author the user has chosen to keep.
///
/// Separate from `bookmarks` rather than a `kind` column on it: the two share only "the user
/// saved this". A mod bookmark carries a character and a preview image and is answered by the
/// grid; a creator carries a face and a body of work and is answered by their page.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatorBookmark {
    pub gamebanana_member_id: i64,
    pub name: String,
    pub avatar_url: Option<String>,
    /// Their ZZZ mod count as of the last time their page was open.
    ///
    /// Stored rather than fetched, deliberately. The bar shows every bookmarked creator at once,
    /// so a live count would mean one GameBanana request per creator every time the Bookmarks
    /// page is opened — a dozen requests to render a row. This number is here to say who is
    /// prolific and who is not, which it does perfectly well while slightly stale, and it is
    /// refreshed whenever their page is actually visited.
    pub mod_count: i64,
    pub added_at: i64,
}

pub struct NewCreatorBookmark {
    pub gamebanana_member_id: i64,
    pub name: String,
    pub avatar_url: Option<String>,
    pub mod_count: i64,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock is before unix epoch")
        .as_secs() as i64
}

fn row_to_creator_bookmark(row: &Row) -> rusqlite::Result<CreatorBookmark> {
    Ok(CreatorBookmark {
        gamebanana_member_id: row.get("gamebanana_member_id")?,
        name: row.get("name")?,
        avatar_url: row.get("avatar_url")?,
        mod_count: row.get("mod_count")?,
        added_at: row.get("added_at")?,
    })
}

impl Db {
    /// Re-adding an already-saved creator refreshes the cached name, avatar and count rather
    /// than erroring or duplicating — `gamebanana_member_id` is the primary key. Members rename
    /// themselves and change avatars, so the copy held here is worth updating on every save.
    pub fn add_creator_bookmark(
        &self,
        new: NewCreatorBookmark,
    ) -> rusqlite::Result<CreatorBookmark> {
        self.conn.execute(
            "INSERT INTO creator_bookmarks
                (gamebanana_member_id, name, avatar_url, mod_count, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(gamebanana_member_id) DO UPDATE SET
                name = excluded.name,
                avatar_url = excluded.avatar_url,
                mod_count = excluded.mod_count",
            params![
                new.gamebanana_member_id,
                new.name,
                new.avatar_url,
                new.mod_count,
                now()
            ],
        )?;
        self.conn.query_row(
            "SELECT * FROM creator_bookmarks WHERE gamebanana_member_id = ?1",
            params![new.gamebanana_member_id],
            row_to_creator_bookmark,
        )
    }

    pub fn remove_creator_bookmark(&self, gamebanana_member_id: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "DELETE FROM creator_bookmarks WHERE gamebanana_member_id = ?1",
            params![gamebanana_member_id],
        )?;
        Ok(())
    }

    /// Newest first, matching `list_bookmarks` — the creator saved most recently is the one most
    /// likely to be wanted again, and it puts new arrivals where they will be seen rather than
    /// off the right-hand end of the bar.
    pub fn list_creator_bookmarks(&self) -> rusqlite::Result<Vec<CreatorBookmark>> {
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM creator_bookmarks ORDER BY added_at DESC")?;
        let rows = stmt.query_map([], row_to_creator_bookmark)?;
        rows.collect()
    }

    pub fn is_creator_bookmarked(&self, gamebanana_member_id: i64) -> rusqlite::Result<bool> {
        self.conn
            .query_row(
                "SELECT 1 FROM creator_bookmarks WHERE gamebanana_member_id = ?1",
                params![gamebanana_member_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map(|found| found.is_some())
    }

    /// Refreshes a saved creator's cached name, avatar and mod count from a page visit.
    ///
    /// A no-op for anyone not bookmarked — visiting a creator is not a reason to start following
    /// them. `added_at` is deliberately untouched: this is bookkeeping about someone already
    /// saved, not a new save, and bumping it would reshuffle the bar every time a page was
    /// opened. Same reasoning as the bookmark character backfill.
    pub fn refresh_creator_bookmark(
        &self,
        gamebanana_member_id: i64,
        name: &str,
        avatar_url: Option<&str>,
        mod_count: i64,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE creator_bookmarks
                SET name = ?2, avatar_url = ?3, mod_count = ?4
              WHERE gamebanana_member_id = ?1",
            params![gamebanana_member_id, name, avatar_url, mod_count],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Db {
        Db::open_in_memory().expect("in-memory db")
    }

    fn new_creator(id: i64, name: &str, mod_count: i64) -> NewCreatorBookmark {
        NewCreatorBookmark {
            gamebanana_member_id: id,
            name: name.to_string(),
            avatar_url: Some("https://images.gamebanana.com/img/av/a.png".to_string()),
            mod_count,
        }
    }

    #[test]
    fn adds_and_lists_a_creator() {
        let db = db();
        db.add_creator_bookmark(new_creator(1, "emsterchu", 47))
            .unwrap();

        let saved = db.list_creator_bookmarks().unwrap();
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].name, "emsterchu");
        assert_eq!(saved[0].mod_count, 47);
        assert!(db.is_creator_bookmarked(1).unwrap());
    }

    #[test]
    fn re_adding_refreshes_rather_than_duplicating() {
        let db = db();
        db.add_creator_bookmark(new_creator(1, "old name", 10))
            .unwrap();
        db.add_creator_bookmark(new_creator(1, "new name", 12))
            .unwrap();

        let saved = db.list_creator_bookmarks().unwrap();
        assert_eq!(saved.len(), 1, "member id is the primary key");
        assert_eq!(saved[0].name, "new name");
        assert_eq!(saved[0].mod_count, 12);
    }

    #[test]
    fn removes_a_creator() {
        let db = db();
        db.add_creator_bookmark(new_creator(1, "emsterchu", 47))
            .unwrap();
        db.remove_creator_bookmark(1).unwrap();

        assert!(db.list_creator_bookmarks().unwrap().is_empty());
        assert!(!db.is_creator_bookmarked(1).unwrap());
    }

    #[test]
    fn refresh_updates_the_count_but_not_the_saved_date() {
        let db = db();
        let saved = db
            .add_creator_bookmark(new_creator(1, "emsterchu", 47))
            .unwrap();

        db.refresh_creator_bookmark(1, "emsterchu", None, 51)
            .unwrap();

        let after = db.list_creator_bookmarks().unwrap();
        assert_eq!(after[0].mod_count, 51);
        assert_eq!(after[0].avatar_url, None);
        assert_eq!(
            after[0].added_at, saved.added_at,
            "a visit is not a re-save and must not reorder the bar"
        );
    }

    #[test]
    fn refreshing_someone_unsaved_does_nothing() {
        let db = db();
        db.refresh_creator_bookmark(99, "stranger", None, 5)
            .unwrap();
        assert!(db.list_creator_bookmarks().unwrap().is_empty());
    }
}
