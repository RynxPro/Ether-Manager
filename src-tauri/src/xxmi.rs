//! Finding the folder ZZMI loads mods from, without asking.
//!
//! First-run setup used to open a folder picker and leave you to it. The answer is buried under
//! `%APPDATA%\XXMI Launcher\ZZMI\Mods` — three levels into a hidden directory most people have
//! never opened — and getting it wrong is quiet: the app files mods somewhere the game never
//! reads, and everything looks right until nothing shows up in-game.
//!
//! XXMI already knows the answer and writes it down, so this reads its record rather than
//! guessing. `XXMI Launcher Config.json` sits at the launcher's own root and holds
//! `Importers.ZZMI.Importer.importer_folder`, which XXMI itself resolves as:
//!
//! ```text
//! importer_path = Path(importer_folder)
//! if importer_path.is_absolute(): return importer_path
//! else:                           return Paths.App.Root / importer_path
//! ```
//!
//! `Paths.App.Root` is the folder the config lives in, so the same rule reproduces here exactly.

use std::path::{Path, PathBuf};

/// Where the installer puts the launcher, and so where its config is looked for.
const DEFAULT_LAUNCHER_DIR: &str = "XXMI Launcher";
const CONFIG_FILE_NAME: &str = "XXMI Launcher Config.json";

/// Whether this really is a ZZMI mods folder rather than a folder that happens to be called Mods.
///
/// The sibling `d3dx.ini` settles it: that file *is* the 3DMigoto install, and a Mods folder with
/// none beside it is not somewhere the game will ever read from. Offering a wrong folder is worse
/// than offering nothing, because it looks answered.
pub fn is_zzmi_mods_folder(mods_dir: &Path) -> bool {
    mods_dir.is_dir()
        && mods_dir
            .parent()
            .is_some_and(|importer| importer.join("d3dx.ini").is_file())
}

/// The mods folder a launcher config points at, by XXMI's own resolution rule.
///
/// Pure, so the rule can be tested without an XXMI install: `config_dir` stands in for
/// `Paths.App.Root`, which is the directory the config file was read from.
pub fn mods_folder_from_config(config_json: &str, config_dir: &Path) -> Option<PathBuf> {
    let parsed: serde_json::Value = serde_json::from_str(config_json).ok()?;
    let importer_folder = parsed
        .get("Importers")?
        .get("ZZMI")?
        .get("Importer")?
        .get("importer_folder")?
        .as_str()?;
    if importer_folder.is_empty() {
        return None;
    }

    let importer_path = Path::new(importer_folder);
    let importer_path = if importer_path.is_absolute() {
        importer_path.to_path_buf()
    } else {
        config_dir.join(importer_path)
    };
    Some(importer_path.join("Mods"))
}

/// The ZZMI mods folder on this machine, or `None` when nothing convincing is found.
///
/// Only ever returns somewhere that passes [`is_zzmi_mods_folder`], so a caller can offer the
/// result without qualifying it. Two places are tried and no more: the launcher's config, and the
/// default install path for a portable copy that has never written one. Anything beyond that means
/// searching the disk, which is slow — and a wrong answer found by searching is worse than the
/// folder picker the user already has.
pub fn detect_zzmi_mods_folder() -> Option<PathBuf> {
    let launcher_dir = std::env::var_os("APPDATA")
        .map(PathBuf::from)?
        .join(DEFAULT_LAUNCHER_DIR);

    let from_config = std::fs::read_to_string(launcher_dir.join(CONFIG_FILE_NAME))
        .ok()
        .and_then(|json| mods_folder_from_config(&json, &launcher_dir));

    from_config
        .into_iter()
        .chain(std::iter::once(launcher_dir.join("ZZMI").join("Mods")))
        .find(|candidate| is_zzmi_mods_folder(candidate))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_dir(label: &str) -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("ether-manager-xxmi-{label}-{n}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Shaped like the real file, trimmed to the part that matters.
    fn config_with(importer_folder: &str) -> String {
        format!(
            r#"{{"Launcher":{{"active_importer":"ZZMI"}},
                "Importers":{{"WWMI":{{"Importer":{{"importer_folder":"WWMI/"}}}},
                              "ZZMI":{{"Importer":{{"importer_folder":"{importer_folder}",
                                                    "game_folder":"D:\\Games\\ZenlessZoneZero Game"}}}}}}}}"#
        )
    }

    #[test]
    fn a_relative_importer_folder_resolves_against_the_launchers_own_directory() {
        let launcher = Path::new("C:/Users/someone/AppData/Roaming/XXMI Launcher");
        let found = mods_folder_from_config(&config_with("ZZMI/"), launcher).unwrap();
        assert_eq!(found, launcher.join("ZZMI").join("Mods"));
    }

    /// XXMI lets the folder be overridden with a full path, and then the launcher's own location
    /// says nothing about where mods live.
    #[test]
    fn an_absolute_importer_folder_is_taken_as_it_stands() {
        let found = mods_folder_from_config(
            &config_with("D:\\\\Modding\\\\ZZMI"),
            Path::new("C:/ignored"),
        )
        .unwrap();
        assert_eq!(found, Path::new("D:\\Modding\\ZZMI").join("Mods"));
    }

    #[test]
    fn a_config_with_nothing_useful_in_it_is_no_answer_rather_than_a_wrong_one() {
        let dir = Path::new("C:/anywhere");
        assert!(mods_folder_from_config("not json at all", dir).is_none());
        assert!(mods_folder_from_config("{}", dir).is_none());
        assert!(
            mods_folder_from_config(r#"{"Importers":{"WWMI":{"Importer":{}}}}"#, dir).is_none(),
            "a launcher with no ZZMI configured has no ZZMI mods folder"
        );
        assert!(
            mods_folder_from_config(&config_with(""), dir).is_none(),
            "an empty folder would resolve to the launcher root itself"
        );
    }

    #[test]
    fn a_mods_folder_is_only_believed_when_a_d3dx_ini_sits_beside_it() {
        let importer = temp_dir("verify");
        let mods = importer.join("Mods");
        fs::create_dir_all(&mods).unwrap();

        assert!(
            !is_zzmi_mods_folder(&mods),
            "a Mods folder with no 3DMigoto beside it is not somewhere the game reads"
        );

        fs::write(importer.join("d3dx.ini"), b"[Include]\n").unwrap();
        assert!(is_zzmi_mods_folder(&mods));

        assert!(
            !is_zzmi_mods_folder(&importer.join("Nope")),
            "a folder that is not there cannot be it either"
        );

        fs::remove_dir_all(&importer).unwrap();
    }
}
