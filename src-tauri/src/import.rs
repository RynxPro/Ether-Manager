//! Working out what is actually inside a mod someone brings in from outside the app.
//!
//! A GameBanana install knows what it is downloading before it starts: the API says the name,
//! the category, and which file was chosen. A `.zip` from Patreon or Discord says none of that.
//! All the app has is a path, so it has to look inside and form an opinion before asking the
//! user to confirm one — otherwise every import starts with three questions the app could have
//! answered itself.
//!
//! Nothing here writes anything. It reads a tree and returns what it found, so it can be run
//! against a staging directory and thrown away if the user cancels.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::characters::all_characters;
use crate::variant_label::{is_informative_name, prettify_file_name};

/// How far down to look for a mod. Deep enough for the wrapper folders archives habitually
/// carry (`pack/variant/mod/`), shallow enough that pointing this at a whole Downloads folder
/// by mistake does not walk the disk.
const MAX_SCAN_DEPTH: usize = 6;

/// The shortest word from a character's name allowed to identify them on its own. Every one of
/// the 60 has at least one word this long, and the bar keeps three-letter fragments like the
/// "Dan" of "Remielle Dan" from matching whatever happens to be in a filename.
const MIN_NAME_TOKEN: usize = 4;

/// Folder names that are real words and still say nothing about what is in them. Needed
/// because `is_informative_name` was measured against GameBanana *file* names, where one real
/// word is plenty — "Albedo" is a fine name for a mod. A *folder* called "Mod" is not, and it
/// is what an archive falls back to when its author could not think of anything either.
const GENERIC_FOLDER_NAMES: [&str; 8] = [
    "mod", "mods", "folder", "new folder", "data", "files", "release", "final",
];

const IMAGE_EXTENSIONS: [&str; 4] = ["png", "jpg", "jpeg", "webp"];

/// What an uploader tends to call the picture they meant as the mod's face.
const PREVIEW_KEYWORDS: [&str; 5] = ["preview", "thumb", "screenshot", "cover", "splash"];

/// One installable mod found inside the tree.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ImportCandidate {
    /// Where it sits inside the inspected tree, `/`-separated and always relative. Empty when
    /// the tree's own root is the mod — an archive with no wrapper folder of its own.
    pub rel_path: String,
    /// A readable name, guessed from the folder holding it.
    pub suggested_name: String,
    /// A picture to use as the card's art, relative to the tree in the same way.
    pub preview_rel_path: Option<String>,
}

/// Everything the app worked out about a dropped file or folder, before touching anything.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ImportPlan {
    /// Empty means this does not look like an XXMI mod at all — no `.ini` anywhere in it.
    pub candidates: Vec<ImportCandidate>,
    /// `None` when nothing in the names identified a character, or when two of them fit
    /// equally well. A wrong guess is worse than no guess: it puts a mod somewhere the user
    /// did not look, and the confirmation step is where it would have been caught.
    pub suggested_character_id: Option<String>,
}

/// Whether a filename is a mod's own config rather than something that merely ends in `.ini`.
pub fn is_mod_ini(file_name: &str) -> bool {
    let lower = file_name.to_lowercase();
    lower.ends_with(".ini")
        && lower != "desktop.ini"
        // XXMI writes one of these beside a mod's ini whenever it edits one. Treating it as a
        // mod would turn every previously-managed folder into two.
        && !lower.starts_with("disabled_backup_")
}

/// The directories in `root` that are mods, shallowest first.
///
/// A directory qualifies by directly containing a mod `.ini`, and the walk stops there rather
/// than descending: mods routinely carry per-variant `.ini` files in subfolders, and those are
/// part of the mod, not separate mods sitting next to it.
pub fn find_mod_roots(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    collect_mod_roots(root, 0, &mut found);
    found.sort();
    found
}

fn collect_mod_roots(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    if depth > MAX_SCAN_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    let mut subdirs = Vec::new();
    let mut holds_a_mod = false;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            subdirs.push(path);
        } else if is_mod_ini(&entry.file_name().to_string_lossy()) {
            holds_a_mod = true;
        }
    }

    if holds_a_mod {
        out.push(dir.to_path_buf());
        return;
    }

    subdirs.sort();
    for sub in subdirs {
        collect_mod_roots(&sub, depth + 1, out);
    }
}

/// A picture to stand for `mod_root`, if the archive shipped one.
///
/// Looked for by name first, and only then by size, and only ever among files loose at the top
/// of a directory. Mods are full of `.png` textures; picking the biggest image anywhere inside
/// one would reliably produce a close-up of a fabric weave. Returning `None` is a fine answer —
/// the card falls back to the same placeholder it uses for anything else without art.
pub fn find_preview(tree_root: &Path, mod_root: &Path) -> Option<PathBuf> {
    keyword_image(mod_root)
        .or_else(|| keyword_image(tree_root))
        .or_else(|| largest_image(tree_root))
}

fn images_directly_in(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut images: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && has_image_extension(p))
        .collect();
    images.sort();
    images
}

fn has_image_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn keyword_image(dir: &Path) -> Option<PathBuf> {
    images_directly_in(dir).into_iter().find(|path| {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        PREVIEW_KEYWORDS.iter().any(|k| name.contains(k))
    })
}

fn largest_image(dir: &Path) -> Option<PathBuf> {
    images_directly_in(dir)
        .into_iter()
        .max_by_key(|path| fs::metadata(path).map(|m| m.len()).unwrap_or(0))
}

/// Splits a name into words, breaking on punctuation and on camelCase humps, so
/// `NicoleAmillion` and `nicole-bottom_heavy` both come apart into their pieces.
fn split_words(text: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    let mut prev_was_lower = false;

    for ch in text.chars() {
        if ch.is_alphanumeric() {
            if ch.is_uppercase() && prev_was_lower && !current.is_empty() {
                words.push(std::mem::take(&mut current));
            }
            current.push(ch);
            prev_was_lower = ch.is_lowercase();
        } else {
            if !current.is_empty() {
                words.push(std::mem::take(&mut current));
            }
            prev_was_lower = false;
        }
    }
    if !current.is_empty() {
        words.push(current);
    }
    words
}

/// The same words, lowercased, for comparing against the character roster.
fn name_tokens(text: &str) -> Vec<String> {
    split_words(text)
        .into_iter()
        .map(|word| word.to_lowercase())
        .collect()
}

/// Turns a folder name into a title.
///
/// Separate from `prettify_file_name` because folders are named differently from GameBanana's
/// files: they run words together in camelCase (`NicoleAmillion`), and they carry acronyms that
/// have to survive (`NicoleBH` must not become "Nicole Bh"). So words are split on the humps as
/// well as the punctuation, and only an all-lowercase word gets its first letter raised.
fn prettify_folder_name(folder: &str) -> String {
    split_words(strip_leading_tag(folder))
        .into_iter()
        .map(|word| {
            if word.chars().any(|c| c.is_uppercase()) {
                return word;
            }
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Which character these names are about, if they agree on one.
///
/// Scored by how many words of a character's name turn up, then by how long the longest of
/// them is, so "Nicole Demara" beats a bare surname. A tie is reported as no answer rather
/// than as a coin flip: "Demara" alone belongs to Anby as much as to Nicole.
pub fn guess_character_id(hints: &[String]) -> Option<String> {
    let seen: HashSet<String> = hints.iter().flat_map(|hint| name_tokens(hint)).collect();

    let mut scored: Vec<(usize, usize, &str)> = Vec::new();
    for character in all_characters() {
        let mut matched = 0usize;
        let mut longest = 0usize;
        for token in name_tokens(&character.name) {
            if token.len() >= MIN_NAME_TOKEN && seen.contains(&token) {
                matched += 1;
                longest = longest.max(token.len());
            }
        }
        if matched > 0 {
            scored.push((matched, longest, character.id.as_str()));
        }
    }

    scored.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)));
    match scored.as_slice() {
        [] => None,
        [best, runner_up, ..] if best.0 == runner_up.0 && best.1 == runner_up.1 => None,
        [best, ..] => Some(best.2.to_string()),
    }
}

/// Reads `tree_root` and reports what could be installed from it.
///
/// `source_label` is the name of the thing the user actually picked — the archive's filename,
/// or the folder's own name. It is the fallback title for a mod whose folder is called
/// something like `mod` or `v2`, and it feeds the character guess, since an archive's name is
/// often the only place the character is written down.
pub fn plan_for(tree_root: &Path, source_label: &str) -> ImportPlan {
    let roots = find_mod_roots(tree_root);
    let fallback_name = prettify_file_name(source_label);

    let mut hints = vec![source_label.to_string()];
    let mut candidates = Vec::with_capacity(roots.len());

    for root in &roots {
        let folder = root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        hints.push(folder.clone());
        hints.extend(mod_ini_names(root));

        let pretty = prettify_folder_name(&folder);
        candidates.push(ImportCandidate {
            rel_path: relative_to(tree_root, root),
            suggested_name: if names_the_mod(&pretty) {
                pretty
            } else {
                fallback_name.clone()
            },
            preview_rel_path: find_preview(tree_root, root)
                .map(|preview| relative_to(tree_root, &preview)),
        });
    }

    ImportPlan {
        suggested_character_id: guess_character_id(&hints),
        candidates,
    }
}

/// Whether a prettified folder name is worth showing as the mod's title.
fn names_the_mod(pretty: &str) -> bool {
    is_informative_name(pretty) && !GENERIC_FOLDER_NAMES.contains(&pretty.to_lowercase().as_str())
}

/// Drops a bracketed tag from the front of a folder name — `[LL] Remielle Black Variety Pack`
/// is the author's initials, `[NSFW]` and `[4K]` are shelf labels, and none of them are what
/// the mod is called. Only the leading one goes, and only if something is left after it.
///
/// Kept here rather than in `prettify_file_name` because this is a folder-naming habit:
/// GameBanana filenames carry the uploader's initials as a bare `ll_` prefix instead, which
/// that function already handles.
fn strip_leading_tag(folder: &str) -> &str {
    let trimmed = folder.trim_start();
    let Some(rest) = trimmed.strip_prefix('[') else {
        return folder;
    };
    match rest.split_once(']') {
        Some((_, after)) if !after.trim().is_empty() => after.trim_start(),
        _ => folder,
    }
}

fn mod_ini_names(dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|name| is_mod_ini(name))
        .collect()
}

/// `/`-separated so the same string reads the same on either side of the bridge; `Path::join`
/// accepts forward slashes on Windows, so it survives the round trip back into a real path.
fn relative_to(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_dir(label: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ether-manager-import-test-{label}-{n}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(root: &Path, rel: &str, contents: &[u8]) {
        let path = root.join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    #[test]
    fn a_mod_ini_is_told_apart_from_the_other_ini_files_that_turn_up() {
        assert!(is_mod_ini("Nicole.ini"));
        assert!(is_mod_ini("NicoleBH.INI"));
        assert!(!is_mod_ini("desktop.ini"));
        assert!(
            !is_mod_ini("DISABLED_BACKUP_1758754490.Nicole.ini"),
            "XXMI's own backup would otherwise double every managed folder"
        );
        assert!(!is_mod_ini("readme.txt"));
    }

    #[test]
    fn the_wrapper_folder_archives_carry_is_found_rather_than_the_archive_root() {
        let root = temp_dir("wrapper");
        write(&root, "Nicole-BottomHeavy/NicoleBH.ini", b"");
        write(&root, "README.txt", b"");

        assert_eq!(find_mod_roots(&root), vec![root.join("Nicole-BottomHeavy")]);
    }

    #[test]
    fn a_mod_at_the_top_of_the_tree_is_the_tree_itself() {
        let root = temp_dir("flat");
        write(&root, "Nicole.ini", b"");

        assert_eq!(find_mod_roots(&root), vec![root.clone()]);
        assert_eq!(plan_for(&root, "nicole.zip").candidates[0].rel_path, "");
    }

    #[test]
    fn a_pack_yields_one_candidate_per_variant() {
        let root = temp_dir("pack");
        write(&root, "Pack/Red/Remielle.ini", b"");
        write(&root, "Pack/Blue/Remielle.ini", b"");
        write(&root, "Pack/patreon instructions.txt", b"");

        let roots = find_mod_roots(&root);
        assert_eq!(roots.len(), 2, "got {roots:?}");
    }

    #[test]
    fn a_mods_own_sub_variants_do_not_become_separate_mods() {
        let root = temp_dir("subvariants");
        write(&root, "Nicole-BottomHeavy/NicoleBH.ini", b"");
        write(&root, "Nicole-BottomHeavy/Variants/Nsfw.ini", b"");
        write(&root, "Nicole-BottomHeavy/Variants/Sfw.ini", b"");

        assert_eq!(
            find_mod_roots(&root),
            vec![root.join("Nicole-BottomHeavy")],
            "the walk must stop at the shallowest ini"
        );
    }

    #[test]
    fn a_preview_beside_the_mod_folder_is_picked_up() {
        let root = temp_dir("preview");
        write(&root, "NicoleAmillion/Nicole.ini", b"");
        write(&root, "NicolePreview.png", b"pretend png");

        let plan = plan_for(&root, "nicole_amillion.zip");
        assert_eq!(
            plan.candidates[0].preview_rel_path.as_deref(),
            Some("NicolePreview.png")
        );
    }

    #[test]
    fn a_texture_buried_in_the_mod_is_not_mistaken_for_a_preview() {
        let root = temp_dir("texture");
        write(&root, "NicoleAmillion/Nicole.ini", b"");
        write(&root, "NicoleAmillion/textures/skin.png", &[0u8; 4096]);

        let plan = plan_for(&root, "nicole_amillion.zip");
        assert_eq!(plan.candidates[0].preview_rel_path, None);
    }

    #[test]
    fn the_character_is_guessed_from_the_names_around_the_mod() {
        let root = temp_dir("guess");
        write(&root, "NicoleAmillion/Nicole.ini", b"");

        assert_eq!(
            plan_for(&root, "nicole_amillion.zip").suggested_character_id,
            Some("nicole-demara".to_string())
        );
    }

    #[test]
    fn a_surname_two_characters_share_is_not_an_identification() {
        assert_eq!(guess_character_id(&["Demara pack".to_string()]), None);
        assert_eq!(
            guess_character_id(&["Nicole Demara pack".to_string()]),
            Some("nicole-demara".to_string())
        );
    }

    #[test]
    fn names_nothing_in_the_roster_matches_are_left_for_the_user() {
        assert_eq!(guess_character_id(&["cool_outfit_v2.zip".to_string()]), None);
    }

    #[test]
    fn an_uninformative_folder_name_falls_back_to_what_the_user_picked() {
        let root = temp_dir("fallback");
        write(&root, "mod/Nicole.ini", b"");

        let plan = plan_for(&root, "ll_nicole_bottom_heavy.zip");
        assert_eq!(plan.candidates[0].suggested_name, "Nicole Bottom Heavy");
    }

    /// The shape of a real Patreon pack, copied from one already in the library — an author
    /// tag on the folder, an instructions file loose beside it, a space in the ini's name.
    #[test]
    fn a_real_patreon_pack_is_read_end_to_end() {
        let root = temp_dir("patreon");
        write(
            &root,
            "[LL] Remielle Black Variety Pack - Nude/RemielleBlack LT.ini",
            b"",
        );
        write(&root, "patreon com Lewd_Lad Instructions.txt", b"");

        let plan = plan_for(&root, "remielle_black_variety_pack.zip");
        assert_eq!(plan.candidates.len(), 1);
        assert_eq!(
            plan.candidates[0].suggested_name,
            "Remielle Black Variety Pack Nude",
            "the author's bracketed tag is not part of the mod's name"
        );
        assert_eq!(
            plan.suggested_character_id,
            Some("remielle-dan".to_string())
        );
    }

    /// The other real shape: a wrapper folder, a preview loose beside it, a readme.
    #[test]
    fn a_real_archive_with_a_preview_beside_it_is_read_end_to_end() {
        let root = temp_dir("amillion");
        write(&root, "NicoleAmillion/Nicole.ini", b"");
        write(&root, "NicolePreview.png", b"pretend png");
        write(&root, "ReadMe.txt", b"");

        let plan = plan_for(&root, "nicole_amillion_564149.zip");
        assert_eq!(
            plan.candidates,
            vec![ImportCandidate {
                rel_path: "NicoleAmillion".to_string(),
                suggested_name: "Nicole Amillion".to_string(),
                preview_rel_path: Some("NicolePreview.png".to_string()),
            }]
        );
        assert_eq!(plan.suggested_character_id, Some("nicole-demara".to_string()));
    }

    #[test]
    fn a_bracketed_tag_is_only_dropped_when_something_is_left_behind_it() {
        assert_eq!(strip_leading_tag("[LL] Remielle Black"), "Remielle Black");
        assert_eq!(strip_leading_tag("[NSFW]"), "[NSFW]");
        assert_eq!(strip_leading_tag("Nicole [4K]"), "Nicole [4K]");
        assert_eq!(strip_leading_tag("Nicole-BottomHeavy"), "Nicole-BottomHeavy");
    }

    #[test]
    fn nothing_that_looks_like_a_mod_yields_no_candidates() {
        let root = temp_dir("empty");
        write(&root, "notes.txt", b"");
        write(&root, "art/render.png", b"");

        assert!(plan_for(&root, "art_pack.zip").candidates.is_empty());
    }
}
