use rusqlite::{params, OptionalExtension};

use super::Db;
use crate::content_rating::MatureVisibility;

/// Defined once, here — the generic `get_setting`/`set_setting` store means any key string
/// duplicated elsewhere would silently miss this one, exactly the bug this constant prevents.
const MATURE_CONTENT_VISIBILITY_KEY: &str = "mature_content_visibility";
const MAGNIFIER_ENABLED_KEY: &str = "magnifier_enabled";
const MAGNIFIER_SIZE_KEY: &str = "magnifier_size";
const CONFLICT_WARNINGS_KEY: &str = "conflict_warnings";
const THEME_KEY: &str = "theme";

/// Which of the two looks the app wears.
///
/// The names are the design's own rather than `Light`/`Dark`: the two are one wall seen at two
/// times of day, and calling them light and dark invites someone to treat them as a generic pair
/// and start tuning one without the other.
///
/// Three variants rather than a bool because "follow Windows" is a real preference rather than
/// the absence of one — someone who switches their desktop at sunset wants the app to come with
/// them, and that cannot be expressed by storing either fixed value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Theme {
    Daylight,
    Night,
    System,
}

impl Theme {
    /// Follow Windows. A modding tool sits alongside a game and a browser rather than being
    /// looked at on its own, so matching whatever else is on screen is a better opening guess
    /// than either look chosen on merit — and anyone who disagrees is one click from saying so.
    pub const DEFAULT: Theme = Theme::System;

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Theme::Daylight => "Daylight",
            Theme::Night => "Night",
            Theme::System => "System",
        }
    }

    pub(crate) fn from_str(value: &str) -> Option<Self> {
        match value {
            "Daylight" => Some(Theme::Daylight),
            "Night" => Some(Theme::Night),
            "System" => Some(Theme::System),
            _ => None,
        }
    }
}

/// How the preview magnifier behaves, if at all.
///
/// One struct rather than two settings read separately, because nothing ever wants one without
/// the other — the size is meaningless while it is off, and turning it on with no size is not a
/// state the UI can render.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct MagnifierSettings {
    pub enabled: bool,
    /// Side of the square lens in CSS pixels, clamped to [`MAGNIFIER_MIN_SIZE`,
    /// `MAGNIFIER_MAX_SIZE`] on the way in so a hand-edited database cannot produce a lens
    /// bigger than the frame it magnifies.
    pub size: u32,
}

/// The range the slider offers, mirrored from `src/lib/magnifier.ts`. Duplicated deliberately:
/// the UI owns what is worth offering, and this end owns not trusting it — a size arriving from
/// a hand-edited database or a future build still has to land somewhere renderable. Below the
/// floor the lens shows too little to be worth the occlusion; the ceiling is the size the lens
/// shipped at, which was judged a little large in use and so makes a better maximum than a
/// default.
const MAGNIFIER_MIN_SIZE: u32 = 72;
const MAGNIFIER_MAX_SIZE: u32 = 168;
/// Comfortably under the ceiling: enough to read a face, small enough to still feel like a lens
/// over the picture rather than a second picture.
const MAGNIFIER_DEFAULT_SIZE: u32 = 120;

impl MagnifierSettings {
    pub const DEFAULT: Self = Self {
        enabled: true,
        size: MAGNIFIER_DEFAULT_SIZE,
    };
}

impl Db {
    pub fn get_setting(&self, key: &str) -> rusqlite::Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    /// No stored row (fresh install, or any existing Milestone 1-3 database — this key didn't
    /// exist before this milestone and there is no schema-migration mechanism to backfill it)
    /// defaults to `MatureVisibility::DEFAULT` at read time, applied identically either way.
    /// A stored value that fails to parse errors rather than silently defaulting — unlike a
    /// third-party API's field, this value is entirely our own, so an unparseable value means
    /// real corruption, not expected drift.
    pub fn get_mature_content_visibility(&self) -> rusqlite::Result<MatureVisibility> {
        match self.get_setting(MATURE_CONTENT_VISIBILITY_KEY)? {
            None => Ok(MatureVisibility::DEFAULT),
            Some(value) => MatureVisibility::from_str(&value).ok_or_else(|| {
                rusqlite::Error::InvalidColumnType(
                    0,
                    MATURE_CONTENT_VISIBILITY_KEY.to_string(),
                    rusqlite::types::Type::Text,
                )
            }),
        }
    }

    pub fn set_mature_content_visibility(&self, value: MatureVisibility) -> rusqlite::Result<()> {
        self.set_setting(MATURE_CONTENT_VISIBILITY_KEY, value.as_str())
    }

    /// Whether to point out that a character has more than one mod switched on.
    ///
    /// On by default, and on is the right default: the warning describes something ZZMI really
    /// does, and someone who has not hit a model conflict yet has no way to know it is coming.
    /// It is a preference rather than a fact about the library, though — stacking mods that
    /// touch different parts of a character is a legitimate thing to do on purpose, and for
    /// anyone doing it deliberately the mark sits on half the roster saying nothing they do not
    /// already know.
    ///
    /// An unparseable stored value errors rather than defaulting, the same reasoning as
    /// `get_mature_content_visibility`: this string is entirely our own, so garbage in it means
    /// real corruption rather than the drift you would expect from someone else's API. The
    /// argument is stronger here — quietly reading a damaged value as `false` would turn a
    /// safety notice off without anyone asking for that.
    pub fn get_conflict_warnings_enabled(&self) -> rusqlite::Result<bool> {
        match self.get_setting(CONFLICT_WARNINGS_KEY)? {
            None => Ok(true),
            Some(value) => value.parse::<bool>().map_err(|_| {
                rusqlite::Error::InvalidColumnType(
                    0,
                    CONFLICT_WARNINGS_KEY.to_string(),
                    rusqlite::types::Type::Text,
                )
            }),
        }
    }

    pub fn set_conflict_warnings_enabled(&self, value: bool) -> rusqlite::Result<()> {
        self.set_setting(CONFLICT_WARNINGS_KEY, &value.to_string())
    }

    /// The stored theme preference, or `Theme::DEFAULT` on a database that predates this key.
    ///
    /// This is the source of truth, but deliberately not the *fast* path: reaching it costs an
    /// IPC round trip, and a theme that is only known after one round trip is a theme the window
    /// paints wrong first. The frontend therefore mirrors this value into `localStorage` and
    /// reads that synchronously before React mounts — see `src/lib/theme.ts`. This row is what
    /// that cache is rebuilt from, so a cleared cache costs one frame, not the preference.
    ///
    /// An unparseable value errors rather than defaulting, matching the two settings above: the
    /// string is entirely our own, so garbage in it means real corruption rather than the drift
    /// you would expect from somebody else's API.
    pub fn get_theme(&self) -> rusqlite::Result<Theme> {
        match self.get_setting(THEME_KEY)? {
            None => Ok(Theme::DEFAULT),
            Some(value) => Theme::from_str(&value).ok_or_else(|| {
                rusqlite::Error::InvalidColumnType(
                    0,
                    THEME_KEY.to_string(),
                    rusqlite::types::Type::Text,
                )
            }),
        }
    }

    pub fn set_theme(&self, value: Theme) -> rusqlite::Result<()> {
        self.set_setting(THEME_KEY, value.as_str())
    }

    /// Both halves fall back independently: a database written by an older build has neither
    /// key, and a half-written one should still produce a usable lens rather than an error.
    pub fn get_magnifier_settings(&self) -> rusqlite::Result<MagnifierSettings> {
        let enabled = match self.get_setting(MAGNIFIER_ENABLED_KEY)? {
            Some(value) => value == "true",
            None => MagnifierSettings::DEFAULT.enabled,
        };
        let size = self
            .get_setting(MAGNIFIER_SIZE_KEY)?
            .and_then(|value| value.parse::<u32>().ok())
            .unwrap_or(MAGNIFIER_DEFAULT_SIZE)
            .clamp(MAGNIFIER_MIN_SIZE, MAGNIFIER_MAX_SIZE);
        Ok(MagnifierSettings { enabled, size })
    }

    pub fn set_magnifier_settings(&self, value: MagnifierSettings) -> rusqlite::Result<()> {
        self.set_setting(MAGNIFIER_ENABLED_KEY, if value.enabled { "true" } else { "false" })?;
        self.set_setting(
            MAGNIFIER_SIZE_KEY,
            &value
                .size
                .clamp(MAGNIFIER_MIN_SIZE, MAGNIFIER_MAX_SIZE)
                .to_string(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_and_get_round_trip() {
        let db = Db::open_in_memory().unwrap();
        db.set_setting("mods_folder", "D:/Games/ZZZ/Mods").unwrap();

        let value = db.get_setting("mods_folder").unwrap();
        assert_eq!(value, Some("D:/Games/ZZZ/Mods".to_string()));
    }

    /// The default matters more than the round trip: every database written before this key
    /// existed has no row for it, and those users must keep the warning rather than silently
    /// lose it.
    #[test]
    fn conflict_warnings_default_to_on_when_never_set() {
        let db = Db::open_in_memory().unwrap();
        assert!(db.get_conflict_warnings_enabled().unwrap());
    }

    #[test]
    fn conflict_warnings_round_trip_both_ways() {
        let db = Db::open_in_memory().unwrap();

        db.set_conflict_warnings_enabled(false).unwrap();
        assert!(!db.get_conflict_warnings_enabled().unwrap());

        db.set_conflict_warnings_enabled(true).unwrap();
        assert!(db.get_conflict_warnings_enabled().unwrap());
    }

    /// Refuses rather than reading as `false`. Turning a safety notice off is a decision, and a
    /// corrupted row is not somebody making it.
    #[test]
    fn a_damaged_conflict_warnings_value_errors_rather_than_switching_it_off() {
        let db = Db::open_in_memory().unwrap();
        db.set_setting("conflict_warnings", "yes").unwrap();

        assert!(db.get_conflict_warnings_enabled().is_err());
    }

    #[test]
    fn get_missing_key_returns_none() {
        let db = Db::open_in_memory().unwrap();
        assert!(db.get_setting("nonexistent").unwrap().is_none());
    }

    #[test]
    fn set_setting_overwrites_existing_value() {
        let db = Db::open_in_memory().unwrap();
        db.set_setting("mods_folder", "C:/old/path").unwrap();
        db.set_setting("mods_folder", "D:/new/path").unwrap();

        let value = db.get_setting("mods_folder").unwrap();
        assert_eq!(value, Some("D:/new/path".to_string()));
    }

    #[test]
    fn mature_content_visibility_defaults_to_blur_with_no_row_written() {
        let db = Db::open_in_memory().unwrap();

        let value = db.get_mature_content_visibility().unwrap();

        assert_eq!(value, MatureVisibility::Blur);
        assert!(
            db.get_setting(MATURE_CONTENT_VISIBILITY_KEY)
                .unwrap()
                .is_none(),
            "reading the default must not write a row — a fresh and an existing pre-Milestone-4 \
             database must behave identically with no migration"
        );
    }

    #[test]
    fn mature_content_visibility_round_trips_every_value() {
        let db = Db::open_in_memory().unwrap();
        for value in [
            MatureVisibility::Show,
            MatureVisibility::Blur,
            MatureVisibility::Hide,
        ] {
            db.set_mature_content_visibility(value).unwrap();
            assert_eq!(db.get_mature_content_visibility().unwrap(), value);
        }
    }

    #[test]
    fn mature_content_visibility_set_overwrites_rather_than_duplicating() {
        let db = Db::open_in_memory().unwrap();
        db.set_mature_content_visibility(MatureVisibility::Show)
            .unwrap();
        db.set_mature_content_visibility(MatureVisibility::Hide)
            .unwrap();

        assert_eq!(
            db.get_mature_content_visibility().unwrap(),
            MatureVisibility::Hide
        );
    }

    #[test]
    fn magnifier_settings_default_when_nothing_has_been_chosen() {
        let db = Db::open_in_memory().unwrap();
        assert_eq!(db.get_magnifier_settings().unwrap(), MagnifierSettings::DEFAULT);
    }

    #[test]
    fn magnifier_settings_round_trip() {
        let db = Db::open_in_memory().unwrap();
        let chosen = MagnifierSettings { enabled: false, size: 96 };
        db.set_magnifier_settings(chosen).unwrap();
        assert_eq!(db.get_magnifier_settings().unwrap(), chosen);
    }

    /// The slider cannot produce these, but a hand-edited database or an older build can, and a
    /// lens larger than the frame it magnifies is not a state worth rendering. Unlike the mature
    /// setting this does not error: there is a sane nearest answer, and refusing to load the
    /// page over a cosmetic preference would be the worse failure.
    #[test]
    fn magnifier_size_is_clamped_both_ways_rather_than_trusted() {
        let db = Db::open_in_memory().unwrap();

        db.set_setting(MAGNIFIER_SIZE_KEY, "9999").unwrap();
        assert_eq!(db.get_magnifier_settings().unwrap().size, MAGNIFIER_MAX_SIZE);

        db.set_setting(MAGNIFIER_SIZE_KEY, "1").unwrap();
        assert_eq!(db.get_magnifier_settings().unwrap().size, MAGNIFIER_MIN_SIZE);

        // Not a number at all falls back rather than exploding.
        db.set_setting(MAGNIFIER_SIZE_KEY, "huge").unwrap();
        assert_eq!(db.get_magnifier_settings().unwrap().size, MAGNIFIER_DEFAULT_SIZE);
    }

    #[test]
    fn mature_content_visibility_errors_on_a_corrupted_stored_value_instead_of_silently_defaulting()
    {
        let db = Db::open_in_memory().unwrap();
        db.set_setting(MATURE_CONTENT_VISIBILITY_KEY, "NotAVisibility")
            .unwrap();

        assert!(
            db.get_mature_content_visibility().is_err(),
            "a corrupted stored value must error, not silently fall back to the default"
        );
    }
}
