//! Which enabled mods are fighting over the same piece of the game.
//!
//! A 3DMigoto mod works by claiming assets: each `[TextureOverride…]` section names a `hash`,
//! and the game hands that asset to whichever mod claimed it. Two enabled mods claiming the same
//! hash is therefore not a matter of opinion — one of them wins and the other silently does not,
//! which is what people are seeing when a mod "doesn't work" for no visible reason.
//!
//! This replaces a count. The library used to say "3 mods enabled at once … they usually
//! conflict", which is true of some sets of three and false of others, and the user had no way
//! to tell which they had. Reading the hashes answers the actual question.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

/// How deep to walk inside one mod. Mods are a couple of levels; this only stops a symlink loop,
/// and matches the cap `fs_ops::normalize_ini_extensions` already uses on the same trees.
const MAX_DEPTH: usize = 16;

/// One mod's claim on the game, as the hashes its ini files declare.
#[derive(Debug, Clone)]
pub struct ModHashes {
    pub mod_id: i64,
    pub character_id: String,
    pub hashes: BTreeSet<String>,
}

/// One asset that more than one enabled mod claims.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct ModConflict {
    /// The contested hash, lowercase.
    pub hash: String,
    /// Whose page this belongs on. Unambiguous by construction: a hash claimed under more than
    /// one character is treated as shared and never reaches this type.
    pub character_id: String,
    /// The mods claiming it — always two or more, in ascending id order so the answer is stable
    /// between calls and the frontend never has to sort it to compare.
    pub mod_ids: Vec<i64>,
}

/// Whether 3DMigoto would read this file.
///
/// Both rules are the game's, not ours. `d3dx.ini` carries `exclude_recursive = DISABLED*`, so
/// anything wearing that prefix is already invisible to it — which covers the `DISABLED_BACKUP_`
/// files XXMI leaves behind and the backups other tools leave too. And it matches `.ini`
/// case-sensitively, which is the whole reason `fs_ops::normalize_ini_extensions` exists: a file
/// called `Nicole.INI` is not loaded, so its hashes are not claimed and must not be counted.
fn is_loaded_ini(file_name: &str) -> bool {
    file_name.ends_with(".ini") && !file_name.to_ascii_uppercase().starts_with("DISABLED")
}

/// The hashes declared in one ini file's text.
///
/// Deliberately loose about spelling — `hash=abc`, `Hash = ABC`, a trailing `;` comment — while
/// being strict about the value. Every one of the 546 declarations in a real library is written
/// `hash = <hex>`, but a parser that only accepted that would quietly return nothing for a mod
/// written by someone with different habits, and returning nothing looks exactly like having no
/// conflicts.
pub fn parse_ini_hashes(text: &str) -> BTreeSet<String> {
    let mut found = BTreeSet::new();
    for line in text.lines() {
        let line = line.trim();
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if !key.trim().eq_ignore_ascii_case("hash") {
            continue;
        }
        // A value can carry a trailing comment; 3DMigoto takes the first token.
        let value = value.split([';', '#']).next().unwrap_or("").trim();
        if value.len() >= 6 && value.chars().all(|c| c.is_ascii_hexdigit()) {
            found.insert(value.to_ascii_lowercase());
        }
    }
    found
}

/// Every hash one mod's folder claims.
///
/// Unreadable files are skipped rather than reported. A mod folder is other people's content and
/// can hold anything; failing the whole library's conflict check because one file in one mod is
/// not valid UTF-8 would trade a useful answer for no answer.
pub fn collect_mod_hashes(dir: &Path) -> BTreeSet<String> {
    let mut found = BTreeSet::new();
    collect_at(dir, 0, &mut found);
    found
}

fn collect_at(dir: &Path, depth: usize, found: &mut BTreeSet<String>) {
    if depth > MAX_DEPTH {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        if path.is_dir() {
            // Same exclusion as files: the game does not walk into a DISABLED folder, so a
            // variant switched off inside a mod claims nothing.
            if !name.to_ascii_uppercase().starts_with("DISABLED") {
                collect_at(&path, depth + 1, found);
            }
        } else if is_loaded_ini(&name) {
            if let Ok(text) = std::fs::read_to_string(&path) {
                found.extend(parse_ini_hashes(&text));
            }
        }
    }
}

/// The contested assets among a set of mods, which the caller has already narrowed to the ones
/// the game is actually loading.
///
/// A hash claimed by mods filed under more than one character is treated as shared rather than
/// contested, and left out. This is the difference between a useful warning and a nagging one:
/// mods routinely carry the same boilerplate — a vertex-limit raise, a common shader — and
/// flagging every mod that ships it would put a conflict on half the library and teach people to
/// ignore the badge, which is the failure mode this whole feature exists to fix.
///
/// The cost of that choice, stated plainly: two mods for *different* characters that genuinely
/// fight over one asset are not reported. That is a real miss, and the bet is that it is rarer
/// than the shared boilerplate it suppresses. Worth revisiting against a library that has one.
pub fn find_conflicts(enabled: &[ModHashes]) -> Vec<ModConflict> {
    let mut claims: BTreeMap<&str, Vec<&ModHashes>> = BTreeMap::new();
    for entry in enabled {
        for hash in &entry.hashes {
            claims.entry(hash.as_str()).or_default().push(entry);
        }
    }

    let mut conflicts: Vec<ModConflict> = claims
        .into_iter()
        .filter(|(_, owners)| owners.len() > 1)
        .filter(|(_, owners)| {
            let characters: BTreeSet<&str> =
                owners.iter().map(|o| o.character_id.as_str()).collect();
            characters.len() == 1
        })
        .map(|(hash, owners)| {
            let mut mod_ids: Vec<i64> = owners.iter().map(|o| o.mod_id).collect();
            mod_ids.sort_unstable();
            mod_ids.dedup();
            ModConflict {
                hash: hash.to_string(),
                character_id: owners[0].character_id.clone(),
                mod_ids,
            }
        })
        // One mod declaring the same hash in two of its own files is not a conflict with itself.
        .filter(|conflict| conflict.mod_ids.len() > 1)
        .collect();

    conflicts.sort_by(|a, b| a.hash.cmp(&b.hash));
    conflicts
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    /// The same self-contained temp directory the archive and import tests use, rather than a
    /// new dev-dependency for one test.
    fn temp_dir(label: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ether-manager-conflicts-test-{label}-{n}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn mod_with(mod_id: i64, character_id: &str, hashes: &[&str]) -> ModHashes {
        ModHashes {
            mod_id,
            character_id: character_id.to_string(),
            hashes: hashes.iter().map(|h| h.to_string()).collect(),
        }
    }

    #[test]
    fn reads_the_spelling_every_real_mod_uses() {
        let text = "[TextureOverrideEllenBody]\nhash = 0fdae851\nmatch_first_index = 0\n";
        assert_eq!(
            parse_ini_hashes(text),
            BTreeSet::from(["0fdae851".to_string()])
        );
    }

    #[test]
    fn reads_the_spellings_real_mods_happen_not_to_use() {
        // None of these appear in the libraries this was built against. They are accepted anyway
        // because a parser that returns nothing is indistinguishable from a mod with no conflicts.
        let text = "hash=0FDAE851\n  Hash  =  0219df6e  \nhash = 67c61080 ; the hair\nhash = 8b067f99 # also the hair\n";
        assert_eq!(
            parse_ini_hashes(text),
            BTreeSet::from([
                "0219df6e".to_string(),
                "0fdae851".to_string(),
                "67c61080".to_string(),
                "8b067f99".to_string(),
            ])
        );
    }

    #[test]
    fn ignores_everything_that_is_not_a_hash() {
        let text = "[Constants]\nglobal $active0\nkey = no_ctrl vk_left\n; hash = deadbeef\nmatch_priority = 0\nhash = notahexvalue\nhash = abc\n";
        assert!(
            parse_ini_hashes(text).is_empty(),
            "a commented-out hash, a non-hex value and a too-short value are all not claims"
        );
    }

    #[test]
    fn two_mods_on_one_character_claiming_one_asset_is_a_conflict() {
        let found = find_conflicts(&[
            mod_with(1, "ellen", &["0fdae851", "aaaaaaaa"]),
            mod_with(2, "ellen", &["0fdae851", "bbbbbbbb"]),
        ]);
        assert_eq!(
            found,
            vec![ModConflict {
                hash: "0fdae851".to_string(),
                character_id: "ellen".to_string(),
                mod_ids: vec![1, 2],
            }]
        );
    }

    #[test]
    fn mods_that_claim_nothing_in_common_do_not_conflict() {
        let found = find_conflicts(&[
            mod_with(1, "ellen", &["0fdae851"]),
            mod_with(2, "ellen", &["bbbbbbbb"]),
        ]);
        assert!(
            found.is_empty(),
            "two mods for one character are not a conflict merely by both being on - which is \
             exactly what the warning this replaces was saying"
        );
    }

    #[test]
    fn an_asset_claimed_across_characters_is_treated_as_shared() {
        let found = find_conflicts(&[
            mod_with(1, "ellen", &["0fdae851"]),
            mod_with(2, "nicole", &["0fdae851"]),
        ]);
        assert!(
            found.is_empty(),
            "boilerplate shipped by mods for different characters must not fill the library \
             with warnings - see the note on find_conflicts for what this deliberately misses"
        );
    }

    #[test]
    fn one_mod_declaring_a_hash_twice_does_not_conflict_with_itself() {
        let mut twice = mod_with(1, "ellen", &["0fdae851"]);
        twice.hashes.insert("0fdae851".to_string());
        assert!(find_conflicts(&[twice]).is_empty());
    }

    #[test]
    fn collects_from_nested_files_and_skips_what_the_game_skips() {
        let root = temp_dir("collect");
        let root = root.as_path();
        std::fs::write(root.join("Ellen.ini"), "hash = 0fdae851\n").unwrap();
        std::fs::create_dir_all(root.join("variant")).unwrap();
        std::fs::write(root.join("variant/body.ini"), "hash = 0219df6e\n").unwrap();

        // Everything below is invisible to 3DMigoto, so it must be invisible here too.
        std::fs::write(
            root.join("DISABLED_BACKUP_1749653424.Ellen.ini"),
            "hash = ffffffff\n",
        )
        .unwrap();
        std::fs::write(
            root.join("DISABLED_RABBITFXBACKUP_x.ini"),
            "hash = eeeeeeee\n",
        )
        .unwrap();
        std::fs::write(root.join("Shouty.INI"), "hash = dddddddd\n").unwrap();
        std::fs::create_dir_all(root.join("DISABLED_variant")).unwrap();
        std::fs::write(root.join("DISABLED_variant/x.ini"), "hash = cccccccc\n").unwrap();
        std::fs::write(root.join("notes.txt"), "hash = bbbbbbbb\n").unwrap();

        assert_eq!(
            collect_mod_hashes(root),
            BTreeSet::from(["0219df6e".to_string(), "0fdae851".to_string()])
        );
    }

    #[test]
    fn a_folder_that_is_not_there_claims_nothing() {
        assert!(collect_mod_hashes(Path::new("D:/no/such/mod/folder")).is_empty());
    }
}
