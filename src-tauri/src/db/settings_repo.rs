use rusqlite::{params, OptionalExtension};

use super::Db;

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
}
