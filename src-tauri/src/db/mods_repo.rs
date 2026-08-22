use std::collections::HashMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::Db;
use crate::fs_ops;

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
    /// Where the mod's files actually are *right now*, `DISABLED_` prefix and all — so anything
    /// reading or writing those files can use it directly, including the frontend resolving
    /// `bundled_thumbnail` against it. The database stores the canonical spelling instead (see
    /// `fs_ops::canonical_path`); this is the resolved form, filled in by `row_to_mod`. When the
    /// folder is missing entirely it falls back to the canonical path, so messages still name
    /// somewhere.
    pub folder_path: String,
    /// Whether the game will load this mod, worked out from which spelling of the folder is on
    /// disk rather than read from a stored flag. Never persisted — see `fs_ops::Presence`.
    pub enabled: bool,
    /// Neither spelling of the folder exists: deleted or moved outside the app. Distinguishes
    /// "off" from "gone", which a bare `enabled: false` cannot.
    pub files_missing: bool,
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

/// One row, for a caller looking up a single mod. Asks the disk directly, which for one row is
/// cheaper than listing its directory — see `fs_ops::PresenceIndex`.
fn row_to_mod(row: &Row) -> rusqlite::Result<Mod> {
    build_mod(row, fs_ops::resolve_presence)
}

/// Builds a `Mod` from a row, with presence resolved by whichever strategy the caller passes.
///
/// The split exists because the right way to ask the disk depends on how many rows are being
/// read: one mod wants two `exists` calls, three hundred want one `read_dir`. Both produce the
/// same `Presence`, so everything below this line is shared.
fn build_mod(row: &Row, resolve: impl FnOnce(&Path) -> fs_ops::Presence) -> rusqlite::Result<Mod> {
    let slot_str: String = row.get("slot")?;
    let slot = Slot::from_str(&slot_str).ok_or_else(|| {
        rusqlite::Error::InvalidColumnType(0, "slot".to_string(), rusqlite::types::Type::Text)
    })?;
    // The disk is asked, every read, which of the two spellings of this mod's folder is there.
    // That is the only record of whether it is on: see `fs_ops::Presence` for why it is not also
    // kept in a column here.
    let stored: String = row.get("folder_path")?;
    let (folder_path, enabled, files_missing) = match resolve(Path::new(&stored)) {
        fs_ops::Presence::Enabled(path) => (path.to_string_lossy().into_owned(), true, false),
        fs_ops::Presence::Disabled(path) => (path.to_string_lossy().into_owned(), false, false),
        fs_ops::Presence::Missing => (stored, false, true),
    };

    Ok(Mod {
        id: row.get("id")?,
        character_id: row.get("character_id")?,
        slot,
        display_name: row.get("display_name")?,
        folder_path,
        enabled,
        files_missing,
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
        // Whatever the caller passes is stored canonical. Every installer creates the folder in
        // its `DISABLED_` spelling — a new mod arrives switched off — and storing that spelling
        // would smuggle the mod's on/off state back into this table, which is the thing that
        // could then disagree with the disk. Enforced here rather than at each call site so
        // there is one rule and no way to forget it.
        let folder_path = fs_ops::canonical_path(Path::new(&new.folder_path))
            .to_string_lossy()
            .into_owned();
        self.conn.execute(
            "INSERT INTO mods (character_id, slot, display_name, folder_path, thumbnail_url, gamebanana_mod_id, gamebanana_file_id, gamebanana_md5, variant_label, bundled_thumbnail, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
            params![
                new.character_id,
                new.slot.as_str(),
                new.display_name,
                folder_path,
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
        // One directory read answers for every mod in this character's folder — see
        // `fs_ops::PresenceIndex`. The index lives exactly as long as this query.
        let mut presence = fs_ops::PresenceIndex::new();
        let rows = stmt.query_map(params![character_id], |row| {
            build_mod(row, |path| presence.resolve(path))
        })?;
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
        let mut presence = fs_ops::PresenceIndex::new();
        let rows = stmt.query_map([], |row| build_mod(row, |path| presence.resolve(path)))?;
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
            params![
                character_id,
                slot.as_str(),
                fs_ops::canonical_path(Path::new(folder_path)).to_string_lossy(),
                now(),
                id
            ],
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
        let mut presence = fs_ops::PresenceIndex::new();
        let rows = stmt.query_map([], |row| build_mod(row, |path| presence.resolve(path)))?;
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
    ///
    /// The `enabled` tally cannot be a `SUM()` over a column any more, because whether a mod is
    /// on is a fact about the disk rather than something stored (see `fs_ops::Presence`). So the
    /// query narrows to the two fields the tally needs and the filesystem answers for each row.
    /// At the few hundred mods a real library reaches that is a few hundred `exists` calls behind
    /// one cached query — still far cheaper than the per-character queries this exists to avoid,
    /// and the price of the counts never disagreeing with the cards they sit above.
    pub fn count_mods_by_character(&self) -> rusqlite::Result<HashMap<String, ModCounts>> {
        let mut stmt = self
            .conn
            .prepare("SELECT character_id, folder_path FROM mods")?;
        let rows = stmt.query_map([], |row| {
            let character_id: String = row.get(0)?;
            let folder_path: String = row.get(1)?;
            Ok((character_id, folder_path))
        })?;

        let mut counts: HashMap<String, ModCounts> = HashMap::new();
        // The roster grid asks for this on every Library render, so it is one of the passes that
        // made the per-mod form expensive. One read per character folder now covers every mod
        // filed under it.
        let mut presence = fs_ops::PresenceIndex::new();
        for row in rows {
            let (character_id, folder_path) = row?;
            let entry = counts.entry(character_id).or_insert(ModCounts {
                total: 0,
                enabled: 0,
            });
            entry.total += 1;
            if matches!(
                presence.resolve(Path::new(&folder_path)),
                fs_ops::Presence::Enabled(_)
            ) {
                entry.enabled += 1;
            }
        }
        Ok(counts)
    }

    /// Points a mod at a card picture inside its own folder, or at none.
    ///
    /// Deliberately does not touch `updated_at`: choosing a picture is bookkeeping about how the
    /// mod is shown, not a change to the installed files.
    pub fn set_bundled_thumbnail(
        &self,
        id: i64,
        bundled_thumbnail: Option<&str>,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE mods SET bundled_thumbnail = ?1 WHERE id = ?2",
            params![bundled_thumbnail, id],
        )?;
        Ok(())
    }

    /// Stores the canonical spelling, for the reason given on `insert_mod`.
    pub fn update_folder_path(&self, id: i64, folder_path: &str) -> rusqlite::Result<()> {
        let folder_path = fs_ops::canonical_path(Path::new(folder_path))
            .to_string_lossy()
            .into_owned();
        self.conn.execute(
            "UPDATE mods SET folder_path = ?1, updated_at = ?2 WHERE id = ?3",
            params![folder_path, now(), id],
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

    fn test_root(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("ether-manager-mods-repo-{name}"));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    /// Inserts a mod *and* puts its folder on disk in the given state, the way an installer does.
    /// Both halves are needed now that `enabled` is read from the folder rather than a column —
    /// a row with no folder behind it is not "off", it is missing.
    fn insert_mod_on_disk(
        db: &Db,
        root: &std::path::Path,
        character_id: &str,
        leaf: &str,
        enabled: bool,
    ) -> Mod {
        let canonical = root.join(leaf);
        let on_disk = if enabled {
            canonical.clone()
        } else {
            fs_ops::disabled_path(&canonical)
        };
        std::fs::create_dir_all(&on_disk).unwrap();

        let mut new = new_test_mod(character_id);
        new.folder_path = canonical.to_string_lossy().into_owned();
        db.insert_mod(new).unwrap()
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
        let root = test_root("counts");
        insert_mod_on_disk(&db, &root, "belle", "on_one", true);
        insert_mod_on_disk(&db, &root, "belle", "off_one", false);
        insert_mod_on_disk(&db, &root, "anby-demara", "off_two", false);

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
    /// The bug this whole shape exists to make impossible: XXMI renames folders in the mods tree
    /// on every game launch, so a mod can be switched on or off by something that is not this
    /// app and cannot tell it. Reading the folder each time means that is simply the answer,
    /// with nothing to reconcile and no window in which the two disagree.
    fn enabled_follows_the_folder_even_when_another_program_renames_it() {
        let db = Db::open_in_memory().unwrap();
        let root = test_root("external-rename");
        let inserted = insert_mod_on_disk(&db, &root, "belle", "pinkdress", false);
        assert!(!inserted.enabled);
        assert!(!inserted.files_missing);

        // What XXMI's optimizer does, behind the app's back and with the app never told.
        let canonical = root.join("pinkdress");
        std::fs::rename(fs_ops::disabled_path(&canonical), &canonical).unwrap();

        let after = db.get_mod(inserted.id).unwrap().unwrap();
        assert!(after.enabled, "the disk says on, so the mod is on");
        assert!(!after.files_missing);
        assert_eq!(
            std::path::Path::new(&after.folder_path),
            canonical,
            "folder_path must resolve to where the files actually are"
        );
    }

    #[test]
    /// The list queries resolve presence through `fs_ops::PresenceIndex` rather than one
    /// `exists` pair per row, and this is the test that says the faster route gives the same
    /// answers. Every other end-to-end check of on/off/missing goes through `get_mod`, which
    /// takes the single-row route — so without this one the batch route would be covered only
    /// by the index's own unit tests, never as the library actually reads it.
    fn list_all_mods_reports_on_off_and_missing_the_same_as_get_mod() {
        let db = Db::open_in_memory().unwrap();
        let root = test_root("list-presence");
        let on = insert_mod_on_disk(&db, &root, "belle", "pinkdress", true);
        let off = insert_mod_on_disk(&db, &root, "belle", "bluedress", false);
        let gone = insert_mod_on_disk(&db, &root, "nicole", "goneaway", true);
        std::fs::remove_dir_all(root.join("goneaway")).unwrap();

        let listed = db.list_all_mods().unwrap();
        let by_id = |id: i64| listed.iter().find(|m| m.id == id).unwrap();

        assert!(by_id(on.id).enabled && !by_id(on.id).files_missing);
        assert!(!by_id(off.id).enabled && !by_id(off.id).files_missing);
        assert!(by_id(gone.id).files_missing && !by_id(gone.id).enabled);

        // And the two routes agree row for row, which is the actual claim being made.
        for listed_mod in &listed {
            let fetched = db.get_mod(listed_mod.id).unwrap().unwrap();
            assert_eq!(
                (listed_mod.enabled, listed_mod.files_missing, &listed_mod.folder_path),
                (fetched.enabled, fetched.files_missing, &fetched.folder_path),
                "batch and single-row presence disagreed for mod {}",
                listed_mod.id
            );
        }
    }

    #[test]
    /// The roster grid's counts come from the batch route too, and an `enabled` tally that
    /// disagreed with the cards below it is exactly the drift `Presence` exists to prevent.
    fn count_mods_by_character_tallies_enabled_from_the_disk() {
        let db = Db::open_in_memory().unwrap();
        let root = test_root("list-counts");
        insert_mod_on_disk(&db, &root, "belle", "pinkdress", true);
        insert_mod_on_disk(&db, &root, "belle", "bluedress", false);
        insert_mod_on_disk(&db, &root, "belle", "greendress", true);
        insert_mod_on_disk(&db, &root, "nicole", "hoodie", false);

        let counts = db.count_mods_by_character().unwrap();
        assert_eq!(counts["belle"].total, 3);
        assert_eq!(counts["belle"].enabled, 2);
        assert_eq!(counts["nicole"].total, 1);
        assert_eq!(counts["nicole"].enabled, 0);
    }

    #[test]
    /// The batch route must follow a rename made behind the app's back, same as `get_mod` does —
    /// XXMI renames folders in this tree every time the game launches.
    fn list_mods_for_character_follows_an_external_rename() {
        let db = Db::open_in_memory().unwrap();
        let root = test_root("list-external-rename");
        let inserted = insert_mod_on_disk(&db, &root, "belle", "pinkdress", false);
        assert!(!inserted.enabled);

        let canonical = root.join("pinkdress");
        std::fs::rename(fs_ops::disabled_path(&canonical), &canonical).unwrap();

        let listed = db.list_mods_for_character("belle").unwrap();
        assert_eq!(listed.len(), 1);
        assert!(listed[0].enabled, "the disk says on, so the list must too");
        assert_eq!(std::path::Path::new(&listed[0].folder_path), canonical);
    }

    #[test]
    /// "Off" and "gone" are different answers, and the library offers a destructive recovery for
    /// one of them — so a disabled mod must never be reported as missing.
    fn a_folder_that_exists_in_neither_spelling_is_missing_rather_than_off() {
        let db = Db::open_in_memory().unwrap();
        let root = test_root("missing");
        let inserted = insert_mod_on_disk(&db, &root, "belle", "pinkdress", false);
        assert!(!inserted.files_missing);

        std::fs::remove_dir_all(fs_ops::disabled_path(&root.join("pinkdress"))).unwrap();

        let after = db.get_mod(inserted.id).unwrap().unwrap();
        assert!(after.files_missing);
        assert!(!after.enabled);
    }

    #[test]
    /// Installers hand over the `DISABLED_` folder they just created; the table keeps the name
    /// that does not carry state, so the mod's on/off never gets written down in two places.
    fn insert_stores_the_canonical_path_whatever_spelling_it_is_given() {
        let db = Db::open_in_memory().unwrap();
        let root = test_root("canonical-insert");
        std::fs::create_dir_all(root.join("DISABLED_pinkdress")).unwrap();

        let mut new = new_test_mod("belle");
        new.folder_path = root
            .join("DISABLED_pinkdress")
            .to_string_lossy()
            .into_owned();
        let inserted = db.insert_mod(new).unwrap();

        let stored: String = db
            .conn
            .query_row(
                "SELECT folder_path FROM mods WHERE id = ?1",
                params![inserted.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(std::path::Path::new(&stored), root.join("pinkdress"));
        assert!(!inserted.enabled, "but it is still off, because the disk says so");
    }

    #[test]
    fn update_folder_path_stores_the_canonical_spelling_and_still_resolves() {
        let db = Db::open_in_memory().unwrap();
        let root = test_root("update-path");
        let inserted = insert_mod_on_disk(&db, &root, "belle", "pinkdress", false);

        // Relocate the folder the way `settle_mod_folders` would, keeping it switched off, and
        // tell the table about it using the path that actually exists.
        let moved = root.join("moved");
        std::fs::rename(
            fs_ops::disabled_path(&root.join("pinkdress")),
            fs_ops::disabled_path(&moved),
        )
        .unwrap();
        db.update_folder_path(inserted.id, &fs_ops::disabled_path(&moved).to_string_lossy())
            .unwrap();

        let stored: String = db
            .conn
            .query_row(
                "SELECT folder_path FROM mods WHERE id = ?1",
                params![inserted.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            std::path::Path::new(&stored),
            moved,
            "the prefix is state, not identity, so it is not what gets stored"
        );

        let fetched = db.get_mod(inserted.id).unwrap().unwrap();
        assert_eq!(
            std::path::Path::new(&fetched.folder_path),
            fs_ops::disabled_path(&moved),
            "but reads still resolve to the folder that is really there"
        );
        assert!(!fetched.enabled, "and moving it did not switch it on");
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
