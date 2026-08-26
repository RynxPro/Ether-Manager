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
    /// The author has retired this mod on GameBanana.
    ///
    /// Independent of `status`, not a variant of it: a retired mod can still have a newer file
    /// waiting, and folding the two into one field would report whichever was decided last.
    /// Retired is also not broken — what is installed goes on working exactly as before — so
    /// this is something to know, never something the app acts on.
    pub is_obsolete: bool,
    /// GameBanana has taken it down — binned or hidden pending review, which are the same thing
    /// to someone who has it installed. Worth saying plainly, not least because it explains
    /// update checks that quietly started failing.
    pub is_withdrawn: bool,
    /// The author's own note about the retirement, verbatim. Usually names whatever replaced the
    /// mod, which is the one thing the app could never work out for itself.
    pub withdrawal_notice: Option<String>,
}

/// What a check learned about a mod's standing on GameBanana, as opposed to about its files.
///
/// Passed separately from `UpdateOutcome` because the two answer different questions and can
/// fail independently: a check whose file comparison errored may still have learned the mod was
/// retired, and vice versa. `UNKNOWN` is what a caller passes when the fetch told it nothing —
/// deliberately identical to "in good standing", so an unreachable mod is never reported as dead.
#[derive(Debug, Clone, Default)]
pub struct ModStanding {
    pub is_obsolete: bool,
    pub is_withdrawn: bool,
    pub withdrawal_notice: Option<String>,
}

impl ModStanding {
    pub const UNKNOWN: Self = Self {
        is_obsolete: false,
        is_withdrawn: false,
        withdrawal_notice: None,
    };
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
        is_obsolete: row.get::<_, i64>("is_obsolete")? != 0,
        is_withdrawn: row.get::<_, i64>("is_withdrawn")? != 0,
        withdrawal_notice: row.get("withdrawal_notice")?,
    })
}

impl Db {
    /// Records or overwrites the cached check result for a mod — `mod_id` is the primary key,
    /// so re-checking a mod updates its row in place rather than accumulating history.
    pub fn upsert_update_check(
        &self,
        mod_id: i64,
        outcome: &UpdateOutcome,
        standing: ModStanding,
        error: Option<&str>,
    ) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO mod_update_checks
                (mod_id, status, reason, suggested_file_id, suggested_file_name, is_ambiguous,
                 error, checked_at, is_obsolete, is_withdrawn, withdrawal_notice)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(mod_id) DO UPDATE SET
                status = excluded.status,
                reason = excluded.reason,
                suggested_file_id = excluded.suggested_file_id,
                suggested_file_name = excluded.suggested_file_name,
                is_ambiguous = excluded.is_ambiguous,
                error = excluded.error,
                checked_at = excluded.checked_at,
                is_obsolete = excluded.is_obsolete,
                is_withdrawn = excluded.is_withdrawn,
                withdrawal_notice = excluded.withdrawal_notice",
            params![
                mod_id,
                outcome.status.as_str(),
                outcome.reason.map(UpdateReason::as_str),
                outcome.suggested_file_id,
                outcome.suggested_file_name,
                outcome.is_ambiguous as i64,
                error,
                now(),
                standing.is_obsolete as i64,
                standing.is_withdrawn as i64,
                standing.withdrawal_notice,
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
                    c.is_ambiguous, c.error, c.checked_at, c.is_obsolete, c.is_withdrawn,
                    c.withdrawal_notice, m.character_id
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
            thumbnail_url: None,
            gamebanana_mod_id: Some(608561),
            gamebanana_file_id: Some(1481954),
            gamebanana_md5: Some("old-md5".to_string()),
            variant_label: None,
            bundled_thumbnail: None,
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

        db.upsert_update_check(mod_id, &file_changed_outcome(), ModStanding::UNKNOWN, None)
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

    /// The default that matters most: every row written before these columns existed, and every
    /// check that could not reach GameBanana, must read as a mod in good standing. Reporting a
    /// healthy mod as retired would be far worse than reporting a retired one late.
    #[test]
    fn a_check_with_unknown_standing_reads_as_in_good_standing() {
        let db = Db::open_in_memory().unwrap();
        let mod_id = insert_test_mod(&db, "belle");

        db.upsert_update_check(mod_id, &file_changed_outcome(), ModStanding::UNKNOWN, None)
            .unwrap();

        let check = &db.list_update_checks().unwrap()[0];
        assert!(!check.is_obsolete);
        assert!(!check.is_withdrawn);
        assert_eq!(check.withdrawal_notice, None);
    }

    #[test]
    fn standing_round_trips_with_the_author_s_notice() {
        let db = Db::open_in_memory().unwrap();
        let mod_id = insert_test_mod(&db, "belle");

        db.upsert_update_check(
            mod_id,
            &file_changed_outcome(),
            ModStanding {
                is_obsolete: true,
                is_withdrawn: false,
                withdrawal_notice: Some("Superseded by the v2 release".to_string()),
            },
            None,
        )
        .unwrap();

        let check = &db.list_update_checks().unwrap()[0];
        assert!(check.is_obsolete);
        assert!(!check.is_withdrawn);
        assert_eq!(
            check.withdrawal_notice.as_deref(),
            Some("Superseded by the v2 release")
        );
    }

    /// The two are independent facts, and this is the pairing that would be lost if retirement
    /// had been folded into `UpdateStatus` as a variant: a retired mod can still have a newer
    /// file, and the user is entitled to both answers at once.
    #[test]
    fn a_retired_mod_can_still_report_an_update() {
        let db = Db::open_in_memory().unwrap();
        let mod_id = insert_test_mod(&db, "belle");

        db.upsert_update_check(
            mod_id,
            &file_changed_outcome(),
            ModStanding {
                is_obsolete: true,
                is_withdrawn: false,
                withdrawal_notice: None,
            },
            None,
        )
        .unwrap();

        let check = &db.list_update_checks().unwrap()[0];
        assert_eq!(check.status, UpdateStatus::UpdateAvailable);
        assert!(check.is_obsolete);
    }

    /// Trashed and withheld are one fact to anyone who has the mod installed, so the listing
    /// folds them together before they ever reach the database.
    #[test]
    fn trashed_and_withheld_both_read_as_withdrawn() {
        use crate::gamebanana::GbModListing;

        let trashed = GbModListing {
            is_trashed: true,
            ..GbModListing::default()
        };
        let withheld = GbModListing {
            is_withheld: true,
            ..GbModListing::default()
        };

        assert!(trashed.is_withdrawn());
        assert!(withheld.is_withdrawn());
        assert!(!GbModListing::default().is_withdrawn());
    }

    /// A later check must be able to clear a flag as well as set one — a mod can be un-retired,
    /// and a stale warning would be as wrong as a missing one.
    #[test]
    fn a_later_check_can_clear_a_retirement() {
        let db = Db::open_in_memory().unwrap();
        let mod_id = insert_test_mod(&db, "belle");

        db.upsert_update_check(
            mod_id,
            &file_changed_outcome(),
            ModStanding {
                is_obsolete: true,
                is_withdrawn: true,
                withdrawal_notice: Some("gone".to_string()),
            },
            None,
        )
        .unwrap();
        db.upsert_update_check(mod_id, &file_changed_outcome(), ModStanding::UNKNOWN, None)
            .unwrap();

        let check = &db.list_update_checks().unwrap()[0];
        assert!(!check.is_obsolete);
        assert!(!check.is_withdrawn);
        assert_eq!(check.withdrawal_notice, None);
    }

    #[test]
    fn re_checking_overwrites_rather_than_duplicating() {
        let db = Db::open_in_memory().unwrap();
        let mod_id = insert_test_mod(&db, "belle");

        db.upsert_update_check(mod_id, &file_changed_outcome(), ModStanding::UNKNOWN, None)
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
            ModStanding::UNKNOWN,
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
        db.upsert_update_check(mod_id, &unavailable, ModStanding::UNKNOWN, Some("GameBanana request failed: timeout"),
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
        db.upsert_update_check(mod_id, &file_changed_outcome(), ModStanding::UNKNOWN, None)
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
        db.upsert_update_check(mod_id, &file_changed_outcome(), ModStanding::UNKNOWN, None)
            .unwrap();

        db.delete_mod(mod_id).unwrap();

        assert!(db.list_update_checks().unwrap().is_empty());
    }

    #[test]
    fn unparseable_status_errors_instead_of_silently_defaulting() {
        let db = Db::open_in_memory().unwrap();
        let mod_id = insert_test_mod(&db, "belle");
        db.upsert_update_check(mod_id, &file_changed_outcome(), ModStanding::UNKNOWN, None)
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
