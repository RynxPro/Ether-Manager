use super::Db;
use rusqlite::{params, Row};
use serde::{Deserialize, Serialize};

/// A named loadout, as the list shows it.
///
/// `mod_count` is the number of mods still installed that the preset asks for, not the number
/// of rows it holds. A preset that named six mods and has had two of them deleted says four,
/// because four is what applying it would actually switch on.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preset {
    pub id: i64,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub mod_count: i64,
    /// The mods it asks for, still-installed only, so a card can show their art without a
    /// query per preset. Small by nature — a loadout is tens of mods, not thousands.
    pub mod_ids: Vec<i64>,
}

fn row_to_preset(row: &Row) -> rusqlite::Result<Preset> {
    Ok(Preset {
        id: row.get("id")?,
        name: row.get("name")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        mod_count: 0,
        mod_ids: Vec::new(),
    })
}

impl Db {
    /// Every preset, most recently changed first — a list you reorder by using it, which keeps
    /// the one you are iterating on at the top where you keep reaching for it.
    ///
    /// The count comes from a join rather than from `preset_mods` alone, so a preset never
    /// claims mods that have since been deleted.
    pub fn list_presets(&self) -> rusqlite::Result<Vec<Preset>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, created_at, updated_at
               FROM presets
              ORDER BY updated_at DESC, id DESC",
        )?;
        let mut presets: Vec<Preset> = stmt.query_map([], row_to_preset)?.collect::<Result<_, _>>()?;

        // One query for every membership rather than one per preset. Joined to `mods` so a
        // preset never claims mods that have since been deleted, which is what makes the count
        // honest: a preset that named six and has had two deleted says four, because four is
        // what applying it would switch on.
        let mut members = self.conn.prepare(
            "SELECT pm.preset_id, pm.mod_id
               FROM preset_mods pm
               JOIN mods m ON m.id = pm.mod_id
              ORDER BY pm.preset_id, pm.mod_id",
        )?;
        let rows = members.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))?;
        for row in rows {
            let (preset_id, mod_id) = row?;
            if let Some(preset) = presets.iter_mut().find(|p| p.id == preset_id) {
                preset.mod_ids.push(mod_id);
            }
        }
        for preset in &mut presets {
            preset.mod_count = preset.mod_ids.len() as i64;
        }

        Ok(presets)
    }

    /// Creates a preset holding `mod_ids`.
    ///
    /// The name is taken as given, duplicates included: two presets called "swimsuits" is a
    /// mess the user made and can fix by renaming one, whereas refusing the second would be the
    /// app deciding it knows better about a label it never has to interpret.
    pub fn create_preset(&self, name: &str, mod_ids: &[i64], now: i64) -> rusqlite::Result<i64> {
        self.conn.execute(
            "INSERT INTO presets (name, created_at, updated_at) VALUES (?1, ?2, ?2)",
            params![name, now],
        )?;
        let id = self.conn.last_insert_rowid();
        self.write_preset_mods(id, mod_ids)?;
        Ok(id)
    }

    /// Replaces what a preset asks for, wholesale.
    ///
    /// Delete-then-insert rather than a diff: the set is small, the caller always knows the
    /// whole intended membership, and a diff would be three statements of arithmetic to save
    /// one statement of work.
    pub fn set_preset_mods(
        &self,
        preset_id: i64,
        mod_ids: &[i64],
        now: i64,
    ) -> rusqlite::Result<()> {
        self.write_preset_mods(preset_id, mod_ids)?;
        self.conn.execute(
            "UPDATE presets SET updated_at = ?2 WHERE id = ?1",
            params![preset_id, now],
        )?;
        Ok(())
    }

    fn write_preset_mods(&self, preset_id: i64, mod_ids: &[i64]) -> rusqlite::Result<()> {
        self.conn.execute(
            "DELETE FROM preset_mods WHERE preset_id = ?1",
            params![preset_id],
        )?;
        for mod_id in mod_ids {
            self.conn.execute(
                "INSERT OR IGNORE INTO preset_mods (preset_id, mod_id) VALUES (?1, ?2)",
                params![preset_id, mod_id],
            )?;
        }
        Ok(())
    }

    pub fn rename_preset(&self, preset_id: i64, name: &str, now: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE presets SET name = ?2, updated_at = ?3 WHERE id = ?1",
            params![preset_id, name, now],
        )?;
        Ok(())
    }

    pub fn delete_preset(&self, preset_id: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "DELETE FROM preset_mods WHERE preset_id = ?1",
            params![preset_id],
        )?;
        self.conn
            .execute("DELETE FROM presets WHERE id = ?1", params![preset_id])?;
        Ok(())
    }

    /// The mods a preset asks for that are still installed.
    ///
    /// Joined against `mods` so a deleted mod drops out silently. Applying is a reconciliation
    /// over the whole library, and a mod id that no longer exists has no folder to rename —
    /// carrying it into the planner would only produce a failure to report about something the
    /// user deleted on purpose.
    pub fn preset_mod_ids(&self, preset_id: i64) -> rusqlite::Result<Vec<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT pm.mod_id
               FROM preset_mods pm
               JOIN mods m ON m.id = pm.mod_id
              WHERE pm.preset_id = ?1
              ORDER BY pm.mod_id",
        )?;
        let rows = stmt.query_map(params![preset_id], |row| row.get(0))?;
        rows.collect()
    }

    /// Drops a mod from every preset that named it. Called when the mod is deleted.
    ///
    /// Reads already join `mods`, so this is not what keeps the counts honest — it is what
    /// stops the table growing a row per deleted mod forever, and what stops a new mod that
    /// happens to reuse a freed rowid from inheriting a dead membership.
    pub fn forget_mod_in_presets(&self, mod_id: i64) -> rusqlite::Result<()> {
        self.conn
            .execute("DELETE FROM preset_mods WHERE mod_id = ?1", params![mod_id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{NewMod, Slot};

    const NOW: i64 = 1_787_000_000;

    fn db() -> Db {
        Db::open_in_memory().expect("in-memory db")
    }

    fn add_mod(db: &Db, name: &str) -> i64 {
        db.insert_mod(NewMod {
            character_id: "lucia-elowen".to_string(),
            slot: Slot::CharacterSkin,
            display_name: name.to_string(),
            folder_path: format!("C:/mods/{name}"),
            thumbnail_url: None,
            gamebanana_mod_id: None,
            gamebanana_file_id: None,
            gamebanana_md5: None,
            variant_label: None,
            bundled_thumbnail: None,
        })
        .expect("add mod")
        .id
    }

    #[test]
    fn a_new_preset_holds_what_it_was_given() {
        let db = db();
        let one = add_mod(&db, "one");
        let two = add_mod(&db, "two");

        let id = db.create_preset("Swimsuits", &[one, two], NOW).unwrap();

        assert_eq!(db.preset_mod_ids(id).unwrap(), vec![one, two]);
        let listed = db.list_presets().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "Swimsuits");
        assert_eq!(listed[0].mod_count, 2);
    }

    #[test]
    fn a_deleted_mod_stops_being_counted() {
        let db = db();
        let one = add_mod(&db, "one");
        let two = add_mod(&db, "two");
        let id = db.create_preset("Swimsuits", &[one, two], NOW).unwrap();

        db.delete_mod(two).unwrap();

        // The join is what keeps this honest, whether or not anything cleaned up the row.
        assert_eq!(db.preset_mod_ids(id).unwrap(), vec![one]);
        assert_eq!(db.list_presets().unwrap()[0].mod_count, 1);
    }

    #[test]
    fn forgetting_a_mod_clears_its_rows() {
        let db = db();
        let one = add_mod(&db, "one");
        let id = db.create_preset("Swimsuits", &[one], NOW).unwrap();

        db.forget_mod_in_presets(one).unwrap();

        assert!(db.preset_mod_ids(id).unwrap().is_empty());
    }

    #[test]
    fn setting_the_mods_replaces_them_rather_than_adding() {
        let db = db();
        let one = add_mod(&db, "one");
        let two = add_mod(&db, "two");
        let id = db.create_preset("Swimsuits", &[one], NOW).unwrap();

        db.set_preset_mods(id, &[two], NOW + 60).unwrap();

        assert_eq!(db.preset_mod_ids(id).unwrap(), vec![two]);
        assert_eq!(db.list_presets().unwrap()[0].updated_at, NOW + 60);
    }

    #[test]
    fn the_most_recently_touched_preset_is_listed_first() {
        let db = db();
        let one = add_mod(&db, "one");
        let older = db.create_preset("Older", &[one], NOW).unwrap();
        let newer = db.create_preset("Newer", &[one], NOW + 10).unwrap();

        let order = |db: &Db| {
            db.list_presets()
                .unwrap()
                .iter()
                .map(|p| p.id)
                .collect::<Vec<_>>()
        };
        assert_eq!(order(&db), vec![newer, older]);

        db.rename_preset(older, "Older, touched", NOW + 20).unwrap();

        assert_eq!(order(&db), vec![older, newer]);
    }

    #[test]
    fn deleting_a_preset_takes_its_membership_with_it() {
        let db = db();
        let one = add_mod(&db, "one");
        let id = db.create_preset("Swimsuits", &[one], NOW).unwrap();

        db.delete_preset(id).unwrap();

        assert!(db.list_presets().unwrap().is_empty());
        assert!(db.preset_mod_ids(id).unwrap().is_empty());
    }
}
