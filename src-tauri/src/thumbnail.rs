//! Setting a mod's card image by hand.
//!
//! A mod installed from GameBanana has a listing to take a picture from, and one imported from an
//! archive often carries its author's preview inside it. A mod that arrives with neither — a
//! Discord attachment, a folder someone unpacked — has nothing, and the card stays blank however
//! long you look at it. The picture usually does exist; it was just sitting in the post the file
//! came from rather than in the file.
//!
//! So the image is taken from wherever the user already has it: pasted straight out of the
//! clipboard, or picked off disk. Both arrive here as bytes and are written into the mod's own
//! folder, exactly like a preview that shipped inside an archive, and recorded in the same
//! `bundled_thumbnail` column. That means it survives the source going away, needs no network,
//! and moves with the mod when it is refiled, since the stored path is relative to the folder.

use std::fs;
use std::path::Path;

/// Past this, it is not a card image. Real previews are tens to hundreds of kilobytes; the
/// ceiling is here so a mis-click on a huge file fails with a sentence rather than by copying
/// something enormous into a mod folder.
pub const MAX_THUMBNAIL_BYTES: usize = 8 * 1024 * 1024;

/// The name every thumbnail this app writes takes.
///
/// Fixed rather than derived from the source, for two reasons. Setting a new image overwrites the
/// previous one instead of leaving `preview.png`, `preview_1.png`, `preview_2.png` piling up in a
/// mod folder. And it can never collide with a picture the mod's author shipped: replacing our
/// own file is always safe, where guessing at theirs would not be.
const THUMBNAIL_STEM: &str = "ether-thumbnail";

/// Every extension this understands, and so every one that has to be swept when replacing.
const KNOWN_EXTENSIONS: [&str; 4] = ["png", "jpg", "webp", "gif"];

/// What kind of image these bytes actually are, by their own header rather than by what anything
/// claimed. A `Content-Type`, a file extension and a clipboard type are all things a source says
/// about a file; the first bytes are the file itself.
pub fn image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some("png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("jpg");
    }
    // RIFF....WEBP — the four bytes between are the length, so they are skipped rather than read.
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("gif");
    }
    None
}

/// Writes `bytes` into `mod_dir` as this mod's card image, returning the file name to record.
///
/// The name is relative on purpose: `bundled_thumbnail` stores it that way so that refiling a mod
/// under another character cannot leave the picture pointing at where the folder used to be.
pub fn write_thumbnail(mod_dir: &Path, bytes: &[u8]) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("that image is empty".to_string());
    }
    if bytes.len() > MAX_THUMBNAIL_BYTES {
        return Err(format!(
            "that image is {} MB — {} MB is the most a card picture can be",
            bytes.len() / (1024 * 1024),
            MAX_THUMBNAIL_BYTES / (1024 * 1024)
        ));
    }
    let extension = image_extension(bytes).ok_or_else(|| {
        "that does not look like an image — PNG, JPEG, WebP and GIF are understood".to_string()
    })?;
    if !mod_dir.is_dir() {
        return Err(format!(
            "{} is not there any more, so there is nowhere to put a picture",
            mod_dir.display()
        ));
    }

    // Swept before writing rather than after, so a mod is never briefly holding two of ours —
    // and so switching from a `.png` to a `.jpg` does not leave the old one behind unreferenced.
    clear_thumbnail(mod_dir);

    let file_name = format!("{THUMBNAIL_STEM}.{extension}");
    fs::write(mod_dir.join(&file_name), bytes)
        .map_err(|e| format!("could not save the picture: {e}"))?;
    Ok(file_name)
}

/// Removes any thumbnail this app wrote, and only those. A preview that came inside the mod's
/// archive belongs to whoever made it and is never touched — clearing simply stops pointing at it.
pub fn clear_thumbnail(mod_dir: &Path) {
    for extension in KNOWN_EXTENSIONS {
        let _ = fs::remove_file(mod_dir.join(format!("{THUMBNAIL_STEM}.{extension}")));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_dir(label: &str) -> std::path::PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ether-manager-thumbnail-{label}-{n}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn png() -> Vec<u8> {
        let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
        bytes.extend_from_slice(b"and then some pixels");
        bytes
    }

    fn jpeg() -> Vec<u8> {
        let mut bytes = vec![0xff, 0xd8, 0xff];
        bytes.extend_from_slice(b"and then some pixels");
        bytes
    }

    #[test]
    fn an_image_is_recognised_by_its_own_header_not_by_what_it_is_called() {
        assert_eq!(image_extension(&png()), Some("png"));
        assert_eq!(image_extension(&jpeg()), Some("jpg"));
        assert_eq!(image_extension(b"RIFF\0\0\0\0WEBPvp8"), Some("webp"));
        assert_eq!(image_extension(b"GIF89a and pixels"), Some("gif"));
    }

    #[test]
    fn things_that_are_not_images_are_refused_however_plausible_they_look() {
        // What a CDN hands back when a link has expired, which is the shape of thing most likely
        // to arrive here pretending to be a picture.
        assert_eq!(image_extension(b"<!DOCTYPE html><html>404"), None);
        assert_eq!(image_extension(b""), None);
        assert_eq!(image_extension(b"PNG"), None, "too short to be a header");
        assert_eq!(
            image_extension(b"RIFF\0\0\0\0WAVE"),
            None,
            "a RIFF container that is not a WebP"
        );
    }

    #[test]
    fn writing_a_thumbnail_lands_it_in_the_mods_own_folder() {
        let dir = temp_dir("write");
        let name = write_thumbnail(&dir, &png()).unwrap();

        assert_eq!(name, "ether-thumbnail.png");
        assert!(dir.join(&name).is_file());

        fs::remove_dir_all(&dir).unwrap();
    }

    /// Setting a new picture must replace the old one rather than leave both, including when the
    /// two are different formats — otherwise a mod folder collects an image per attempt.
    #[test]
    fn setting_a_second_thumbnail_replaces_the_first_rather_than_joining_it() {
        let dir = temp_dir("replace");
        write_thumbnail(&dir, &png()).unwrap();
        let second = write_thumbnail(&dir, &jpeg()).unwrap();

        assert_eq!(second, "ether-thumbnail.jpg");
        assert!(dir.join("ether-thumbnail.jpg").is_file());
        assert!(
            !dir.join("ether-thumbnail.png").exists(),
            "the previous one should be gone, not left unreferenced"
        );

        fs::remove_dir_all(&dir).unwrap();
    }

    /// The author's own preview is theirs. Clearing ours must not reach for anything else.
    #[test]
    fn clearing_removes_only_the_picture_this_app_wrote() {
        let dir = temp_dir("clear");
        fs::write(dir.join("preview.png"), png()).unwrap();
        write_thumbnail(&dir, &png()).unwrap();

        clear_thumbnail(&dir);

        assert!(!dir.join("ether-thumbnail.png").exists());
        assert!(
            dir.join("preview.png").is_file(),
            "a preview that shipped with the mod is not ours to delete"
        );

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn an_oversized_image_is_refused_with_something_readable() {
        let dir = temp_dir("oversized");
        let mut huge = png();
        huge.resize(MAX_THUMBNAIL_BYTES + 1, 0);

        let error = write_thumbnail(&dir, &huge).unwrap_err();

        assert!(error.contains("MB"), "unexpected message: {error}");
        assert!(!dir.join("ether-thumbnail.png").exists());

        fs::remove_dir_all(&dir).unwrap();
    }
}
