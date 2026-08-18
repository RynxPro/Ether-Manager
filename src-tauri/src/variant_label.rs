//! Naming *which file* of a mod is installed, as a fact of its own.
//!
//! A mod page routinely ships a dozen archives, and taking two of them used to produce two
//! library rows with the same name. The first attempt at fixing that folded the distinguishing
//! words into the name itself — "ZZMI RabbitFX - Glow FX + Censor Remover - Main file" — which
//! made one string carry two facts and left every consumer coping with the consequences: names
//! too long to read, a card that had to suppress the note when the name already ended with it,
//! and no way to group two files of one mod as what they are.
//!
//! So the name stays the mod's name, and this is the other fact. Kept in Rust rather than
//! computed in the install dialog because a mod's file can also change without a dialog being
//! open — an update, a reinstall — and all three paths have to agree on what the row now holds.

use crate::gamebanana::GbFile;

/// GameBanana appends a short hex tag when an uploader reuses a filename, so half the archives
/// on a busy mod end in things like `_c8084`. It identifies nothing to a reader.
const HASH_SUFFIX_LEN: std::ops::RangeInclusive<usize> = 4..=8;
/// A filename that is nothing but a checksum — `43a9e9f2b9aacaf14cf3f91a5651cb1f.rar` is real.
const MIN_BARE_HASH_LEN: usize = 16;

fn is_hex(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_hexdigit())
}

fn has_vowel(s: &str) -> bool {
    s.chars()
        .any(|c| matches!(c.to_ascii_lowercase(), 'a' | 'e' | 'i' | 'o' | 'u'))
}

/// Turns an archive filename into something a person would write.
///
/// `ll_remielle_white_variety_pack_-_exposed_dress.zip` becomes "Remielle White Variety Pack
/// Exposed Dress" — which is, almost to the word, what someone renaming that mod by hand types.
pub fn prettify_file_name(file_name: &str) -> String {
    let stem = file_name.rsplit_once('.').map_or(file_name, |(stem, _)| stem);

    let stem = match stem.rsplit_once('_') {
        Some((head, tail))
            if HASH_SUFFIX_LEN.contains(&tail.len())
                && is_hex(tail)
                && tail.chars().any(|c| c.is_ascii_digit()) =>
        {
            head
        }
        _ => stem,
    };

    stem.split(['_', ' ', '-'])
        .filter(|w| !w.is_empty())
        .enumerate()
        // An uploader's initials, as in `ll_remielle_...`. Guarded on having no vowel so a
        // genuine short word survives: `ui_reskin_pre_v311` must keep its "ui".
        .filter(|(i, w)| !(*i == 0 && w.len() <= 2 && !has_vowel(w)))
        .map(|(_, w)| {
            let mut chars = w.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Whether a prettified filename actually tells you anything.
///
/// One real word is enough — "Albedo" and "Lucia Nsfw" are perfectly good, and demanding two
/// rejected a third of the survey for no reason. Trailing digits are ignored when deciding what
/// counts as a word, so "Slotfix31" reads as one and "V614" does not.
///
/// Measured rather than guessed: across 264 files from 100 ZZZ mods this rejects six, and all
/// six deserve it — four bare checksums, one `p__4894b`, one `nsfw_acee7` reducing to "Nsfw".
pub fn is_informative_name(pretty: &str) -> bool {
    if pretty.is_empty() {
        return false;
    }
    let squashed: String = pretty.chars().filter(|c| !c.is_whitespace()).collect();
    if squashed.len() >= MIN_BARE_HASH_LEN && is_hex(&squashed) {
        return false;
    }
    pretty.split_whitespace().any(|word| {
        let letters: String = word
            .chars()
            .take_while(|c| c.is_ascii_alphabetic())
            .collect();
        letters.len() >= 3 && has_vowel(&letters)
    })
}

/// Which of a mod's files this is, in words.
///
/// `None` when the mod ships a single file: there is nothing to tell apart, and captioning a
/// lone mod with its own filename is noise. Otherwise the filename when it reads as words, then
/// the uploader's own note for the file, then nothing — a label that says nothing is worse than
/// no label, because it takes up the line where something useful could have gone.
pub fn variant_label(files: &[GbFile], chosen: &GbFile) -> Option<String> {
    if files.len() <= 1 {
        return None;
    }

    let pretty = prettify_file_name(&chosen.file_name);
    if is_informative_name(&pretty) {
        return Some(pretty);
    }

    chosen
        .description
        .as_deref()
        .map(str::trim)
        .filter(|note| !note.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(id: i64, name: &str, description: Option<&str>) -> GbFile {
        GbFile {
            id,
            file_name: name.to_string(),
            file_size: 1,
            date_added: 1,
            download_count: 0,
            download_url: String::new(),
            md5_checksum: String::new(),
            analysis_result: None,
            av_result: None,
            analysis_result_verbose: None,
            description: description.map(str::to_string),
            version: None,
            analysis_warnings: Vec::new(),
        }
    }

    #[test]
    fn a_mod_with_one_file_has_no_variant_to_name() {
        let only = file(1, "belle_-_bottom_heavy.zip", Some("SFW Variants Only"));
        assert_eq!(variant_label(std::slice::from_ref(&only), &only), None);
    }

    #[test]
    fn a_readable_file_name_becomes_the_label() {
        let a = file(1, "ll_remielle_white_variety_pack_-_exposed_dress.zip", None);
        let b = file(2, "ll_remielle_black_variety_pack_-_nude.zip", None);
        assert_eq!(
            variant_label(&[a.clone(), b], &a).as_deref(),
            Some("Remielle White Variety Pack Exposed Dress")
        );
    }

    /// The case that forced a fallback: GameBanana's own name for this file is unreadable, but
    /// the uploader captioned it.
    #[test]
    fn an_unreadable_file_name_falls_back_to_the_uploaders_note() {
        let a = file(1, "v614_cac91.zip", Some("Main file"));
        let b = file(2, "rabbitfx_fixer_exe_version.zip", None);
        assert_eq!(
            variant_label(&[a.clone(), b], &a).as_deref(),
            Some("Main file")
        );
    }

    #[test]
    fn a_bare_checksum_with_no_note_is_left_unlabelled() {
        let a = file(1, "43a9e9f2b9aacaf14cf3f91a5651cb1f.rar", None);
        let b = file(2, "yanagist_30_full_.zip", None);
        assert_eq!(variant_label(&[a.clone(), b], &a), None);
    }

    #[test]
    fn gamebananas_collision_tag_is_not_part_of_the_name() {
        assert_eq!(prettify_file_name("velina_makeup_6fc91.zip"), "Velina Makeup");
        assert_eq!(
            prettify_file_name("bodacious_belle_a7f3b.zip"),
            "Bodacious Belle"
        );
    }

    /// A leading one or two letter token is an uploader's signature — unless it is a real word.
    #[test]
    fn a_leading_initial_is_dropped_but_a_short_word_survives() {
        assert_eq!(prettify_file_name("ll_remielle_demo.zip"), "Remielle Demo");
        assert_eq!(
            prettify_file_name("ui_reskin_pre_v311_d2b41.zip"),
            "Ui Reskin Pre V311"
        );
    }

    #[test]
    fn one_real_word_is_enough_but_alphanumeric_soup_is_not() {
        assert!(is_informative_name("Albedo"));
        assert!(is_informative_name("Lucia Nsfw"));
        assert!(is_informative_name("Slotfix31"));
        assert!(!is_informative_name("V614"));
        assert!(!is_informative_name("Af4e552eedd4591600c40a77b3a600f2"));
        assert!(!is_informative_name(""));
    }
}
