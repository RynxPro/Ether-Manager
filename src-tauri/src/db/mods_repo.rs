use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::Db;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Slot {
    Outfit,
    Weapon,
    Hair,
    Other,
}

impl Slot {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Slot::Outfit => "Outfit",
            Slot::Weapon => "Weapon",
            Slot::Hair => "Hair",
            Slot::Other => "Other",
        }
    }

    fn from_str(value: &str) -> Option<Self> {
        match value {
            "Outfit" => Some(Slot::Outfit),
            "Weapon" => Some(Slot::Weapon),
            "Hair" => Some(Slot::Hair),
            "Other" => Some(Slot::Other),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Mod {
    pub id: i64,
    pub character_id: String,
    pub slot: Slot,
    pub display_name: String,
    pub folder_path: String,
    pub enabled: bool,
    pub thumbnail_path: Option<String>,
    pub gamebanana_mod_id: Option<i64>,
    pub gamebanana_file_id: Option<i64>,
    pub gamebanana_md5: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct NewMod {
    pub character_id: String,
    pub slot: Slot,
    pub display_name: String,
    pub folder_path: String,
    pub thumbnail_path: Option<String>,
    pub gamebanana_mod_id: Option<i64>,
    pub gamebanana_file_id: Option<i64>,
    pub gamebanana_md5: Option<String>,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock is before unix epoch")
        .as_secs() as i64
}

fn row_to_mod(row: &Row) -> rusqlite::Result<Mod> {
    let slot_str: String = row.get("slot")?;
    let slot = Slot::from_str(&slot_str).ok_or_else(|| {
        rusqlite::Error::InvalidColumnType(0, "slot".to_string(), rusqlite::types::Type::Text)
    })?;
    Ok(Mod {
        id: row.get("id")?,
        character_id: row.get("character_id")?,
        slot,
        display_name: row.get("display_name")?,
        folder_path: row.get("folder_path")?,
        enabled: row.get::<_, i64>("enabled")? != 0,
        thumbnail_path: row.get("thumbnail_path")?,
        gamebanana_mod_id: row.get("gamebanana_mod_id")?,
        gamebanana_file_id: row.get("gamebanana_file_id")?,
        gamebanana_md5: row.get("gamebanana_md5")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

impl Db {
    pub fn insert_mod(&self, new: NewMod) -> rusqlite::Result<Mod> {
        let ts = now();
        self.conn.execute(
            "INSERT INTO mods (character_id, slot, display_name, folder_path, enabled, thumbnail_path, gamebanana_mod_id, gamebanana_file_id, gamebanana_md5, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8, ?9, ?9)",
            params![
                new.character_id,
                new.slot.as_str(),
                new.display_name,
                new.folder_path,
                new.thumbnail_path,
                new.gamebanana_mod_id,
                new.gamebanana_file_id,
                new.gamebanana_md5,
                ts,
            ],
        )?;
        let id = self.conn.last_insert_rowid();
        self.get_mod(id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    pub fn get_mod(&self, id: i64) -> rusqlite::Result<Option<Mod>> {
        self.conn
            .query_row("SELECT * FROM mods WHERE id = ?1", params![id], row_to_mod)
            .optional()
    }

    pub fn list_mods_for_character(&self, character_id: &str) -> rusqlite::Result<Vec<Mod>> {
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM mods WHERE character_id = ?1 ORDER BY slot, display_name")?;
        let rows = stmt.query_map(params![character_id], row_to_mod)?;
        rows.collect()
    }

    pub fn set_enabled(&self, id: i64, enabled: bool) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE mods SET enabled = ?1, updated_at = ?2 WHERE id = ?3",
            params![enabled as i64, now(), id],
        )?;
        Ok(())
    }

    pub fn delete_mod(&self, id: i64) -> rusqlite::Result<()> {
        self.conn
            .execute("DELETE FROM mods WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Returns how many mods exist per character, for the Library grid to show which
    /// characters have mods installed without fetching every character's full mod list.
    pub fn count_mods_by_character(&self) -> rusqlite::Result<HashMap<String, i64>> {
        let mut stmt = self
            .conn
            .prepare("SELECT character_id, COUNT(*) FROM mods GROUP BY character_id")?;
        let rows = stmt.query_map([], |row| {
            let character_id: String = row.get(0)?;
            let count: i64 = row.get(1)?;
            Ok((character_id, count))
        })?;
        rows.collect()
    }

    pub fn update_folder_path(&self, id: i64, folder_path: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE mods SET folder_path = ?1, updated_at = ?2 WHERE id = ?3",
            params![folder_path, now(), id],
        )?;
        Ok(())
    }

    /// Combines what would otherwise be two separate writes (`set_enabled` +
    /// `update_folder_path`) into one atomic UPDATE. Used by `fs_ops::set_single_enabled`
    /// after a folder rename, so there's only one DB write — not two — that could be left
    /// half-applied if the app crashes at exactly the wrong moment.
    pub fn set_enabled_and_folder_path(
        &self,
        id: i64,
        enabled: bool,
        folder_path: &str,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE mods SET enabled = ?1, folder_path = ?2, updated_at = ?3 WHERE id = ?4",
            params![enabled as i64, folder_path, now(), id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new_test_mod(character_id: &str) -> NewMod {
        NewMod {
            character_id: character_id.to_string(),
            slot: Slot::Outfit,
            display_name: "Test Outfit".to_string(),
            folder_path: "Mods/Characters/Belle/Outfit/TestOutfit".to_string(),
            thumbnail_path: None,
            gamebanana_mod_id: None,
            gamebanana_file_id: None,
            gamebanana_md5: None,
        }
    }

    #[test]
    fn insert_and_get_round_trip() {
        let db = Db::open_in_memory().unwrap();
        let inserted = db.insert_mod(new_test_mod("belle")).unwrap();

        let fetched = db.get_mod(inserted.id).unwrap().unwrap();
        assert_eq!(fetched.character_id, "belle");
        assert_eq!(fetched.slot, Slot::Outfit);
        assert_eq!(fetched.display_name, "Test Outfit");
        assert!(!fetched.enabled);
        assert!(fetched.gamebanana_mod_id.is_none());
    }

    #[test]
    fn insert_mod_persists_gamebanana_fields_when_provided() {
        let db = Db::open_in_memory().unwrap();
        let mut new_mod = new_test_mod("belle");
        new_mod.gamebanana_mod_id = Some(608561);
        new_mod.gamebanana_file_id = Some(1481954);
        new_mod.gamebanana_md5 = Some("e3edc9a0bfdccedc6f2b28be4b28ac6e".to_string());

        let inserted = db.insert_mod(new_mod).unwrap();
        assert_eq!(inserted.gamebanana_mod_id, Some(608561));
        assert_eq!(inserted.gamebanana_file_id, Some(1481954));
        assert_eq!(
            inserted.gamebanana_md5,
            Some("e3edc9a0bfdccedc6f2b28be4b28ac6e".to_string())
        );
    }

    #[test]
    fn get_missing_mod_returns_none() {
        let db = Db::open_in_memory().unwrap();
        assert!(db.get_mod(999).unwrap().is_none());
    }

    #[test]
    fn list_mods_for_character_filters_correctly() {
        let db = Db::open_in_memory().unwrap();
        db.insert_mod(new_test_mod("belle")).unwrap();
        db.insert_mod(new_test_mod("belle")).unwrap();
        db.insert_mod(new_test_mod("anby-demara")).unwrap();

        let belle_mods = db.list_mods_for_character("belle").unwrap();
        assert_eq!(belle_mods.len(), 2);

        let anby_mods = db.list_mods_for_character("anby-demara").unwrap();
        assert_eq!(anby_mods.len(), 1);

        let none_mods = db.list_mods_for_character("nonexistent").unwrap();
        assert!(none_mods.is_empty());
    }

    #[test]
    fn set_enabled_toggles_state() {
        let db = Db::open_in_memory().unwrap();
        let inserted = db.insert_mod(new_test_mod("belle")).unwrap();
        assert!(!inserted.enabled);

        db.set_enabled(inserted.id, true).unwrap();
        assert!(db.get_mod(inserted.id).unwrap().unwrap().enabled);

        db.set_enabled(inserted.id, false).unwrap();
        assert!(!db.get_mod(inserted.id).unwrap().unwrap().enabled);
    }

    #[test]
    fn update_folder_path_persists_new_path() {
        let db = Db::open_in_memory().unwrap();
        let inserted = db.insert_mod(new_test_mod("belle")).unwrap();

        db.update_folder_path(
            inserted.id,
            "Mods/Characters/Belle/Outfit/DISABLED_TestOutfit",
        )
        .unwrap();

        let fetched = db.get_mod(inserted.id).unwrap().unwrap();
        assert_eq!(
            fetched.folder_path,
            "Mods/Characters/Belle/Outfit/DISABLED_TestOutfit"
        );
    }

    #[test]
    fn get_mod_errors_on_unparseable_slot_instead_of_silently_defaulting() {
        let db = Db::open_in_memory().unwrap();
        let inserted = db.insert_mod(new_test_mod("belle")).unwrap();

        // Simulate a corrupted/unexpected slot value landing in the DB (e.g. manual edit,
        // future schema drift) — this must surface as an error, not silently become "Other".
        db.conn
            .execute(
                "UPDATE mods SET slot = 'NotARealSlot' WHERE id = ?1",
                params![inserted.id],
            )
            .unwrap();

        let result = db.get_mod(inserted.id);
        assert!(
            result.is_err(),
            "unparseable slot must error, not silently default"
        );
    }

    #[test]
    fn delete_mod_removes_row() {
        let db = Db::open_in_memory().unwrap();
        let inserted = db.insert_mod(new_test_mod("belle")).unwrap();

        db.delete_mod(inserted.id).unwrap();
        assert!(db.get_mod(inserted.id).unwrap().is_none());
    }
}
