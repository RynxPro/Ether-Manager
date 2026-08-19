use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub name: String,
    pub portrait: Option<String>,
    /// A purpose-made 16:9 banner for the character page header, where one has been sourced.
    /// Distinct from `portrait`: these are wide, composed with the figure to one side and a
    /// transparent background, so they need no cropping. Defaulted rather than required —
    /// most of the roster has none, and those fall back to the portrait.
    #[serde(default)]
    pub banner: Option<String>,
    pub gamebanana_category_id: Option<i64>,
}

const CHARACTERS_JSON: &str = include_str!("../data/zzz_characters.json");

static CHARACTERS: OnceLock<Vec<Character>> = OnceLock::new();

/// The full static ZZZ character roster, bundled into the binary at compile time. This is
/// *only* real characters — the "UI"/"Misc" library categories are deliberately kept out of it
/// (see `pseudo_categories`) so this stays a pure 60-row roster with a stable, testable count.
pub fn all_characters() -> &'static [Character] {
    CHARACTERS.get_or_init(|| {
        serde_json::from_str(CHARACTERS_JSON).expect("data/zzz_characters.json must be valid JSON")
    })
}

/// `character_id` values for the two library categories that aren't tied to any real
/// character. Not present in `all_characters()` — `mods.character_id` accepts them anyway since
/// that column has never been constrained to the real roster (plain `TEXT`, checked only for
/// safe-path-segment shape by `fs_ops`), so no schema change was needed to introduce them.
pub const UI_PSEUDO_CHARACTER_ID: &str = "ui";
pub const MISC_PSEUDO_CHARACTER_ID: &str = "misc";

/// GameBanana's own ZZZ root category ids (confirmed live — see project memory
/// `gamebanana-api-v11`) for "UI" and "Other/Misc", reused here so these two pseudo-characters
/// slot directly into Browse's existing character-filter dropdown (`_aFilters[Generic_Category]`
/// accepts any category id, root or leaf) without a separate filter mechanism.
const UI_GAMEBANANA_CATEGORY_ID: i64 = 30395;
const MISC_GAMEBANANA_CATEGORY_ID: i64 = 29874;

/// Which shelf a GameBanana category belongs on.
///
/// GameBanana names a mod's most specific category exactly as the roster does — "Nicole Demara"
/// for a skin, and literally "UI" or "Other/Misc" for the two that are not characters — which is
/// what makes this a lookup rather than a guess. The install dialog has relied on that for its
/// target-guessing since it shipped; this is the same rule, in one place both it and bookmarks
/// can reach.
///
/// `None` for a category this app does not recognise, which is the honest answer for a mod filed
/// somewhere the roster has no row for. Callers decide what to do with an unplaceable mod rather
/// than having it quietly land in Misc.
pub fn character_id_for_category(category_name: &str) -> Option<String> {
    match category_name {
        "UI" => return Some(UI_PSEUDO_CHARACTER_ID.to_string()),
        "Other/Misc" => return Some(MISC_PSEUDO_CHARACTER_ID.to_string()),
        _ => {}
    }
    all_characters()
        .iter()
        .find(|character| character.name == category_name)
        .map(|character| character.id.clone())
}

/// The "UI" and "Misc" library categories, `Character`-shaped for wire/UI compatibility with the
/// real roster even though they aren't characters — appended to `list_characters`'s response.
pub fn pseudo_categories() -> Vec<Character> {
    vec![
        Character {
            id: UI_PSEUDO_CHARACTER_ID.to_string(),
            name: "UI".to_string(),
            portrait: None,
            banner: None,
            gamebanana_category_id: Some(UI_GAMEBANANA_CATEGORY_ID),
        },
        Character {
            id: MISC_PSEUDO_CHARACTER_ID.to_string(),
            name: "Misc".to_string(),
            portrait: None,
            banner: None,
            gamebanana_category_id: Some(MISC_GAMEBANANA_CATEGORY_ID),
        },
    ]
}

#[cfg(test)]
mod tests {
    #[test]
    fn a_category_named_after_a_character_resolves_to_that_character() {
        assert_eq!(
            super::character_id_for_category("Nicole Demara").as_deref(),
            Some("nicole-demara")
        );
    }

    #[test]
    fn the_two_non_character_categories_resolve_to_their_pseudo_characters() {
        assert_eq!(super::character_id_for_category("UI").as_deref(), Some("ui"));
        assert_eq!(
            super::character_id_for_category("Other/Misc").as_deref(),
            Some("misc")
        );
    }

    /// An unplaceable mod is left unplaced rather than swept into Misc, so the page can say so.
    #[test]
    fn an_unknown_category_resolves_to_nothing() {
        assert_eq!(super::character_id_for_category("Some Future Category"), None);
        assert_eq!(super::character_id_for_category(""), None);
    }

    use super::*;

    #[test]
    fn loads_all_sixty_characters() {
        let characters = all_characters();
        assert_eq!(characters.len(), 60);
        assert!(characters
            .iter()
            .any(|c| c.id == "belle" && c.portrait.is_some()));
    }

    /// Art coverage is deliberately not asserted as a count — it grows as files are sourced,
    /// and pinning the test to which characters currently lack a portrait or banner means it
    /// fails every time more art is added, which is the opposite of useful. What must hold is
    /// that any path present points where the app serves from, under the id it belongs to.
    #[test]
    fn art_paths_follow_the_public_layout_and_match_their_character_id() {
        for character in all_characters() {
            if let Some(portrait) = &character.portrait {
                assert_eq!(
                    portrait,
                    &format!("/characters/{}.webp", character.id),
                    "portrait path for {} does not match its id",
                    character.id
                );
            }
            if let Some(banner) = &character.banner {
                assert_eq!(
                    banner,
                    &format!("/banners/{}.webp", character.id),
                    "banner path for {} does not match its id",
                    character.id
                );
            }
        }
    }

    #[test]
    fn every_character_has_a_gamebanana_category_id() {
        let characters = all_characters();
        let missing: Vec<&str> = characters
            .iter()
            .filter(|c| c.gamebanana_category_id.is_none())
            .map(|c| c.name.as_str())
            .collect();
        assert!(
            missing.is_empty(),
            "characters missing a gamebanana_category_id: {missing:?}"
        );
    }

    #[test]
    fn pseudo_categories_are_distinct_from_the_real_roster() {
        let real_ids: Vec<&str> = all_characters().iter().map(|c| c.id.as_str()).collect();
        let pseudo = pseudo_categories();

        assert_eq!(pseudo.len(), 2);
        for category in &pseudo {
            assert!(
                !real_ids.contains(&category.id.as_str()),
                "pseudo category id {:?} collides with a real character id",
                category.id
            );
            assert!(category.gamebanana_category_id.is_some());
        }
    }
}
