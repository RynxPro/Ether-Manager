use serde::{Deserialize, Serialize};

use crate::gamebanana::GbSearchResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MatureVisibility {
    Show,
    Blur,
    Hide,
}

impl MatureVisibility {
    /// Safe default for a brand-new install — no existing precedent in this codebase to
    /// anchor to, so chosen on merits. `Hide` would silently show fewer mods than
    /// gamebanana.com with no explanation; `Show` puts explicit imagery on screen with no
    /// warning the first time Browse opens. `Blur` is self-teaching (a blurred card with a
    /// reveal button IS the discovery mechanism for this setting) and matches what a visitor
    /// coming from gamebanana.com already expects, since GameBanana's own `"warn"` value is
    /// exactly this blur/click-through behavior.
    pub const DEFAULT: MatureVisibility = MatureVisibility::Blur;

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            MatureVisibility::Show => "Show",
            MatureVisibility::Blur => "Blur",
            MatureVisibility::Hide => "Hide",
        }
    }

    pub(crate) fn from_str(value: &str) -> Option<Self> {
        match value {
            "Show" => Some(MatureVisibility::Show),
            "Blur" => Some(MatureVisibility::Blur),
            "Hide" => Some(MatureVisibility::Hide),
            _ => None,
        }
    }
}

/// Whether a mod should be treated as mature under the app's single Show/Blur/Hide
/// preference. Collapses GameBanana's own `"warn"`/`"hide"` classification into one flag
/// rather than mapping its three states onto the user's three states — a crossed matrix would
/// mean a user who explicitly chose "Show" still had some mods hidden, i.e. the setting
/// wouldn't do what its label says.
///
/// Deliberately keyed on `initial_visibility` alone, not OR'd with `has_content_ratings`: a
/// live survey (2026-08-08, ~175 real ZZZ mods across two sort orders — `Generic_MostLiked`
/// and the app's actual default `Generic_LatestModified`) found every `has_content_ratings:
/// true` record also had `initial_visibility != "show"`, so the two fields are effectively
/// perfectly correlated in practice and OR-ing them in would add no signal.
///
/// Unknown values fail closed — anything other than exactly `"show"` counts as mature,
/// including a value this app has never seen — because GameBanana is a third-party API and an
/// unrecognized signal must not silently expose content. A *missing* field is different: it
/// means the endpoint had no opinion at all (confirmed live on `Mod/:id?_csvProperties=
/// @gbprofile`, which never sends this field), and `gamebanana.rs` defaults a missing field to
/// `"show"` so an endpoint gap fails open instead of blanket-flagging every record mature.
pub fn is_mature(initial_visibility: &str) -> bool {
    initial_visibility != "show"
}

/// Applies the user's preference to an already-fetched page of search results.
///
/// `Show`/`Blur` return the records completely unchanged — blurring is a frontend rendering
/// concern applied per-card, not a filtering one, so nothing here needs to know about it.
/// `Hide` removes mature records entirely and reports how many via `hidden_count`. That count
/// exists because GameBanana computes `record_count`/pagination server-side *including*
/// mature mods, so filtering after the fact does not make a page's apparent size accurate —
/// the caller is expected to surface `hidden_count` to the user rather than let a short page
/// look like a bug.
pub fn apply_visibility(result: GbSearchResult, pref: MatureVisibility) -> GbSearchResult {
    match pref {
        MatureVisibility::Show | MatureVisibility::Blur => GbSearchResult {
            hidden_count: 0,
            ..result
        },
        MatureVisibility::Hide => {
            let before = result.records.len();
            let records: Vec<_> = result
                .records
                .into_iter()
                .filter(|m| !m.is_mature)
                .collect();
            let hidden_count = (before - records.len()) as i64;
            GbSearchResult {
                records,
                hidden_count,
                ..result
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gamebanana::{GbCategoryRef, GbGameRef, GbMod, GbPreviewMedia, GbSubmitter};

    #[test]
    fn is_mature_treats_show_as_not_mature() {
        assert!(!is_mature("show"));
    }

    #[test]
    fn is_mature_treats_warn_and_hide_as_mature() {
        assert!(is_mature("warn"));
        assert!(is_mature("hide"));
    }

    #[test]
    fn is_mature_fails_closed_on_an_empty_string() {
        // An empty string is not "show", so it counts as mature under the fail-closed rule —
        // it is NOT the same thing as a genuinely absent field. `gamebanana.rs`'s
        // `default_initial_visibility()` is what makes an absent field fail *open*, by
        // substituting "show" before this function ever sees it; this function itself never
        // treats "" as a safe value.
        assert!(is_mature(""));
    }

    #[test]
    fn is_mature_fails_closed_on_an_unrecognized_future_value() {
        assert!(is_mature("SomeFutureValueThisAppHasNeverSeen"));
    }

    #[test]
    fn mature_visibility_round_trips_every_variant() {
        for variant in [
            MatureVisibility::Show,
            MatureVisibility::Blur,
            MatureVisibility::Hide,
        ] {
            assert_eq!(MatureVisibility::from_str(variant.as_str()), Some(variant));
        }
    }

    #[test]
    fn mature_visibility_from_str_rejects_garbage() {
        assert_eq!(MatureVisibility::from_str("NotAVisibility"), None);
    }

    fn fixture_mod(id: i64, is_mature: bool) -> GbMod {
        GbMod {
            id,
            name: format!("Mod {id}"),
            profile_url: "https://gamebanana.com/mods/1".to_string(),
            date_modified: 0,
            has_files: true,
            tags: vec![],
            preview_media: GbPreviewMedia::default(),
            submitter: GbSubmitter {
                id: 1,
                name: "someone".to_string(),
                profile_url: "https://gamebanana.com/members/1".to_string(),
                avatar_url: None,
            },
            game: GbGameRef {
                id: crate::gamebanana::ZZZ_GAME_ID,
                name: "Zenless Zone Zero".to_string(),
            },
            root_category: GbCategoryRef {
                name: "Character Skins".to_string(),
                profile_url: "https://gamebanana.com/mods/cats/30305".to_string(),
            },
            sub_category: None,
            like_count: 0,
            view_count: 0,
            post_count: 0,
            has_content_ratings: is_mature,
            initial_visibility: if is_mature { "hide" } else { "show" }.to_string(),
            is_mature,
        }
    }

    fn fixture_result(records: Vec<GbMod>) -> GbSearchResult {
        GbSearchResult {
            record_count: records.len() as i64,
            is_complete: true,
            hidden_count: 0,
            records,
        }
    }

    #[test]
    fn apply_visibility_show_leaves_records_unchanged() {
        let result = fixture_result(vec![fixture_mod(1, false), fixture_mod(2, true)]);
        let applied = apply_visibility(result, MatureVisibility::Show);
        assert_eq!(applied.records.len(), 2);
        assert_eq!(applied.hidden_count, 0);
    }

    #[test]
    fn apply_visibility_blur_leaves_records_unchanged() {
        let result = fixture_result(vec![fixture_mod(1, false), fixture_mod(2, true)]);
        let applied = apply_visibility(result, MatureVisibility::Blur);
        assert_eq!(applied.records.len(), 2);
        assert_eq!(applied.hidden_count, 0);
    }

    #[test]
    fn apply_visibility_hide_removes_mature_records_and_reports_the_count() {
        let result = fixture_result(vec![
            fixture_mod(1, false),
            fixture_mod(2, true),
            fixture_mod(3, true),
        ]);
        let applied = apply_visibility(result, MatureVisibility::Hide);
        assert_eq!(applied.records.len(), 1);
        assert_eq!(applied.records[0].id, 1);
        assert!(applied.records.iter().all(|m| !m.is_mature));
        assert_eq!(applied.hidden_count, 2);
    }

    #[test]
    fn apply_visibility_hide_with_no_mature_records_hides_nothing() {
        let result = fixture_result(vec![fixture_mod(1, false), fixture_mod(2, false)]);
        let applied = apply_visibility(result, MatureVisibility::Hide);
        assert_eq!(applied.records.len(), 2);
        assert_eq!(applied.hidden_count, 0);
    }

    /// Closes the loop between the pure `apply_visibility` logic (tested above against
    /// synthetic fixtures) and real GameBanana data, consistent with this project's
    /// live-API-only testing philosophy for anything that touches the network.
    #[tokio::test]
    async fn apply_visibility_against_a_real_fetched_page() {
        let client = crate::gamebanana::GameBananaClient::new();
        let result = client.search_mods(None, None, 1).await.unwrap();
        assert!(!result.records.is_empty());
        let mature_count = result.records.iter().filter(|m| m.is_mature).count();

        let shown = apply_visibility(result.clone(), MatureVisibility::Show);
        assert_eq!(shown.records.len(), result.records.len());
        assert_eq!(shown.hidden_count, 0);

        let blurred = apply_visibility(result.clone(), MatureVisibility::Blur);
        assert_eq!(blurred.records.len(), result.records.len());
        assert_eq!(blurred.hidden_count, 0);

        let hidden = apply_visibility(result.clone(), MatureVisibility::Hide);
        assert!(hidden.records.iter().all(|m| !m.is_mature));
        assert_eq!(hidden.hidden_count, mature_count as i64);
        assert_eq!(hidden.records.len(), result.records.len() - mature_count);
    }

    #[test]
    fn apply_visibility_preserves_record_count_and_is_complete_untouched() {
        // record_count/is_complete reflect GameBanana's own server-side pagination and are
        // deliberately NOT recomputed after Hide filtering — see the module doc comment.
        let mut result = fixture_result(vec![fixture_mod(1, true)]);
        result.record_count = 500;
        result.is_complete = false;
        let applied = apply_visibility(result, MatureVisibility::Hide);
        assert_eq!(applied.record_count, 500);
        assert!(!applied.is_complete);
    }
}
