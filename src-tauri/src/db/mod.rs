mod bookmarks_repo;
mod mods_repo;
mod schema;
mod settings_repo;
mod update_checks_repo;

pub use bookmarks_repo::{Bookmark, NewBookmark};
pub use mods_repo::{Mod, NewMod, Slot};
pub use update_checks_repo::UpdateCheck;

use rusqlite::Connection;
use std::path::Path;

pub struct Db {
    conn: Connection,
}

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        let db = Self { conn };
        db.init_schema()?;
        Ok(db)
    }

    pub fn open_in_memory() -> rusqlite::Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self { conn };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> rusqlite::Result<()> {
        self.conn.execute_batch(schema::SCHEMA_SQL)?;
        self.migrate_legacy_slot_values()
    }

    /// One-time data migration covering both rounds of the `Slot` enum rename: the original
    /// Outfit/Weapon/Hair/Other -> CharacterSkin/CharacterUI/Ui/Misc pass, and the later removal
    /// of the per-character `CharacterUI` slot in favor of a global `Misc` bucket. Without this,
    /// any mod installed under an older shape would have an unparseable `slot` value and error
    /// on load (this app deliberately fails loud on that rather than silently defaulting, see
    /// `mods_repo::get_mod`). Idempotent: runs every startup, but only matches rows still
    /// holding a pre-rename value, so it's a no-op after the first run.
    ///
    /// Weapon/Hair fold into Character Skin (GameBanana doesn't distinguish them as separate
    /// categories either). Other and the now-removed Character UI both fold into the global
    /// Misc pseudo-character — `character_id` is rewritten to `"misc"` alongside the slot, since
    /// a `slot = 'Misc'` row is only meaningful paired with the `"misc"` pseudo-character; leaving
    /// the old real `character_id` in place would silently orphan the row (it wouldn't show up
    /// on that character's page anymore, nor in the Misc section).
    fn migrate_legacy_slot_values(&self) -> rusqlite::Result<()> {
        self.conn.execute_batch(
            "UPDATE mods SET slot = 'Character Skin' WHERE slot IN ('Outfit', 'Weapon', 'Hair');
             UPDATE mods SET character_id = 'misc', slot = 'Misc' WHERE slot IN ('Other', 'Character UI');",
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn insert_raw_legacy_row(db: &Db, character_id: &str, legacy_slot: &str) -> i64 {
        db.conn
            .execute(
                "INSERT INTO mods (character_id, slot, display_name, folder_path, enabled, created_at, updated_at)
                 VALUES (?1, ?2, 'Legacy Mod', 'Mods/Characters/belle/x', 0, 0, 0)",
                params![character_id, legacy_slot],
            )
            .unwrap();
        db.conn.last_insert_rowid()
    }

    #[test]
    fn migrates_outfit_weapon_hair_to_character_skin() {
        let db = Db::open_in_memory().unwrap();
        let outfit_id = insert_raw_legacy_row(&db, "belle", "Outfit");
        let weapon_id = insert_raw_legacy_row(&db, "belle", "Weapon");
        let hair_id = insert_raw_legacy_row(&db, "belle", "Hair");

        db.migrate_legacy_slot_values().unwrap();

        for id in [outfit_id, weapon_id, hair_id] {
            assert_eq!(db.get_mod(id).unwrap().unwrap().slot, Slot::CharacterSkin);
        }
    }

    #[test]
    fn migrates_other_and_character_ui_to_the_global_misc_pseudo_character() {
        let db = Db::open_in_memory().unwrap();
        let other_id = insert_raw_legacy_row(&db, "belle", "Other");
        let character_ui_id = insert_raw_legacy_row(&db, "anby-demara", "Character UI");

        db.migrate_legacy_slot_values().unwrap();

        for id in [other_id, character_ui_id] {
            let mod_row = db.get_mod(id).unwrap().unwrap();
            assert_eq!(mod_row.slot, Slot::Misc);
            assert_eq!(
                mod_row.character_id, "misc",
                "a Misc-slot row must be reassigned to the misc pseudo-character, not left \
                 under its old real character_id, or it would be orphaned from both pages"
            );
        }
    }

    #[test]
    fn migration_is_idempotent_and_leaves_current_values_untouched() {
        let db = Db::open_in_memory().unwrap();
        let id = insert_raw_legacy_row(&db, "misc", "Misc");

        db.migrate_legacy_slot_values().unwrap();
        db.migrate_legacy_slot_values().unwrap();

        let mod_row = db.get_mod(id).unwrap().unwrap();
        assert_eq!(mod_row.slot, Slot::Misc);
        assert_eq!(mod_row.character_id, "misc");
    }
}
