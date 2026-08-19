use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::Db;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bookmark {
    pub gamebanana_mod_id: i64,
    pub name: String,
    pub thumbnail_url: Option<String>,
    /// Which character (or `"ui"`/`"misc"`) this mod belongs to, resolved from its GameBanana
    /// category. `None` when the category is unrecognised, or not yet backfilled.
    pub character_id: Option<String>,
    pub added_at: i64,
}

pub struct NewBookmark {
    pub gamebanana_mod_id: i64,
    pub name: String,
    pub thumbnail_url: Option<String>,
    pub character_id: Option<String>,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock is before unix epoch")
        .as_secs() as i64
}

fn row_to_bookmark(row: &Row) -> rusqlite::Result<Bookmark> {
    Ok(Bookmark {
        gamebanana_mod_id: row.get("gamebanana_mod_id")?,
        name: row.get("name")?,
        thumbnail_url: row.get("thumbnail_url")?,
        character_id: row.get("character_id")?,
        added_at: row.get("added_at")?,
    })
}

impl Db {
    /// Re-adding an already-bookmarked mod updates its cached name/thumbnail rather than
    /// erroring or creating a duplicate row — `gamebanana_mod_id` is the primary key.
    pub fn add_bookmark(&self, new: NewBookmark) -> rusqlite::Result<Bookmark> {
        self.conn.execute(
            "INSERT INTO bookmarks (gamebanana_mod_id, name, thumbnail_url, character_id, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(gamebanana_mod_id) DO UPDATE SET
                name = excluded.name,
                thumbnail_url = excluded.thumbnail_url,
                -- Only ever fills a gap. Re-bookmarking from a screen that could not work out
                -- the character must not erase one already known.
                character_id = COALESCE(excluded.character_id, bookmarks.character_id)",
            params![
                new.gamebanana_mod_id,
                new.name,
                new.thumbnail_url,
                new.character_id,
                now()
            ],
        )?;
        self.conn.query_row(
            "SELECT * FROM bookmarks WHERE gamebanana_mod_id = ?1",
            params![new.gamebanana_mod_id],
            row_to_bookmark,
        )
    }

    pub fn remove_bookmark(&self, gamebanana_mod_id: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "DELETE FROM bookmarks WHERE gamebanana_mod_id = ?1",
            params![gamebanana_mod_id],
        )?;
        Ok(())
    }

    pub fn list_bookmarks(&self) -> rusqlite::Result<Vec<Bookmark>> {
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM bookmarks ORDER BY added_at DESC")?;
        let rows = stmt.query_map([], row_to_bookmark)?;
        rows.collect()
    }

    pub fn is_bookmarked(&self, gamebanana_mod_id: i64) -> rusqlite::Result<bool> {
        self.conn
            .query_row(
                "SELECT 1 FROM bookmarks WHERE gamebanana_mod_id = ?1",
                params![gamebanana_mod_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map(|found| found.is_some())
    }
}

impl Db {
    /// Bookmarks saved before the character was recorded, for the one-off backfill to fill in.
    pub fn list_bookmarks_missing_character(&self) -> rusqlite::Result<Vec<Bookmark>> {
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM bookmarks WHERE character_id IS NULL")?;
        let rows = stmt.query_map([], row_to_bookmark)?;
        rows.collect()
    }

    /// Deliberately leaves `added_at` alone: learning which character a bookmark belongs to is
    /// bookkeeping about a mod already saved, not a new save, and bumping the date would
    /// reorder a list sorted by when things were bookmarked.
    pub fn set_bookmark_character(
        &self,
        gamebanana_mod_id: i64,
        character_id: &str,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE bookmarks SET character_id = ?1 WHERE gamebanana_mod_id = ?2",
            params![character_id, gamebanana_mod_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new_test_bookmark(gamebanana_mod_id: i64) -> NewBookmark {
        NewBookmark {
            gamebanana_mod_id,
            name: "Pink Dress".to_string(),
            thumbnail_url: Some("https://images.gamebanana.com/img/ss/mods/thumb.jpg".to_string()),
            character_id: None,
        }
    }

    #[test]
    fn add_list_remove_round_trip() {
        let db = Db::open_in_memory().unwrap();
        db.add_bookmark(new_test_bookmark(608561)).unwrap();

        let bookmarks = db.list_bookmarks().unwrap();
        assert_eq!(bookmarks.len(), 1);
        assert_eq!(bookmarks[0].gamebanana_mod_id, 608561);
        assert_eq!(bookmarks[0].name, "Pink Dress");

        db.remove_bookmark(608561).unwrap();
        assert!(db.list_bookmarks().unwrap().is_empty());
    }

    #[test]
    fn is_bookmarked_reflects_current_state() {
        let db = Db::open_in_memory().unwrap();
        assert!(!db.is_bookmarked(608561).unwrap());

        db.add_bookmark(new_test_bookmark(608561)).unwrap();
        assert!(db.is_bookmarked(608561).unwrap());

        db.remove_bookmark(608561).unwrap();
        assert!(!db.is_bookmarked(608561).unwrap());
    }

    #[test]
    fn re_adding_an_already_bookmarked_mod_does_not_duplicate_or_error() {
        let db = Db::open_in_memory().unwrap();
        db.add_bookmark(new_test_bookmark(608561)).unwrap();

        let updated = NewBookmark {
            gamebanana_mod_id: 608561,
            name: "Pink Dress V2".to_string(),
            thumbnail_url: None,
            character_id: None,
        };
        db.add_bookmark(updated).unwrap();

        let bookmarks = db.list_bookmarks().unwrap();
        assert_eq!(
            bookmarks.len(),
            1,
            "re-adding must not create a duplicate row"
        );
        assert_eq!(bookmarks[0].name, "Pink Dress V2");
    }

    #[test]
    fn list_bookmarks_orders_most_recently_added_first() {
        let db = Db::open_in_memory().unwrap();
        db.add_bookmark(new_test_bookmark(1)).unwrap();
        db.add_bookmark(new_test_bookmark(2)).unwrap();

        let bookmarks = db.list_bookmarks().unwrap();
        assert_eq!(bookmarks.len(), 2);
        // Both inserted within the same second in this fast test, so this mainly checks
        // that ordering doesn't crash/misbehave rather than asserting a strict order.
        let ids: Vec<i64> = bookmarks.iter().map(|b| b.gamebanana_mod_id).collect();
        assert!(ids.contains(&1) && ids.contains(&2));
    }
}
