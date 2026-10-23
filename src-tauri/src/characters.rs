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

/// Turns a character's name into the id its art is filed under.
///
/// This has to reproduce the ids already in `zzz_characters.json` exactly, because those are
/// what `public/characters/<id>.webp` and `public/banners/<id>.webp` are named. Get it wrong
/// and the art stops resolving with no error at all — the card falls back to the initial, which
/// is a real designed state, so it looks like a deliberate choice rather than a bug.
///
/// Apostrophes are dropped rather than treated as a separator, which is the one rule the
/// obvious implementation gets wrong: `Sigrid de L'Azur` is filed as `sigrid-de-lazur`, not
/// `sigrid-de-l-azur`. Hers is the only name in sixty that distinguishes the two, and the only
/// one anybody would think to check afterwards.
pub fn slugify_character_name(name: &str) -> String {
    // Straight and curly, by code point rather than by escape, so the two are visibly the same
    // decision rather than two lookalike literals.
    fn is_apostrophe(c: char) -> bool {
        matches!(c as u32, 0x27 | 0x2019)
    }

    let mut slug = String::with_capacity(name.len());
    let mut pending_separator = false;
    for ch in name.chars().filter(|c| !is_apostrophe(*c)) {
        if ch.is_ascii_alphanumeric() {
            if pending_separator && !slug.is_empty() {
                slug.push('-');
            }
            pending_separator = false;
            slug.push(ch.to_ascii_lowercase());
        } else {
            pending_separator = true;
        }
    }
    slug
}

/// The bundled roster, plus anyone GameBanana lists that it has never heard of.
///
/// Matched on `gamebanana_category_id` rather than on the name, because that id is what every
/// bundled entry already carries and what the rest of the app joins on — all sixty were
/// confirmed present in GameBanana's live list, so the join has no orphans. Matching on the
/// name would break the first time somebody is renamed.
///
/// A discovered character arrives with no portrait and no banner, which is not a problem that
/// needs solving: seven of the bundled sixty have no portrait either, and the card has drawn
/// their initial since long before this existed. Appearing without art beats not appearing.
pub fn merge_discovered(bundled: &[Character], listed: &[(i64, String)]) -> Vec<Character> {
    let known: std::collections::HashSet<i64> = bundled
        .iter()
        .filter_map(|c| c.gamebanana_category_id)
        .collect();

    let mut merged = bundled.to_vec();
    for (category_id, name) in listed {
        if known.contains(category_id) {
            continue;
        }
        merged.push(Character {
            id: slugify_character_name(name),
            name: name.clone(),
            portrait: None,
            banner: None,
            gamebanana_category_id: Some(*category_id),
        });
    }
    merged
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
        assert_eq!(
            super::character_id_for_category("UI").as_deref(),
            Some("ui")
        );
        assert_eq!(
            super::character_id_for_category("Other/Misc").as_deref(),
            Some("misc")
        );
    }

    /// An unplaceable mod is left unplaced rather than swept into Misc, so the page can say so.
    #[test]
    fn an_unknown_category_resolves_to_nothing() {
        assert_eq!(
            super::character_id_for_category("Some Future Category"),
            None
        );
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
    fn every_bundled_id_is_what_its_name_slugifies_to() {
        // The art is filed under the id, so this is the rule that has to keep producing the
        // filenames already on disk. The whole roster rather than a sample: one name that slugs
        // differently is one character whose portrait silently stops loading.
        for character in all_characters() {
            assert_eq!(
                slugify_character_name(&character.name),
                character.id,
                "{} does not slug to its own id",
                character.name
            );
        }
    }

    #[test]
    fn an_apostrophe_is_dropped_rather_than_separated() {
        // The one name in the roster that tells a correct rule from a plausible one.
        assert_eq!(slugify_character_name("Sigrid de L'Azur"), "sigrid-de-lazur");
        assert_eq!(slugify_character_name("Sigrid de L’Azur"), "sigrid-de-lazur");
    }

    #[test]
    fn a_character_gamebanana_lists_and_we_do_not_is_added_without_art() {
        let bundled = all_characters();
        let before = bundled.len();
        let listed = vec![
            (49001_i64, "Claret Flint".to_string()),
            // Already in the roster under this id, so it must not arrive a second time.
            (
                bundled[0].gamebanana_category_id.unwrap(),
                bundled[0].name.clone(),
            ),
        ];

        let merged = merge_discovered(bundled, &listed);
        assert_eq!(merged.len(), before + 1, "exactly one of them was new");

        let added = merged.last().unwrap();
        assert_eq!(added.id, "claret-flint");
        assert_eq!(added.gamebanana_category_id, Some(49001));
        assert!(
            added.portrait.is_none() && added.banner.is_none(),
            "nobody has art for a character the app has never seen"
        );
    }

    #[test]
    fn nothing_is_added_when_gamebanana_lists_only_who_we_have() {
        let bundled = all_characters();
        let listed: Vec<(i64, String)> = bundled
            .iter()
            .map(|c| (c.gamebanana_category_id.unwrap(), c.name.clone()))
            .collect();
        assert_eq!(merge_discovered(bundled, &listed).len(), bundled.len());
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
