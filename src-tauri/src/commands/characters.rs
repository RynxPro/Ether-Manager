use tauri::State;

use crate::characters::{self, Character};
use crate::AppState;

/// Characters discovered on GameBanana since the bundled roster was written, kept as JSON in
/// the settings table.
///
/// Stored rather than re-fetched on demand so the app knows about them offline and on the very
/// first paint, before any request could have finished. A plain settings row because that table
/// is already key/value text and this needs no schema of its own.
const DISCOVERED_SETTING: &str = "discovered_characters";

/// Real roster plus the two library-wide pseudo-categories ("UI"/"Misc") appended at the end —
/// every current frontend consumer (Library grid, Browse's character filter, the install flow's
/// character picker) wants the combined list, so this is the one command rather than keeping a
/// separate "real characters only" endpoint no one would call.
///
/// Answers from what is on disk, always, with no network anywhere near it: the bundled sixty
/// plus whatever a previous refresh found. `refresh_characters` is what goes and looks.
#[tauri::command]
pub fn list_characters(state: State<AppState>) -> Vec<Character> {
    let mut all = characters::all_characters().to_vec();
    all.extend(stored_discovered(&state));
    all.extend(characters::pseudo_categories());
    all
}

/// Asks GameBanana who the characters are now, and remembers anyone new.
///
/// Returns how many were added, which is nothing the UI has to show — it refetches the list
/// either way — but it makes the difference between "asked and found nothing" and "asked and
/// found three" visible in the log, which is where this will be looked at if it ever misbehaves.
///
/// A failure here is a failure to *discover*, not a failure to work: the bundled roster is
/// still there and still correct for everyone in it. So it is logged and returned as an error
/// for the caller to ignore, rather than something that interrupts anybody.
#[tauri::command]
pub async fn refresh_characters(state: State<'_, AppState>) -> Result<usize, String> {
    let listed = state
        .gamebanana
        .get_character_categories()
        .await
        .map_err(|e| e.to_string())?;

    let bundled = characters::all_characters();
    let discovered: Vec<Character> = characters::merge_discovered(bundled, &listed)
        .into_iter()
        .skip(bundled.len())
        .collect();

    let encoded = serde_json::to_string(&discovered).map_err(|e| e.to_string())?;
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.set_setting(DISCOVERED_SETTING, &encoded)
            .map_err(|e| e.to_string())?;
    }

    if !discovered.is_empty() {
        log::info!(
            "GameBanana lists {} character(s) the bundled roster does not: {}",
            discovered.len(),
            discovered
                .iter()
                .map(|c| c.name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        );
    }
    Ok(discovered.len())
}

/// What the last refresh found, or nothing at all.
///
/// Every failure reads as "none": an unreadable setting, a value written by a newer build, a
/// database that will not answer. The bundled roster is the floor, and falling back to it is
/// always safe — it is what the app shipped with.
fn stored_discovered(state: &State<AppState>) -> Vec<Character> {
    let Ok(db) = state.db.lock() else {
        return Vec::new();
    };
    let Ok(Some(raw)) = db.get_setting(DISCOVERED_SETTING) else {
        return Vec::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}
