use serde::{Deserialize, Serialize};

use crate::gamebanana::GbFile;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UpdateStatus {
    UpToDate,
    UpdateAvailable,
    Unavailable,
}

impl UpdateStatus {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            UpdateStatus::UpToDate => "UpToDate",
            UpdateStatus::UpdateAvailable => "UpdateAvailable",
            UpdateStatus::Unavailable => "Unavailable",
        }
    }

    pub(crate) fn from_str(value: &str) -> Option<Self> {
        match value {
            "UpToDate" => Some(UpdateStatus::UpToDate),
            "UpdateAvailable" => Some(UpdateStatus::UpdateAvailable),
            "Unavailable" => Some(UpdateStatus::Unavailable),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UpdateReason {
    /// The installed file's id is no longer present in the mod's current file list.
    FileReplaced,
    /// The installed file's id is still present, but GameBanana's own MD5 for it changed
    /// (uploaders can replace a file's contents in place without changing its id).
    FileChanged,
}

impl UpdateReason {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            UpdateReason::FileReplaced => "FileReplaced",
            UpdateReason::FileChanged => "FileChanged",
        }
    }

    pub(crate) fn from_str(value: &str) -> Option<Self> {
        match value {
            "FileReplaced" => Some(UpdateReason::FileReplaced),
            "FileChanged" => Some(UpdateReason::FileChanged),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UpdateOutcome {
    pub status: UpdateStatus,
    pub reason: Option<UpdateReason>,
    pub suggested_file_id: Option<i64>,
    pub suggested_file_name: Option<String>,
    /// `true` when more than one remaining file could be the successor (a `FileReplaced` mod
    /// with several files left) — the UI must ask the user rather than auto-picking.
    pub is_ambiguous: bool,
}

fn up_to_date() -> UpdateOutcome {
    UpdateOutcome {
        status: UpdateStatus::UpToDate,
        reason: None,
        suggested_file_id: None,
        suggested_file_name: None,
        is_ambiguous: false,
    }
}

fn unavailable() -> UpdateOutcome {
    UpdateOutcome {
        status: UpdateStatus::Unavailable,
        reason: None,
        suggested_file_id: None,
        suggested_file_name: None,
        is_ambiguous: false,
    }
}

/// Compares an installed GameBanana file against the mod's current file list to decide
/// whether an update is available. Deliberately never reads `_sVersion` — GameBanana's own
/// version field is too often blank in live data (see project memory `gamebanana-api-v11`).
///
/// A live survey of 25 real ZZZ mods (2026-08-08) found 20/25 carry multiple files, and the
/// overwhelming majority of those are parallel variants — NSFW/SFW toggles, outfit options,
/// weapon-only bundles, version-history archives kept side by side — not a version sequence.
/// So "some other file in the list is newer than the installed one" is deliberately NOT
/// treated as an update signal here: on this kind of mod it would false-flag permanently.
/// Only two signals are used, both keyed to the *specific installed file*:
/// - its id no longer exists in the current list at all (`FileReplaced`)
/// - its id still exists, but its MD5 changed (`FileChanged`)
pub fn compare_installed_file(
    installed_file_id: i64,
    installed_md5: Option<&str>,
    files: &[GbFile],
) -> UpdateOutcome {
    if files.is_empty() {
        return unavailable();
    }

    if let Some(current) = files.iter().find(|f| f.id == installed_file_id) {
        let changed = installed_md5.is_some_and(|md5| md5 != current.md5_checksum);
        return if changed {
            UpdateOutcome {
                status: UpdateStatus::UpdateAvailable,
                reason: Some(UpdateReason::FileChanged),
                suggested_file_id: Some(current.id),
                suggested_file_name: Some(current.file_name.clone()),
                is_ambiguous: false,
            }
        } else {
            up_to_date()
        };
    }

    // Installed file id is gone. Suggest the newest remaining file, but flag ambiguity
    // whenever more than one candidate remains — nothing here says which is the real
    // successor on a mod that hosts parallel variants rather than a version sequence.
    let newest = files
        .iter()
        .max_by_key(|f| f.date_added)
        .expect("files is non-empty, checked above");
    UpdateOutcome {
        status: UpdateStatus::UpdateAvailable,
        reason: Some(UpdateReason::FileReplaced),
        suggested_file_id: Some(newest.id),
        suggested_file_name: Some(newest.file_name.clone()),
        is_ambiguous: files.len() > 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(id: i64, name: &str, md5: &str, date_added: i64) -> GbFile {
        GbFile {
            id,
            file_name: name.to_string(),
            file_size: 1024,
            date_added,
            download_count: 0,
            download_url: format!("https://gamebanana.com/dl/{id}"),
            md5_checksum: md5.to_string(),
            analysis_result: None,
            av_result: None,
            description: None,
        }
    }

    #[test]
    fn up_to_date_when_installed_file_still_present_with_matching_md5() {
        let files = vec![file(1, "mod.zip", "abc123", 100)];
        let outcome = compare_installed_file(1, Some("abc123"), &files);
        assert_eq!(outcome, up_to_date());
    }

    #[test]
    fn update_available_file_changed_when_md5_differs_for_same_id() {
        let files = vec![file(1, "mod.zip", "new-md5", 100)];
        let outcome = compare_installed_file(1, Some("old-md5"), &files);
        assert_eq!(outcome.status, UpdateStatus::UpdateAvailable);
        assert_eq!(outcome.reason, Some(UpdateReason::FileChanged));
        assert_eq!(outcome.suggested_file_id, Some(1));
        assert!(!outcome.is_ambiguous);
    }

    #[test]
    fn update_available_file_replaced_single_remaining_file_is_not_ambiguous() {
        // Installed file (id 1) no longer exists; exactly one file remains.
        let files = vec![file(2, "mod-v2.zip", "md5-2", 200)];
        let outcome = compare_installed_file(1, Some("old-md5"), &files);
        assert_eq!(outcome.status, UpdateStatus::UpdateAvailable);
        assert_eq!(outcome.reason, Some(UpdateReason::FileReplaced));
        assert_eq!(outcome.suggested_file_id, Some(2));
        assert!(!outcome.is_ambiguous);
    }

    #[test]
    fn update_available_file_replaced_multiple_remaining_files_is_ambiguous_and_suggests_newest() {
        // Installed file (id 1) is gone; several parallel-variant files remain.
        let files = vec![
            file(2, "sfw.zip", "md5-2", 200),
            file(3, "nsfw.zip", "md5-3", 500),
            file(4, "weapon-only.zip", "md5-4", 300),
        ];
        let outcome = compare_installed_file(1, Some("old-md5"), &files);
        assert_eq!(outcome.status, UpdateStatus::UpdateAvailable);
        assert_eq!(outcome.reason, Some(UpdateReason::FileReplaced));
        assert_eq!(outcome.suggested_file_id, Some(3));
        assert!(outcome.is_ambiguous);
    }

    #[test]
    fn unavailable_when_mod_has_zero_files() {
        let outcome = compare_installed_file(1, Some("abc123"), &[]);
        assert_eq!(outcome, unavailable());
    }

    #[test]
    fn compares_by_id_only_when_installed_md5_is_none() {
        // Defensive path: shouldn't occur post-Milestone-2 (md5 is always stored on install),
        // but must not false-flag as changed just because there's nothing to compare against.
        let files = vec![file(1, "mod.zip", "abc123", 100)];
        let outcome = compare_installed_file(1, None, &files);
        assert_eq!(outcome, up_to_date());
    }

    #[test]
    fn a_second_file_being_newer_than_the_installed_one_does_not_trigger_an_update() {
        // The installed file (id 1) is still present and unchanged; file 2 merely has a later
        // date_added. Per the module doc comment, this must NOT be flagged as an update — the
        // live survey found this is overwhelmingly a parallel-variant pattern, not staleness.
        let files = vec![
            file(1, "sfw.zip", "md5-1", 100),
            file(2, "nsfw.zip", "md5-2", 999),
        ];
        let outcome = compare_installed_file(1, Some("md5-1"), &files);
        assert_eq!(outcome, up_to_date());
    }
}
