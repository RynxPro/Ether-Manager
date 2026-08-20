mod bookmarks_repo;
mod downloads_repo;
mod mods_repo;
mod schema;
mod settings_repo;
mod update_checks_repo;

pub use bookmarks_repo::{Bookmark, NewBookmark};
pub use downloads_repo::{Download, DownloadStatus, NewDownload};
pub use mods_repo::{Mod, ModCounts, NewMod, Slot};
pub use settings_repo::MagnifierSettings;
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
        self.migrate_mods_variant_label_column()?;
        self.migrate_mods_bundled_thumbnail_column()?;
        self.migrate_bookmarks_character_column()?;
        self.migrate_derive_enabled_from_disk()?;
        self.migrate_legacy_slot_values()
    }

    /// `mods.enabled` used to record whether a mod was switched on — alongside a `folder_path`
    /// that carried the very same fact in its `DISABLED_` prefix. Two copies of one fact, in two
    /// different systems, written one after the other rather than together. They drifted in
    /// ordinary use: XXMI renames folders in this tree every time the game launches, so a mod it
    /// disabled left this table insisting the mod was on and still at a path nothing was at, and
    /// the library then offered to remove the "missing" mod that was sitting right there.
    ///
    /// The disk is now the only record (see `fs_ops::Presence`), so the column goes and every
    /// stored path is rewritten to its canonical spelling. Paths are rewritten *before* the drop,
    /// so an interrupted run leaves rows that still resolve rather than a half-migrated table.
    ///
    /// Refuses rather than guesses if two rows would end up sharing one canonical path — that
    /// would silently point two library entries at one folder and orphan the other's files. It is
    /// reachable only on databases predating `fs_ops::unique_mod_dir`, which now keeps both
    /// spellings of a name free at install time so it cannot arise again.
    ///
    /// Idempotent: after the first run there is no `enabled` column to find.
    fn migrate_derive_enabled_from_disk(&self) -> rusqlite::Result<()> {
        let has_column: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('mods') WHERE name = 'enabled'",
            [],
            |row| row.get(0),
        )?;
        if has_column == 0 {
            return Ok(());
        }

        let mut rows: Vec<(i64, String)> = Vec::new();
        {
            let mut stmt = self.conn.prepare("SELECT id, folder_path FROM mods")?;
            let mapped = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
            for row in mapped {
                rows.push(row?);
            }
        }

        let mut claimed: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
        let mut rewrites: Vec<(i64, String)> = Vec::new();
        for (id, stored) in rows {
            let canonical = crate::fs_ops::canonical_path(Path::new(&stored))
                .to_string_lossy()
                .into_owned();
            if let Some(other) = claimed.insert(canonical.to_lowercase(), id) {
                // SQLITE_CONSTRAINT: two rows cannot hold the same canonical folder, and this is
                // the one situation the migration must not resolve by picking a winner.
                return Err(rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error::new(19),
                    Some(format!(
                        "mods {other} and {id} both resolve to the folder {canonical}, so enabled \
                         state cannot be derived from disk without one of them losing its files; \
                         rename one of the folders and restart"
                    )),
                ));
            }
            if canonical != stored {
                rewrites.push((id, canonical));
            }
        }

        for (id, canonical) in rewrites {
            self.conn.execute(
                "UPDATE mods SET folder_path = ?1 WHERE id = ?2",
                rusqlite::params![canonical, id],
            )?;
        }

        self.conn
            .execute_batch("ALTER TABLE mods DROP COLUMN enabled;")?;
        Ok(())
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

    /// `mods.variant_label` names *which file* of a mod is installed — "Belle Bottom Heavy
    /// Nsfw", "Main file". It exists so `display_name` can go back to being just the mod's name:
    /// one string carrying both facts is what made names too long to read and left two files of
    /// one mod looking like two unrelated things.
    ///
    /// A short-lived earlier column, `gamebanana_file_description`, held only the uploader's
    /// note. This supersedes it — the note is one of the sources a label can come from, not the
    /// label itself — so where that column exists it is renamed rather than left behind as a
    /// second, subtly different answer to the same question.
    ///
    /// Left null on rows installed before this existed rather than backfilled: recovering it
    /// would mean a GameBanana request per mod at startup, to caption cards nobody is looking
    /// at. It fills itself in the next time a mod is installed, updated or reinstalled.
    /// Idempotent, same reasoning as the columns above.
    fn migrate_mods_variant_label_column(&self) -> rusqlite::Result<()> {
        let has_column = |name: &str| -> rusqlite::Result<bool> {
            let count: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM pragma_table_info('mods') WHERE name = ?1",
                [name],
                |row| row.get(0),
            )?;
            Ok(count > 0)
        };

        if has_column("variant_label")? {
            return Ok(());
        }
        if has_column("gamebanana_file_description")? {
            self.conn.execute_batch(
                "ALTER TABLE mods RENAME COLUMN gamebanana_file_description TO variant_label;",
            )?;
        } else {
            self.conn
                .execute_batch("ALTER TABLE mods ADD COLUMN variant_label TEXT;")?;
        }
        Ok(())
    }

    /// `mods.bundled_thumbnail` is card art that came in the box.
    ///
    /// A GameBanana mod has `thumbnail_url` and a server to fetch it from. A mod brought in from
    /// Patreon or Discord has neither, and would be the only blank card in the library — even
    /// though those archives routinely ship a preview image beside the mod folder. This records
    /// where that image ended up.
    ///
    /// Relative to the row's own `folder_path`, not absolute: `move_mod` rewrites `folder_path`
    /// when a mod is refiled, and an absolute path would be left pointing at where the mod used
    /// to be. Nullable and idempotent, same reasoning as the columns above.
    /// Named `bundled_thumbnail` rather than the more obvious `thumbnail_path` because this
    /// table has already used that name once, for what is now `thumbnail_url`. Reusing it would
    /// have `migrate_thumbnail_column` rename this column away on the next launch.
    fn migrate_mods_bundled_thumbnail_column(&self) -> rusqlite::Result<()> {
        let has_column: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('mods') WHERE name = 'bundled_thumbnail'",
            [],
            |row| row.get(0),
        )?;
        if has_column == 0 {
            self.conn
                .execute_batch("ALTER TABLE mods ADD COLUMN bundled_thumbnail TEXT;")?;
        }
        Ok(())
    }

    /// `bookmarks.character_id` lets the Bookmarks page group the way the library does, instead
    /// of showing one long undifferentiated wall. A bookmark is a GameBanana mod that was never
    /// installed, so nothing else on the row says who it is for.
    ///
    /// Nullable because it genuinely can be unknown: rows saved before this existed have none
    /// until `backfill_bookmark_characters` fetches it, and a mod filed under a category this
    /// app does not recognise has none at all. Idempotent, same reasoning as the columns above.
    fn migrate_bookmarks_character_column(&self) -> rusqlite::Result<()> {
        let has_column: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('bookmarks') WHERE name = 'character_id'",
            [],
            |row| row.get(0),
        )?;
        if has_column == 0 {
            self.conn
                .execute_batch("ALTER TABLE bookmarks ADD COLUMN character_id TEXT;")?;
        }
        Ok(())
    }

    /// `thumbnail_path` became `thumbnail_url`: mod previews are remote GameBanana images, not
    /// local files, and the old name described something the app never stored. `CREATE TABLE IF
    /// NOT EXISTS` leaves an existing table alone, so a database created before this rename
    /// still carries the old column and would fail every `row_to_mod` read without this.
    /// Idempotent — the rename only runs while the old name is still present *and* the new name
    /// is not. That second half matters: `thumbnail_path` is a retired name, and reusing it for
    /// anything else would have this migration quietly rename the new column away on the next
    /// launch, leaving the table with two `thumbnail_url` columns and every read failing. Any
    /// future column here needs a name this table has never used — see `bundled_thumbnail`.
    fn migrate_thumbnail_column(&self) -> rusqlite::Result<()> {
        let column_count = |name: &str| -> rusqlite::Result<i64> {
            self.conn.query_row(
                "SELECT COUNT(*) FROM pragma_table_info('mods') WHERE name = ?1",
                [name],
                |row| row.get(0),
            )
        };

        if column_count("thumbnail_path")? > 0 && column_count("thumbnail_url")? == 0 {
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
                "INSERT INTO mods (character_id, slot, display_name, folder_path, created_at, updated_at)
                 VALUES (?1, ?2, 'Legacy Mod', 'Mods/Characters/belle/x', 0, 0)",
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

    /// Puts a database back into the shape it had while `enabled` was a column, so the migration
    /// off it can be exercised.
    fn readd_enabled_column(db: &Db) {
        db.conn
            .execute_batch("ALTER TABLE mods ADD COLUMN enabled INTEGER NOT NULL DEFAULT 0;")
            .unwrap();
    }

    fn insert_raw_row_with_path(db: &Db, folder_path: &str) -> i64 {
        db.conn
            .execute(
                "INSERT INTO mods (character_id, slot, display_name, folder_path, enabled, created_at, updated_at)
                 VALUES ('belle', 'Character Skin', 'Legacy Mod', ?1, 0, 0, 0)",
                params![folder_path],
            )
            .unwrap();
        db.conn.last_insert_rowid()
    }

    fn stored_path(db: &Db, id: i64) -> String {
        db.conn
            .query_row(
                "SELECT folder_path FROM mods WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap()
    }

    /// The upgrade for databases created while on/off lived in a column as well as in the folder
    /// name: the column goes, and every stored path drops the prefix that duplicated it.
    #[test]
    fn migrating_off_the_enabled_column_canonicalises_paths_and_is_idempotent() {
        let db = Db::open_in_memory().unwrap();
        readd_enabled_column(&db);
        let disabled = insert_raw_row_with_path(&db, "Mods/Characters/belle/DISABLED_pinkdress");
        let already_clean = insert_raw_row_with_path(&db, "Mods/Characters/belle/neondream");

        db.migrate_derive_enabled_from_disk().unwrap();

        assert!(
            !column_names(&db).contains(&"enabled".to_string()),
            "the column that could disagree with the disk must be gone"
        );
        assert_eq!(
            Path::new(&stored_path(&db, disabled)),
            Path::new("Mods/Characters/belle/pinkdress")
        );
        assert_eq!(
            Path::new(&stored_path(&db, already_clean)),
            Path::new("Mods/Characters/belle/neondream"),
            "a path with no prefix is left exactly as it was"
        );

        // Runs on every startup, so a second pass must find nothing to do rather than fail.
        db.migrate_derive_enabled_from_disk().unwrap();
        assert_eq!(
            Path::new(&stored_path(&db, disabled)),
            Path::new("Mods/Characters/belle/pinkdress")
        );
    }

    /// Two rows canonicalising onto one folder would leave both library entries pointing at the
    /// same files and orphan the other's. Refusing is the only safe answer — the app fails to
    /// start with a message naming the rows, rather than quietly picking a winner.
    #[test]
    fn migrating_refuses_when_two_mods_would_share_one_canonical_folder() {
        let db = Db::open_in_memory().unwrap();
        readd_enabled_column(&db);
        insert_raw_row_with_path(&db, "Mods/Characters/belle/pinkdress");
        insert_raw_row_with_path(&db, "Mods/Characters/belle/DISABLED_pinkdress");

        let err = db.migrate_derive_enabled_from_disk().unwrap_err();
        assert!(
            err.to_string().contains("both resolve to the folder"),
            "unexpected error: {err}"
        );
        assert!(
            column_names(&db).contains(&"enabled".to_string()),
            "nothing is dropped when the migration cannot complete"
        );
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

    /// The hazard that reusing a retired column name creates, caught the hard way.
    ///
    /// `bundled_thumbnail` was first written as `thumbnail_path` — a name this table had already
    /// used for what is now `thumbnail_url`. Every launch, `migrate_thumbnail_column` saw the
    /// old name and renamed the *new* column onto `thumbnail_url`, leaving two columns by that
    /// name and failing every read of the table. This pins both halves of the fix: the new
    /// column keeps a name that has never been used here, and the old migration checks the
    /// destination is free before renaming anything onto it.
    #[test]
    fn a_retired_column_name_is_never_renamed_onto_a_name_already_in_use() {
        let db = Db::open_in_memory().unwrap();
        // A database old enough to still carry the retired name, on a build new enough to have
        // the column that replaced it — the shape that used to corrupt the table.
        db.conn
            .execute_batch("ALTER TABLE mods ADD COLUMN thumbnail_path TEXT;")
            .unwrap();

        db.migrate_thumbnail_column().unwrap();
        db.migrate_mods_bundled_thumbnail_column().unwrap();

        let columns = column_names(&db);
        assert_eq!(
            columns.iter().filter(|c| *c == "thumbnail_url").count(),
            1,
            "the rename must not run onto a name that already exists, got {columns:?}"
        );
        assert!(
            columns.iter().any(|c| c == "bundled_thumbnail"),
            "the new column must survive a launch, got {columns:?}"
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
