mod bookmarks_repo;
mod downloads_repo;
mod mods_repo;
mod schema;
mod settings_repo;
mod update_checks_repo;

pub use bookmarks_repo::{Bookmark, NewBookmark};
pub use downloads_repo::{Download, DownloadStatus, NewDownload};
pub use mods_repo::{Mod, ModCounts, NewMod, Slot};
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
        self.migrate_thumbnail_column()?;
        self.migrate_downloads_etag_column()?;
        self.migrate_downloads_target_mod_column()?;
        self.migrate_legacy_slot_values()
    }

    /// `downloads.etag` arrived with pause/resume — it records which version of the remote file a
    /// staged partial came from, so resuming can send `If-Range` and get a clean restart rather
    /// than a corrupt splice if the file changed. `CREATE TABLE IF NOT EXISTS` leaves an existing
    /// table alone, so a database created between the downloads table shipping and this column
    /// being added would fail every download read on a missing column without this.
    /// Idempotent — only runs while the column is absent.
    fn migrate_downloads_etag_column(&self) -> rusqlite::Result<()> {
        let has_column: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('downloads') WHERE name = 'etag'",
            [],
            |row| row.get(0),
        )?;
        if has_column == 0 {
            self.conn
                .execute_batch("ALTER TABLE downloads ADD COLUMN etag TEXT;")?;
        }
        Ok(())
    }

    /// `downloads.target_mod_id` arrived with reinstall. A row carrying one replaces that mod's
    /// files in place instead of adding a second copy to the library, which is what lets a
    /// reinstall use the same queue — and so the same pause, resume, cancel and crash recovery —
    /// as a first install. Idempotent, same reasoning as the column above.
    fn migrate_downloads_target_mod_column(&self) -> rusqlite::Result<()> {
        let has_column: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('downloads') WHERE name = 'target_mod_id'",
            [],
            |row| row.get(0),
        )?;
        if has_column == 0 {
            self.conn
                .execute_batch("ALTER TABLE downloads ADD COLUMN target_mod_id INTEGER;")?;
        }
        Ok(())
    }

    /// `thumbnail_path` became `thumbnail_url`: mod previews are remote GameBanana images, not
    /// local files, and the old name described something the app never stored. `CREATE TABLE IF
    /// NOT EXISTS` leaves an existing table alone, so a database created before this rename
    /// still carries the old column and would fail every `row_to_mod` read without this.
    /// Idempotent — the rename only runs while the old name is still present.
    fn migrate_thumbnail_column(&self) -> rusqlite::Result<()> {
        let has_old_column: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('mods') WHERE name = 'thumbnail_path'",
            [],
            |row| row.get(0),
        )?;
        if has_old_column > 0 {
            self.conn
                .execute_batch("ALTER TABLE mods RENAME COLUMN thumbnail_path TO thumbnail_url;")?;
        }
        Ok(())
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

    fn column_names(db: &Db) -> Vec<String> {
        let mut stmt = db
            .conn
            .prepare("SELECT name FROM pragma_table_info('mods')")
            .unwrap();
        let rows = stmt.query_map([], |row| row.get::<_, String>(0)).unwrap();
        rows.map(Result::unwrap).collect()
    }

    /// Guards the upgrade path for databases created before the rename: they still carry
    /// `thumbnail_path`, and `CREATE TABLE IF NOT EXISTS` will not fix that, so without the
    /// migration every mod read would fail on a missing column.
    #[test]
    fn migrates_thumbnail_path_to_thumbnail_url_preserving_values_and_is_idempotent() {
        let db = Db::open_in_memory().unwrap();
        // Put the table back into its pre-rename shape, with a value to lose if the migration
        // ever gets rewritten as a drop-and-recreate.
        db.conn
            .execute_batch("ALTER TABLE mods RENAME COLUMN thumbnail_url TO thumbnail_path;")
            .unwrap();
        let id = insert_raw_legacy_row(&db, "belle", "Character Skin");
        db.conn
            .execute(
                "UPDATE mods SET thumbnail_path = ?1 WHERE id = ?2",
                params!["https://images.gamebanana.com/img/ss/mods/530-90_abc.jpg", id],
            )
            .unwrap();

        db.migrate_thumbnail_column().unwrap();
        db.migrate_thumbnail_column().unwrap();

        let columns = column_names(&db);
        assert!(
            columns.iter().any(|c| c == "thumbnail_url"),
            "expected a thumbnail_url column, got {columns:?}"
        );
        assert!(
            !columns.iter().any(|c| c == "thumbnail_path"),
            "the old column must be gone, got {columns:?}"
        );
        assert_eq!(
            db.get_mod(id).unwrap().unwrap().thumbnail_url.as_deref(),
            Some("https://images.gamebanana.com/img/ss/mods/530-90_abc.jpg"),
            "renaming the column must carry its values across, not reset them"
        );
    }

    /// A database already on the new shape must come through untouched — the guard is what
    /// makes this safe to run on every startup.
    #[test]
    fn thumbnail_migration_is_a_no_op_on_a_fresh_database() {
        let db = Db::open_in_memory().unwrap();
        db.migrate_thumbnail_column().unwrap();
        let columns = column_names(&db);
        assert!(columns.iter().any(|c| c == "thumbnail_url"));
        assert!(!columns.iter().any(|c| c == "thumbnail_path"));
    }

    /// Guards the upgrade path for databases created after the downloads table shipped but before
    /// resume added `etag` to it. Without the migration every download read fails on the missing
    /// column, which would take the whole Downloads page down rather than just losing resume.
    #[test]
    fn adds_the_downloads_etag_column_to_a_database_that_predates_it_and_is_idempotent() {
        let db = Db::open_in_memory().unwrap();
        db.conn
            .execute_batch("ALTER TABLE downloads DROP COLUMN etag;")
            .unwrap();

        db.migrate_downloads_etag_column().unwrap();
        db.migrate_downloads_etag_column().unwrap();

        let mut stmt = db
            .conn
            .prepare("SELECT name FROM pragma_table_info('downloads')")
            .unwrap();
        let columns: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert!(
            columns.iter().any(|c| c == "etag"),
            "expected an etag column, got {columns:?}"
        );
        // The read path is what actually breaks on a missing column, so exercise it rather than
        // trusting the pragma alone.
        assert!(db.list_downloads().unwrap().is_empty());
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
