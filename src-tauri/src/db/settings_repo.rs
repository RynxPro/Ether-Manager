use rusqlite::{params, OptionalExtension};

use super::Db;
use crate::content_rating::MatureVisibility;

/// Defined once, here — the generic `get_setting`/`set_setting` store means any key string
/// duplicated elsewhere would silently miss this one, exactly the bug this constant prevents.
const MATURE_CONTENT_VISIBILITY_KEY: &str = "mature_content_visibility";

impl Db {
    pub fn get_setting(&self, key: &str) -> rusqlite::Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    /// No stored row (fresh install, or any existing Milestone 1-3 database — this key didn't
    /// exist before this milestone and there is no schema-migration mechanism to backfill it)
    /// defaults to `MatureVisibility::DEFAULT` at read time, applied identically either way.
    /// A stored value that fails to parse errors rather than silently defaulting — unlike a
    /// third-party API's field, this value is entirely our own, so an unparseable value means
    /// real corruption, not expected drift.
    pub fn get_mature_content_visibility(&self) -> rusqlite::Result<MatureVisibility> {
        match self.get_setting(MATURE_CONTENT_VISIBILITY_KEY)? {
            None => Ok(MatureVisibility::DEFAULT),
            Some(value) => MatureVisibility::from_str(&value).ok_or_else(|| {
                rusqlite::Error::InvalidColumnType(
                    0,
                    MATURE_CONTENT_VISIBILITY_KEY.to_string(),
                    rusqlite::types::Type::Text,
                )
            }),
        }
    }

    pub fn set_mature_content_visibility(&self, value: MatureVisibility) -> rusqlite::Result<()> {
        self.set_setting(MATURE_CONTENT_VISIBILITY_KEY, value.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_and_get_round_trip() {
        let db = Db::open_in_memory().unwrap();
        db.set_setting("mods_folder", "D:/Games/ZZZ/Mods").unwrap();

        let value = db.get_setting("mods_folder").unwrap();
        assert_eq!(value, Some("D:/Games/ZZZ/Mods".to_string()));
    }

    #[test]
    fn get_missing_key_returns_none() {
        let db = Db::open_in_memory().unwrap();
        assert!(db.get_setting("nonexistent").unwrap().is_none());
    }

    #[test]
    fn set_setting_overwrites_existing_value() {
        let db = Db::open_in_memory().unwrap();
        db.set_setting("mods_folder", "C:/old/path").unwrap();
        db.set_setting("mods_folder", "D:/new/path").unwrap();

        let value = db.get_setting("mods_folder").unwrap();
        assert_eq!(value, Some("D:/new/path".to_string()));
    }

    #[test]
    fn mature_content_visibility_defaults_to_blur_with_no_row_written() {
        let db = Db::open_in_memory().unwrap();

        let value = db.get_mature_content_visibility().unwrap();

        assert_eq!(value, MatureVisibility::Blur);
        assert!(
            db.get_setting(MATURE_CONTENT_VISIBILITY_KEY)
                .unwrap()
                .is_none(),
            "reading the default must not write a row — a fresh and an existing pre-Milestone-4 \
             database must behave identically with no migration"
        );
    }

    #[test]
    fn mature_content_visibility_round_trips_every_value() {
        let db = Db::open_in_memory().unwrap();
        for value in [
            MatureVisibility::Show,
            MatureVisibility::Blur,
            MatureVisibility::Hide,
        ] {
            db.set_mature_content_visibility(value).unwrap();
            assert_eq!(db.get_mature_content_visibility().unwrap(), value);
        }
    }

    #[test]
    fn mature_content_visibility_set_overwrites_rather_than_duplicating() {
        let db = Db::open_in_memory().unwrap();
        db.set_mature_content_visibility(MatureVisibility::Show)
            .unwrap();
        db.set_mature_content_visibility(MatureVisibility::Hide)
            .unwrap();

        assert_eq!(
            db.get_mature_content_visibility().unwrap(),
            MatureVisibility::Hide
        );
    }

    #[test]
    fn mature_content_visibility_errors_on_a_corrupted_stored_value_instead_of_silently_defaulting()
    {
        let db = Db::open_in_memory().unwrap();
        db.set_setting(MATURE_CONTENT_VISIBILITY_KEY, "NotAVisibility")
            .unwrap();

        assert!(
            db.get_mature_content_visibility().is_err(),
            "a corrupted stored value must error, not silently fall back to the default"
        );
    }
}
