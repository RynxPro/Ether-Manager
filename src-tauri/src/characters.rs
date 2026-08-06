use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub name: String,
    pub portrait: Option<String>,
    pub gamebanana_category_id: Option<i64>,
}

const CHARACTERS_JSON: &str = include_str!("../data/zzz_characters.json");

static CHARACTERS: OnceLock<Vec<Character>> = OnceLock::new();

/// The full static ZZZ character roster, bundled into the binary at compile time.
pub fn all_characters() -> &'static [Character] {
    CHARACTERS.get_or_init(|| {
        serde_json::from_str(CHARACTERS_JSON).expect("data/zzz_characters.json must be valid JSON")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_all_sixty_characters() {
        let characters = all_characters();
        assert_eq!(characters.len(), 60);
        assert!(characters
            .iter()
            .any(|c| c.id == "belle" && c.portrait.is_some()));
        assert!(characters
            .iter()
            .any(|c| c.id == "promeia" && c.portrait.is_none()));
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
}
