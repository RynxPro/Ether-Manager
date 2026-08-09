use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Row};
use serde::Serialize;

use super::Db;
use crate::updates::{UpdateOutcome, UpdateReason, UpdateStatus};

/// A cached update-check result for one installed mod, joined with `character_id` so the
/// Library UI doesn't need a second lookup to know where to render the badge.
#[derive(Debug, Clone, Serialize)]
pub struct UpdateCheck {
    pub mod_id: i64,
    pub character_id: String,
    pub status: UpdateStatus,
    pub reason: Option<UpdateReason>,
    pub suggested_file_id: Option<i64>,
    pub suggested_file_name: Option<String>,
    pub is_ambiguous: bool,
    /// Set when the check itself failed (e.g. a network error for this one mod during a
    /// `check_all` sweep) rather than reflecting a real `UpdateOutcome`.
    pub error: Option<String>,
    pub checked_at: i64,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock is before unix epoch")
        .as_secs() as i64
}

fn row_to_update_check(row: &Row) -> rusqlite::Result<UpdateCheck> {
    let status_str: String = row.get("status")?;
    let status = UpdateStatus::from_str(&status_str).ok_or_else(|| {
        rusqlite::Error::InvalidColumnType(0, "status".to_string(), rusqlite::types::Type::Text)
    })?;
    let reason_str: Option<String> = row.get("reason")?;
    let reason = reason_str
        .map(|s| {
            UpdateReason::from_str(&s).ok_or_else(|| {
                rusqlite::Error::InvalidColumnType(
                    0,
                    "reason".to_string(),
                    rusqlite::types::Type::Text,
                )
            })
        })
        .transpose()?;
    Ok(UpdateCheck {
        mod_id: row.get("mod_id")?,
        character_id: row.get("character_id")?,
        status,
        reason,
        suggested_file_id: row.get("suggested_file_id")?,
        suggested_file_name: row.get("suggested_file_name")?,
        is_ambiguous: row.get::<_, i64>("is_ambiguous")? != 0,
        error: row.get("error")?,
        checked_at: row.get("checked_at")?,
    })
}

impl Db {
    /// Records or overwrites the cached check result for a mod — `mod_id` is the primary key,
    /// so re-checking a mod updates its row in place rather than accumulating history.
    pub fn upsert_update_check(
        &self,
        mod_id: i64,
        outcome: &UpdateOutcome,
        error: Option<&str>,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO mod_update_checks
                (mod_id, status, reason, suggested_file_id, suggested_file_name, is_ambiguous, error, checked_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(mod_id) DO UPDATE SET
                status = excluded.status,
                reason = excluded.reason,
                suggested_file_id = excluded.suggested_file_id,
                suggested_file_name = excluded.suggested_file_name,
                is_ambiguous = excluded.is_ambiguous,
                error = excluded.error,
                checked_at = excluded.checked_at",
            params![
                mod_id,
                outcome.status.as_str(),
                outcome.reason.map(UpdateReason::as_str),
                outcome.suggested_file_id,
                outcome.suggested_file_name,
                outcome.is_ambiguous as i64,
                error,
                now(),
            ],
        )?;
        Ok(())
    }

    /// Cache reads only — never touches the network. Joined against `mods` so a check row
    /// whose mod was deleted can never surface (belt-and-suspenders alongside `delete_mod`
    /// deleting the check row directly).
    pub fn list_update_checks(&self) -> rusqlite::Result<Vec<UpdateCheck>> {
        let mut stmt = self.conn.prepare(
            "SELECT c.mod_id, c.status, c.reason, c.suggested_file_id, c.suggested_file_name,
                    c.is_ambiguous, c.error, c.checked_at, m.character_id
             FROM mod_update_checks c
             INNER JOIN mods m ON m.id = c.mod_id
             ORDER BY c.checked_at DESC",
        )?;
        let rows = stmt.query_map([], row_to_update_check)?;
        rows.collect()
    }

    pub fn delete_update_check(&self, mod_id: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "DELETE FROM mod_update_checks WHERE mod_id = ?1",
            params![mod_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{NewMod, Slot};

    fn insert_test_mod(db: &Db, character_id: &str) -> i64 {
        db.insert_mod(NewMod {
            character_id: character_id.to_string(),
            slot: Slot::CharacterSkin,
            display_name: "Test Outfit".to_string(),
            folder_path: "Mods/Characters/Belle/Character Skin/TestOutfit".to_string(),
            thumbnail_path: None,
            gamebanana_mod_id: Some(608561),
            gamebanana_file_id: Some(1481954),
            gamebanana_md5: Some("old-md5".to_string()),
        })
        .unwrap()
        .id
    }

    fn file_changed_outcome() -> UpdateOutcome {
        UpdateOutcome {
            status: UpdateStatus::UpdateAvailable,
            reason: Some(UpdateReason::FileChanged),
            suggested_file_id: Some(1481954),
            suggested_file_name: Some("mod.zip".to_string()),
            is_ambiguous: false,
        }
    }

    #[test]
    fn upsert_then_list_round_trip_includes_joined_character_id() {
        let db = Db::open_in_memory().unwrap();
        let mod_id = insert_test_mod(&db, "belle");

        db.upsert_update_check(mod_id, &file_changed_outcome(), None)
            .unwrap();

        let checks = db.list_update_checks().unwrap();
        assert_eq!(checks.len(), 1);
        assert_eq!(checks[0].mod_id, mod_id);
        assert_eq!(checks[0].character_id, "belle");
        assert_eq!(checks[0].status, UpdateStatus::UpdateAvailable);
        assert_eq!(checks[0].reason, Some(UpdateReason::FileChanged));
        assert!(!checks[0].is_ambiguous);
        assert!(checks[0].error.is_none());
    }

    #[test]
    fn re_checking_overwrites_rather_than_duplicating() {
        let db = Db::open_in_memory().unwrap();
        let mod_id = insert_test_mod(&db, "belle");

        db.upsert_update_check(mod_id, &file_changed_outcome(), None)
            .unwrap();
        db.upsert_update_check(
            mod_id,
            &UpdateOutcome {
                status: UpdateStatus::UpToDate,
                reason: None,
                suggested_file_id: None,
                suggested_file_name: None,
                is_ambiguous: false,
            },
            None,
        )
        .unwrap();

        let checks = db.list_update_checks().unwrap();
        assert_eq!(
            checks.len(),
            1,
            "re-checking must not create a duplicate row"
        );
        assert_eq!(checks[0].status, UpdateStatus::UpToDate);
        assert!(checks[0].reason.is_none());
    }

    #[test]
    fn records_a_per_mod_check_failure_as_an_error_string() {
        let db = Db::open_in_memory().unwrap();
        let mod_id = insert_test_mod(&db, "belle");

        let unavailable = UpdateOutcome {
            status: UpdateStatus::Unavailable,
            reason: None,
            suggested_file_id: None,
            suggested_file_name: None,
            is_ambiguous: false,
        };
        db.upsert_update_check(
            mod_id,
            &unavailable,
            Some("GameBanana request failed: timeout"),
        )
        .unwrap();

        let checks = db.list_update_checks().unwrap();
        assert_eq!(checks[0].status, UpdateStatus::Unavailable);
        assert_eq!(
            checks[0].error.as_deref(),
            Some("GameBanana request failed: timeout")
        );
    }

    #[test]
    fn list_update_checks_omits_rows_whose_mod_no_longer_exists() {
        let db = Db::open_in_memory().unwrap();
        let mod_id = insert_test_mod(&db, "belle");
        db.upsert_update_check(mod_id, &file_changed_outcome(), None)
            .unwrap();

        // Simulate an orphaned check row (mod deleted without going through `delete_mod`,
        // e.g. schema drift or manual DB edit) — the INNER JOIN must still filter it out.
        db.conn
            .execute("DELETE FROM mods WHERE id = ?1", params![mod_id])
            .unwrap();

        assert!(db.list_update_checks().unwrap().is_empty());
    }

    #[test]
    fn deleting_a_mod_cascades_to_its_update_check() {
        let db = Db::open_in_memory().unwrap();
        let mod_id = insert_test_mod(&db, "belle");
        db.upsert_update_check(mod_id, &file_changed_outcome(), None)
            .unwrap();

        db.delete_mod(mod_id).unwrap();

        assert!(db.list_update_checks().unwrap().is_empty());
    }

    #[test]
    fn unparseable_status_errors_instead_of_silently_defaulting() {
        let db = Db::open_in_memory().unwrap();
        let mod_id = insert_test_mod(&db, "belle");
        db.upsert_update_check(mod_id, &file_changed_outcome(), None)
            .unwrap();

        db.conn
            .execute(
                "UPDATE mod_update_checks SET status = 'NotARealStatus' WHERE mod_id = ?1",
                params![mod_id],
            )
            .unwrap();

        assert!(
            db.list_update_checks().is_err(),
            "unparseable status must error, not silently default"
        );
    }
}
