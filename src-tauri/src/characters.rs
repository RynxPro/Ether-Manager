use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

/// A character, or one of the two library pseudo-categories.
///
/// Carries no art paths. A portrait lives at `/characters/<id>.webp` and a banner at
/// `/banners/<id>.webp`, which the frontend derives from the id rather than either side storing
/// a string it could compute — the roster used to hold all hundred and twenty of them, and a
/// test here asserted they were exactly what the id produced, which is the definition of a
/// field that should not exist.
///
/// Nothing here records *whether* such a file exists either. The one authority on that is the
/// file, and the frontend falls back to the character's initial when a request for it fails.
/// Rust cannot answer the question anyway: `public/` is bundled into the frontend, not readable
/// from this side at runtime.
///
/// Unknown fields are ignored on the way in, which matters because discovered characters are
/// persisted as this shape: rows written by an earlier build still carry `portrait` and
/// `banner`, and keep deserializing without a migration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub name: String,
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
            gamebanana_category_id: Some(UI_GAMEBANANA_CATEGORY_ID),
        },
        Character {
            id: MISC_PSEUDO_CHARACTER_ID.to_string(),
            name: "Misc".to_string(),
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
/// Since the paths are derived from the id rather than stored, this function is the only link
/// between a character and their art. `every_art_file_belongs_to_a_character` is what keeps a
/// misnamed file from becoming that silent fallback.
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
/// Art needs no handling here, and that is the point of deriving it. A discovered character's
/// portrait is looked for at `/characters/<id>.webp` exactly like everyone else's, so dropping
/// a file in is the whole of adding it — where this used to hand out a permanent `portrait:
/// None` that nothing could ever fill in, and shipping a release was the only cure.
///
/// A name that slugs to an id already taken is skipped. Its category id is new by definition —
/// that is how it reached here — but the id is what art is filed under, so admitting it would
/// draw the established character's portrait under someone else's name. Dropping it costs a
/// shelf that could not be filed to anyway; keeping it would state something untrue about who
/// it is. The taken set includes the two pseudo-categories, so a literal "UI" category cannot
/// arrive as a second UI shelf either.
pub fn merge_discovered(bundled: &[Character], listed: &[(i64, String)]) -> Vec<Character> {
    let known: std::collections::HashSet<i64> = bundled
        .iter()
        .filter_map(|c| c.gamebanana_category_id)
        .collect();
    // Grown as we go, so two discovered names that slug alike cannot both land either.
    let mut taken_ids: std::collections::HashSet<String> = bundled
        .iter()
        .map(|c| c.id.clone())
        .chain(pseudo_categories().into_iter().map(|c| c.id))
        .collect();

    let mut merged = bundled.to_vec();
    for (category_id, name) in listed {
        if known.contains(category_id) {
            continue;
        }
        let id = slugify_character_name(name);
        if !taken_ids.insert(id.clone()) {
            continue;
        }
        merged.push(Character {
            id,
            name: name.clone(),
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
    fn loads_the_whole_bundled_roster() {
        let characters = all_characters();
        assert_eq!(characters.len(), 64);
        assert!(characters.iter().any(|c| c.id == "belle"));
    }

    /// Coverage is deliberately not asserted — it grows as art is sourced, and a test pinned to
    /// who currently lacks a portrait fails every time more is added, which is the opposite of
    /// useful. This asserts the other direction: every file that *is* there is named after
    /// somebody.
    ///
    /// That is the failure this project can actually have. Paths are derived from the id now, so
    /// a path cannot be wrong — but a *filename* can, and when it is the art simply never
    /// resolves and the card draws the initial, which is a designed state and therefore looks
    /// deliberate. `sigrid-de-lazur.webp` versus `sigrid-de-l-azur.webp` is the whole distance
    /// between working and silently blank, and this is what notices.
    ///
    /// It judges against the bundled roster, so art bundled for a character only GameBanana
    /// knows about fails here even though it would be served correctly. That is the useful
    /// reading rather than a false alarm: if somebody has had art drawn for them they are known,
    /// and a roster row — carrying their category id, the one thing about them that cannot be
    /// derived — is what makes them appear offline and on first paint instead of waiting for a
    /// refresh to find them.
    #[test]
    fn every_art_file_belongs_to_a_character() {
        let known: std::collections::HashSet<String> = all_characters()
            .iter()
            .map(|c| c.id.clone())
            .chain(pseudo_categories().into_iter().map(|c| c.id))
            .collect();

        for folder in ["characters", "banners"] {
            let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("public")
                .join(folder);
            let entries = std::fs::read_dir(&dir)
                .unwrap_or_else(|e| panic!("cannot read {}: {e}", dir.display()));

            let mut seen = 0usize;
            for entry in entries {
                let path = entry.expect("a readable directory entry").path();
                if path.extension().and_then(|e| e.to_str()) != Some("webp") {
                    continue;
                }
                seen += 1;
                let stem = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .expect("a utf-8 filename")
                    .to_string();
                assert!(
                    known.contains(&stem),
                    "public/{folder}/{stem}.webp is named after nobody in the roster, so it will never be served — art is filed under a character id"
                );
            }
            assert!(seen > 0, "public/{folder} has no .webp files at all");
        }
    }

    /// Ids have to be unique now that art is filed under them: two characters sharing one id
    /// would share one portrait, and the second would wear the first's face.
    #[test]
    fn every_roster_id_is_unique() {
        let mut seen = std::collections::HashSet::new();
        for character in all_characters() {
            assert!(
                seen.insert(character.id.as_str()),
                "{:?} is used by more than one character",
                character.id
            );
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
    fn a_character_gamebanana_lists_and_we_do_not_is_added() {
        let bundled = all_characters();
        let before = bundled.len();
        let listed = vec![
            (9_900_001_i64, "Testbed Example".to_string()),
            // Already in the roster under this id, so it must not arrive a second time.
            (
                bundled[0].gamebanana_category_id.unwrap(),
                bundled[0].name.clone(),
            ),
        ];

        let merged = merge_discovered(bundled, &listed);
        assert_eq!(merged.len(), before + 1, "exactly one of them was new");

        let added = merged.last().unwrap();
        assert_eq!(added.id, "testbed-example");
        assert_eq!(added.gamebanana_category_id, Some(9_900_001));
    }

    /// The cost of deriving art from the id: an id collision is now a wrong face rather than a
    /// missing one, so a discovered name that slugs onto an established character is refused.
    #[test]
    fn a_discovered_name_that_slugs_onto_an_existing_id_is_skipped() {
        let bundled = all_characters();
        let twin = &bundled[0];
        // A category id nobody has, so only the id collision can keep this out.
        let listed = vec![(9_900_002_i64, twin.name.to_lowercase())];
        assert_eq!(slugify_character_name(&twin.name.to_lowercase()), twin.id);

        assert_eq!(
            merge_discovered(bundled, &listed).len(),
            bundled.len(),
            "a name that slugs onto {:?} must not be admitted under that id",
            twin.id
        );
    }

    /// Two unknown names that slug alike: the first is admitted, the second is not.
    #[test]
    fn two_discovered_names_that_slug_alike_yield_one_character() {
        let bundled = all_characters();
        let listed = vec![
            (9_900_003_i64, "Testbed Example".to_string()),
            (9_900_004_i64, "testbed  example".to_string()),
        ];
        assert_eq!(merge_discovered(bundled, &listed).len(), bundled.len() + 1);
    }

    /// A literal "UI" category cannot arrive as a second UI shelf beside the pseudo-category.
    #[test]
    fn a_discovered_category_named_like_a_pseudo_category_is_skipped() {
        let bundled = all_characters();
        let listed = vec![(9_900_005_i64, "UI".to_string())];
        assert_eq!(merge_discovered(bundled, &listed).len(), bundled.len());
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
