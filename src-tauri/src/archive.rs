use std::fmt;
use std::fs;
use std::path::Path;

#[derive(Debug)]
pub enum ArchiveError {
    UnsupportedFormat(String),
    Io(std::io::Error),
    Zip(zip::result::ZipError),
    SevenZ(String),
    Rar(String),
}

impl fmt::Display for ArchiveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ArchiveError::UnsupportedFormat(ext) => write!(f, "unsupported archive format: {ext}"),
            ArchiveError::Io(e) => write!(f, "filesystem error: {e}"),
            ArchiveError::Zip(e) => write!(f, "zip error: {e}"),
            ArchiveError::SevenZ(e) => write!(f, "7z error: {e}"),
            ArchiveError::Rar(e) => write!(f, "rar error: {e}"),
        }
    }
}

impl std::error::Error for ArchiveError {}

impl From<std::io::Error> for ArchiveError {
    fn from(e: std::io::Error) -> Self {
        ArchiveError::Io(e)
    }
}

impl From<zip::result::ZipError> for ArchiveError {
    fn from(e: zip::result::ZipError) -> Self {
        ArchiveError::Zip(e)
    }
}

/// Extracts an archive (`.zip`, `.7z`, or `.rar`, detected by file extension) into `dest_dir`.
/// `dest_dir` is created if it doesn't already exist.
/// Unpacks an archive into `dest_dir`, creating it if it is not already there.
///
/// A failure leaves nothing behind. `dest_dir` has to exist before unpacking can start, so
/// without this an archive that turned out to be truncated — the usual cause being a download
/// from a struggling GameBanana — left an empty folder where the mod should have been. Nothing
/// removed it, because the library row is only written once the install has fully succeeded: the
/// folder had no entry in the app, so it could not be seen or deleted from inside it, and worse
/// it held the name, so the retry that finally worked was filed as `<name>_1` instead.
///
/// Only a directory this call created is cleaned up. One that was already there belongs to
/// whoever made it, and unpacking into an existing folder must never be able to empty it.
pub fn extract_archive(archive_path: &Path, dest_dir: &Path) -> Result<(), ArchiveError> {
    let dest_existed = dest_dir.exists();
    fs::create_dir_all(dest_dir)?;

    let ext = archive_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let result = match ext.as_str() {
        "zip" => extract_zip(archive_path, dest_dir),
        "7z" => extract_seven_zip(archive_path, dest_dir),
        "rar" => extract_rar(archive_path, dest_dir),
        other => Err(ArchiveError::UnsupportedFormat(other.to_string())),
    };

    if result.is_err() && !dest_existed {
        let _ = fs::remove_dir_all(dest_dir);
    }
    result
}

fn extract_zip(archive_path: &Path, dest_dir: &Path) -> Result<(), ArchiveError> {
    let file = fs::File::open(archive_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    archive.extract(dest_dir)?;
    Ok(())
}

fn extract_seven_zip(archive_path: &Path, dest_dir: &Path) -> Result<(), ArchiveError> {
    sevenz_rust2::decompress_file(archive_path, dest_dir)
        .map_err(|e| ArchiveError::SevenZ(e.to_string()))
}

fn extract_rar(archive_path: &Path, dest_dir: &Path) -> Result<(), ArchiveError> {
    let archive = unrar::Archive::new(archive_path)
        .open_for_processing()
        .map_err(|e| ArchiveError::Rar(e.to_string()))?;

    let mut current = archive;
    loop {
        let Some(header) = current
            .read_header()
            .map_err(|e| ArchiveError::Rar(e.to_string()))?
        else {
            break;
        };

        current = if header.entry().is_file() {
            header
                .extract_with_base(dest_dir)
                .map_err(|e| ArchiveError::Rar(e.to_string()))?
        } else {
            header
                .skip()
                .map_err(|e| ArchiveError::Rar(e.to_string()))?
        };
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    /// A download that stopped early. This is what a struggling GameBanana actually hands back,
    /// and unpacking it fails after the destination folder has already been made.
    fn write_truncated_zip(path: &Path) {
        fs::write(path, b"PK\x03\x04 this stopped halfway through").unwrap();
    }

    /// The install that made this test: a flaky download failed, left an empty folder holding the
    /// mod's name, and the retry that worked was filed as `<name>_1` beside it. The folder had no
    /// library row, so it could not be removed from inside the app either.
    #[test]
    fn a_failed_extraction_leaves_no_empty_folder_behind() {
        let work = temp_dir("failed-extract");
        let archive = work.join("truncated.zip");
        write_truncated_zip(&archive);
        let dest = work.join("DISABLED_somemod");

        assert!(extract_archive(&archive, &dest).is_err());
        assert!(
            !dest.exists(),
            "a folder made only for this install must not outlive it"
        );

        fs::remove_dir_all(&work).unwrap();
    }

    /// The other half of the rule: cleaning up must only ever reclaim what this call created.
    /// Emptying a folder that was already populated would destroy an installed mod.
    #[test]
    fn a_failed_extraction_leaves_an_existing_folder_and_its_contents_alone() {
        let work = temp_dir("failed-extract-existing");
        let archive = work.join("truncated.zip");
        write_truncated_zip(&archive);
        let dest = work.join("already_here");
        fs::create_dir_all(&dest).unwrap();
        fs::write(dest.join("Nicole.ini"), b"[Mod]\n").unwrap();

        assert!(extract_archive(&archive, &dest).is_err());
        assert!(dest.is_dir(), "a folder we did not create is not ours to bin");
        assert!(
            dest.join("Nicole.ini").is_file(),
            "and neither is anything already inside it"
        );

        fs::remove_dir_all(&work).unwrap();
    }

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_dir(label: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ether-manager-archive-test-{label}-{n}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn extracts_zip_contents_correctly() {
        let work_dir = temp_dir("zip");
        let archive_path = work_dir.join("sample.zip");

        // Build a small zip fixture directly with the zip crate's writer, so this test
        // is fully self-contained (no external tool or checked-in binary fixture needed).
        let zip_file = fs::File::create(&archive_path).unwrap();
        let mut writer = zip::ZipWriter::new(zip_file);
        let options: zip::write::FileOptions<()> = zip::write::FileOptions::default();
        writer.start_file("mod.ini", options).unwrap();
        writer.write_all(b"[Mod]\nname=pinkdress\n").unwrap();
        writer.start_file("textures/skin.dds", options).unwrap();
        writer.write_all(b"fake texture bytes").unwrap();
        writer.finish().unwrap();

        let dest_dir = work_dir.join("extracted");
        extract_archive(&archive_path, &dest_dir).unwrap();

        let ini_contents = fs::read_to_string(dest_dir.join("mod.ini")).unwrap();
        assert_eq!(ini_contents, "[Mod]\nname=pinkdress\n");
        let texture_contents = fs::read(dest_dir.join("textures/skin.dds")).unwrap();
        assert_eq!(texture_contents, b"fake texture bytes");

        fs::remove_dir_all(&work_dir).unwrap();
    }

    /// Security check: a malicious archive could name an entry `../../../evil.txt` to try to
    /// escape `dest_dir` and write files elsewhere on disk ("zip-slip"). Since this app
    /// extracts files downloaded from the internet, this must never succeed.
    #[test]
    fn zip_extraction_cannot_escape_destination_directory() {
        let work_dir = temp_dir("zip-slip");
        let archive_path = work_dir.join("malicious.zip");

        let zip_file = fs::File::create(&archive_path).unwrap();
        let mut writer = zip::ZipWriter::new(zip_file);
        let options: zip::write::FileOptions<()> = zip::write::FileOptions::default();
        let attack_result = writer.start_file("../../../escape.txt", options);
        if let Ok(()) = attack_result {
            writer
                .write_all(b"if you can read this outside dest_dir, it's a real vulnerability")
                .unwrap();
        }
        writer.finish().unwrap();

        let dest_dir = work_dir.join("extracted");
        let escape_target = work_dir.join("escape.txt");

        // Whether the crate rejects the malicious entry at write-time, at extract-time, or
        // silently confines it inside dest_dir, the one thing that must never happen is the
        // file landing outside dest_dir.
        let _ = extract_archive(&archive_path, &dest_dir);
        assert!(
            !escape_target.exists(),
            "zip-slip succeeded: a file escaped the destination directory"
        );

        fs::remove_dir_all(&work_dir).unwrap();
    }

    #[test]
    fn extracts_seven_zip_contents_correctly() {
        let work_dir = temp_dir("7z");
        let source_dir = work_dir.join("source");
        fs::create_dir_all(&source_dir).unwrap();
        fs::write(source_dir.join("mod.ini"), b"[Mod]\nname=pinkdress\n").unwrap();

        let archive_path = work_dir.join("sample.7z");
        sevenz_rust2::compress_to_path(&source_dir, &archive_path).unwrap();

        let dest_dir = work_dir.join("extracted");
        extract_archive(&archive_path, &dest_dir).unwrap();

        let ini_contents = fs::read_to_string(dest_dir.join("mod.ini")).unwrap();
        assert_eq!(ini_contents, "[Mod]\nname=pinkdress\n");

        fs::remove_dir_all(&work_dir).unwrap();
    }

    #[test]
    fn unsupported_extension_returns_error() {
        let work_dir = temp_dir("unsupported");
        let archive_path = work_dir.join("sample.tar.gz");
        fs::write(&archive_path, b"not a real archive").unwrap();

        let dest_dir = work_dir.join("extracted");
        let result = extract_archive(&archive_path, &dest_dir);

        assert!(matches!(result, Err(ArchiveError::UnsupportedFormat(_))));

        fs::remove_dir_all(&work_dir).unwrap();
    }

    /// Diagnostic repro for a user-reported hang: installing a real GameBanana `.rar` mod
    /// left the UI stuck on "Installing…" forever, though files did land on disk. RAR
    /// extraction was never covered by a real-world fixture before (only zip/7z were).
    /// Wrapped in a timeout so a real hang fails fast here instead of blocking the test run.
    #[tokio::test]
    async fn extracts_a_real_downloaded_rar_file_without_hanging() {
        let work_dir = temp_dir("real-rar");
        let archive_path = work_dir.join("whitemonster.rar");

        let bytes = reqwest::get("https://gamebanana.com/dl/1761700")
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();
        fs::write(&archive_path, &bytes).unwrap();

        let dest_dir = work_dir.join("extracted");
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            tokio::task::spawn_blocking(move || extract_archive(&archive_path, &dest_dir)),
        )
        .await;

        match result {
            Err(_) => panic!("extract_archive hung past the 30s timeout on a real .rar file"),
            Ok(join_result) => {
                let extract_result = join_result.unwrap();
                extract_result.unwrap();
            }
        }

        fs::remove_dir_all(&work_dir).unwrap();
    }
}
