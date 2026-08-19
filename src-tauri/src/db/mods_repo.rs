use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::Db;

/// `CharacterSkin` is scoped to a real character (`character_id` is one of the 60 rows from
/// `characters::all_characters()`). `Ui`/`Misc` are scoped to the two pseudo-characters
/// `"ui"`/`"misc"` instead (see `characters::UI_PSEUDO_CHARACTER_ID`/`MISC_PSEUDO_CHARACTER_ID`)
/// — global categories with no character association. There's deliberately no per-character
/// "UI" slot: GameBanana doesn't distinguish a character-specific UI mod from a general one at
/// the category level either (its "UI" root category has no per-character subcategories, unlike
/// "Character Skins"), so a structural split here would just be a decision the user has to make
/// with no data to back it up. A UI mod that happens to be for one character goes in the global
/// `Ui` bucket like any other — its name can say so if it matters.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Slot {
    CharacterSkin,
    Ui,
    Misc,
}

impl Slot {
    /// Used as both the DB TEXT value and the on-disk folder name (spaces are valid in folder
    /// names on every platform this app targets) — same dual-purpose pattern as before.
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Slot::CharacterSkin => "Character Skin",
            Slot::Ui => "UI",
            Slot::Misc => "Misc",
        }
    }

    pub(crate) fn from_str(value: &str) -> Option<Self> {
        match value {
            "Character Skin" => Some(Slot::CharacterSkin),
            "UI" => Some(Slot::Ui),
            "Misc" => Some(Slot::Misc),
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
    pub thumbnail_url: Option<String>,
    pub gamebanana_mod_id: Option<i64>,
    pub gamebanana_file_id: Option<i64>,
    pub gamebanana_md5: Option<String>,
    /// Which of the mod's files this is, in words — "Belle Bottom Heavy Nsfw", "Main file".
    /// See `crate::variant_label`. Null for hand-added mods, for mods that ship a single file,
    /// for files nothing readable can be said about, and for rows predating this column.
    pub variant_label: Option<String>,
    /// Card art that came in the archive, as a path relative to `folder_path`. Set only for
    /// mods brought in from outside the app — a GameBanana mod uses `thumbnail_url` instead.
    /// Relative so refiling the mod cannot leave it pointing at the old folder.
    pub bundled_thumbnail: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Per-character mod tallies for the Library grid. `enabled` is a subset of `total`, and with
/// v1's one-enabled-mod-per-slot rule it is 0 or 1 for a real character.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModCounts {
    pub total: i64,
    pub enabled: i64,
}

pub struct NewMod {
    pub character_id: String,
    pub slot: Slot,
    pub display_name: String,
    pub folder_path: String,
    pub thumbnail_url: Option<String>,
    pub gamebanana_mod_id: Option<i64>,
    pub gamebanana_file_id: Option<i64>,
    pub gamebanana_md5: Option<String>,
    pub variant_label: Option<String>,
    pub bundled_thumbnail: Option<String>,
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
        thumbnail_url: row.get("thumbnail_url")?,
        gamebanana_mod_id: row.get("gamebanana_mod_id")?,
        gamebanana_file_id: row.get("gamebanana_file_id")?,
        gamebanana_md5: row.get("gamebanana_md5")?,
        variant_label: row.get("variant_label")?,
        bundled_thumbnail: row.get("bundled_thumbnail")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

impl Db {
    pub fn insert_mod(&self, new: NewMod) -> rusqlite::Result<Mod> {
        let ts = now();
        self.conn.execute(
            "INSERT INTO mods (character_id, slot, display_name, folder_path, enabled, thumbnail_url, gamebanana_mod_id, gamebanana_file_id, gamebanana_md5, variant_label, bundled_thumbnail, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
            params![
                new.character_id,
                new.slot.as_str(),
                new.display_name,
                new.folder_path,
                new.thumbnail_url,
                new.gamebanana_mod_id,
                new.gamebanana_file_id,
                new.gamebanana_md5,
                new.variant_label,
                new.bundled_thumbnail,
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

    /// Every installed mod, for Library's search. Filtering happens client-side rather than in
    /// SQL because a match must also consider the mod's *character name*, which lives in the
    /// bundled roster JSON and not in this table — and because at the few hundred rows a real
    /// library reaches, one cached read beats a query per keystroke.
    pub fn list_all_mods(&self) -> rusqlite::Result<Vec<Mod>> {
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM mods ORDER BY character_id, slot, display_name")?;
        let rows = stmt.query_map([], row_to_mod)?;
        rows.collect()
    }

    /// Renames a mod in the library only. The folder on disk keeps whatever name it was given
    /// at install time, because the two are deliberately not kept in step: the path is recorded
    /// per row and is the thing ZZMI reads, so moving a folder to chase a label would risk the
    /// working install for a cosmetic change. `updated_at` moves because the row did.
    pub fn set_display_name(&self, id: i64, display_name: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE mods SET display_name = ?1, updated_at = ?2 WHERE id = ?3",
            params![display_name, now(), id],
        )?;
        Ok(())
    }

    /// Refiles a mod under a different character (or the UI/Misc buckets) and records where its
    /// folder ended up. One statement rather than three, because a row whose `character_id` and
    /// `folder_path` disagree is a mod the library shows in one place and reads from another.
    pub fn set_location(
        &self,
        id: i64,
        character_id: &str,
        slot: Slot,
        folder_path: &str,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE mods SET character_id = ?1, slot = ?2, folder_path = ?3, updated_at = ?4 WHERE id = ?5",
            params![character_id, slot.as_str(), folder_path, now(), id],
        )?;
        Ok(())
    }

    pub fn set_enabled(&self, id: i64, enabled: bool) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE mods SET enabled = ?1, updated_at = ?2 WHERE id = ?3",
            params![enabled as i64, now(), id],
        )?;
        Ok(())
    }

    /// Deliberately does not touch `updated_at`: filling in a preview is bookkeeping about the
    /// mod's remote listing, not a change to the installed files, and letting it bump the
    /// timestamp would make a backfill look like every mod was just modified.
    pub fn set_thumbnail_url(&self, id: i64, url: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE mods SET thumbnail_url = ?1 WHERE id = ?2",
            params![url, id],
        )?;
        Ok(())
    }

    /// Also drops any cached update-check row for this mod — there is no `ON DELETE CASCADE`
    /// (foreign keys aren't enabled on this connection), so this must be done explicitly or a
    /// deleted mod's stale check row would silently outlive it.
    pub fn delete_mod(&self, id: i64) -> rusqlite::Result<()> {
        self.delete_update_check(id)?;
        self.conn
            .execute("DELETE FROM mods WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Mods installed from GameBanana — the set update detection needs to check. Locally
    /// added mods (`gamebanana_mod_id` is `None`) are never included.
    pub fn list_gamebanana_mods(&self) -> rusqlite::Result<Vec<Mod>> {
        let mut stmt = self
            .conn
            .prepare("SELECT * FROM mods WHERE gamebanana_mod_id IS NOT NULL ORDER BY id")?;
        let rows = stmt.query_map([], row_to_mod)?;
        rows.collect()
    }

    /// Records that an install/update now tracks a different GameBanana file for this row.
    /// The description moves with the file id because it describes *that* file. An update or a
    /// reinstall can land on a different file from the same mod — "SFW Variants Only" becoming
    /// "NSFW Variants Included" — and leaving the old note behind would caption the card with
    /// something the folder no longer contains. Passing `None` clears it, which is the honest
    /// result when the new file carries no note at all.
    pub fn set_gamebanana_file(
        &self,
        id: i64,
        gamebanana_file_id: i64,
        gamebanana_md5: &str,
        variant_label: Option<&str>,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE mods SET gamebanana_file_id = ?1, gamebanana_md5 = ?2, variant_label = ?3, updated_at = ?4 WHERE id = ?5",
            params![
                gamebanana_file_id,
                gamebanana_md5,
                variant_label,
                now(),
                id
            ],
        )?;
        Ok(())
    }

    /// Returns how many mods exist per character, for the Library grid to show which
    /// characters have mods installed without fetching every character's full mod list.
    /// Both counts in one pass — the Library grid shows "N mods · M on" per character, and
    /// fetching every character's mods just to count the enabled ones would be 60 queries for
    /// two numbers.
    pub fn count_mods_by_character(&self) -> rusqlite::Result<HashMap<String, ModCounts>> {
        let mut stmt = self.conn.prepare(
            "SELECT character_id, COUNT(*), COALESCE(SUM(enabled), 0) \
             FROM mods GROUP BY character_id",
        )?;
        let rows = stmt.query_map([], |row| {
            let character_id: String = row.get(0)?;
            let total: i64 = row.get(1)?;
            let enabled: i64 = row.get(2)?;
            Ok((character_id, ModCounts { total, enabled }))
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
            slot: Slot::CharacterSkin,
            display_name: "Test Outfit".to_string(),
            folder_path: "Mods/Characters/Belle/Character Skin/TestOutfit".to_string(),
            thumbnail_url: None,
            gamebanana_mod_id: None,
            gamebanana_file_id: None,
            gamebanana_md5: None,
            variant_label: None,
            bundled_thumbnail: None,
        }
    }

    #[test]
    fn list_all_mods_returns_every_character() {
        let db = Db::open_in_memory().unwrap();
        db.insert_mod(new_test_mod("belle")).unwrap();
        db.insert_mod(new_test_mod("belle")).unwrap();
        db.insert_mod(new_test_mod("anby-demara")).unwrap();

        let all = db.list_all_mods().unwrap();

        assert_eq!(all.len(), 3);
        // Grouped by character so search results stay stable between reads.
        assert_eq!(all[0].character_id, "anby-demara");
        assert_eq!(all[1].character_id, "belle");
        assert_eq!(all[2].character_id, "belle");
    }

    #[test]
    fn list_all_mods_is_empty_on_a_fresh_library() {
        let db = Db::open_in_memory().unwrap();
        assert!(db.list_all_mods().unwrap().is_empty());
    }

    #[test]
    fn count_mods_by_character_reports_total_and_enabled() {
        let db = Db::open_in_memory().unwrap();
        let a = db.insert_mod(new_test_mod("belle")).unwrap();
        db.insert_mod(new_test_mod("belle")).unwrap();
        db.insert_mod(new_test_mod("anby-demara")).unwrap();
        db.set_enabled(a.id, true).unwrap();

        let counts = db.count_mods_by_character().unwrap();

        assert_eq!(counts["belle"], ModCounts { total: 2, enabled: 1 });
        // A character with mods but none enabled must report 0, not be absent.
        assert_eq!(
            counts["anby-demara"],
            ModCounts {
                total: 1,
                enabled: 0
            }
        );
        // A character with no mods at all has no row — the UI treats a miss as zeroes.
        assert!(!counts.contains_key("ellen-joe"));
    }

    #[test]
    fn insert_and_get_round_trip() {
        let db = Db::open_in_memory().unwrap();
        let inserted = db.insert_mod(new_test_mod("belle")).unwrap();

        let fetched = db.get_mod(inserted.id).unwrap().unwrap();
        assert_eq!(fetched.character_id, "belle");
        assert_eq!(fetched.slot, Slot::CharacterSkin);
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
            "Mods/Characters/Belle/Character Skin/DISABLED_TestOutfit",
        )
        .unwrap();

        let fetched = db.get_mod(inserted.id).unwrap().unwrap();
        assert_eq!(
            fetched.folder_path,
            "Mods/Characters/Belle/Character Skin/DISABLED_TestOutfit"
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

    #[test]
    fn list_gamebanana_mods_excludes_locally_added_mods() {
        let db = Db::open_in_memory().unwrap();
        db.insert_mod(new_test_mod("belle")).unwrap();

        let mut gb_mod = new_test_mod("belle");
        gb_mod.gamebanana_mod_id = Some(608561);
        gb_mod.gamebanana_file_id = Some(1481954);
        gb_mod.gamebanana_md5 = Some("old-md5".to_string());
        let inserted_gb = db.insert_mod(gb_mod).unwrap();

        let gb_mods = db.list_gamebanana_mods().unwrap();
        assert_eq!(gb_mods.len(), 1);
        assert_eq!(gb_mods[0].id, inserted_gb.id);
    }

    #[test]
    fn set_gamebanana_file_updates_tracked_file_and_md5() {
        let db = Db::open_in_memory().unwrap();
        let mut new_mod = new_test_mod("belle");
        new_mod.gamebanana_mod_id = Some(608561);
        new_mod.gamebanana_file_id = Some(1481954);
        new_mod.gamebanana_md5 = Some("old-md5".to_string());
        let inserted = db.insert_mod(new_mod).unwrap();

        db.set_gamebanana_file(inserted.id, 1775946, "new-md5", Some("NSFW Variants Included"))
            .unwrap();

        let fetched = db.get_mod(inserted.id).unwrap().unwrap();
        assert_eq!(fetched.gamebanana_file_id, Some(1775946));
        assert_eq!(fetched.gamebanana_md5, Some("new-md5".to_string()));
        assert_eq!(
            fetched.variant_label,
            Some("NSFW Variants Included".to_string())
        );

        // A later file with no note of its own must clear the old one rather than leave the
        // card describing contents that are no longer there.
        db.set_gamebanana_file(inserted.id, 1775947, "newer-md5", None)
            .unwrap();
        assert_eq!(
            db.get_mod(inserted.id).unwrap().unwrap().variant_label,
            None
        );
    }
}
