//! Updating the app itself, on a channel the user picks.
//!
//! The plugin's own `check()` cannot do this: endpoints are read from `tauri.conf.json` and the
//! plugin builder has no way to set them, so the JavaScript API is permanently pointed at one
//! URL. `updater_builder()` can be given endpoints per check, which is why the flow lives here
//! rather than in the frontend. The plugin is still registered and still essential — the pubkey
//! it carries is what verifies every download, whichever channel it came from.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::UpdaterExt;

use crate::AppState;

/// Which releases this install is willing to be offered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum UpdateChannel {
    /// Published releases. What everyone gets, and the default.
    Stable,
    /// The rolling prerelease, replaced by every nightly build.
    Nightly,
}

impl UpdateChannel {
    fn as_str(self) -> &'static str {
        match self {
            UpdateChannel::Stable => "Stable",
            UpdateChannel::Nightly => "Nightly",
        }
    }

    /// Anything unrecognised reads as Stable. A stored value this does not know is more likely a
    /// downgrade from a future build than corruption, and the safe reading of "I do not know
    /// which channel you wanted" is the one that cannot hand somebody an untested build.
    fn from_stored(value: &str) -> Self {
        match value {
            "Nightly" => UpdateChannel::Nightly,
            _ => UpdateChannel::Stable,
        }
    }

    /// Where this channel's manifest lives.
    ///
    /// Stable uses `releases/latest`, which GitHub resolves to the newest published release and
    /// deliberately never to a prerelease. Nightly cannot use that, for exactly that reason, so
    /// it reads a release pinned to the fixed tag `nightly` which each nightly build replaces —
    /// the fixed tag is what gives it an address that does not move.
    fn endpoint(self) -> &'static str {
        match self {
            UpdateChannel::Stable => {
                "https://github.com/RynxPro/Ether-Manager/releases/latest/download/latest.json"
            }
            UpdateChannel::Nightly => {
                "https://github.com/RynxPro/Ether-Manager/releases/download/nightly/latest.json"
            }
        }
    }
}

const CHANNEL_SETTING: &str = "update_channel";

/// What the channel is offering, for the card in Settings to describe.
#[derive(Debug, Clone, Serialize)]
pub struct AppUpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

/// Progress of the download, for the bar. Mirrors the mod installer's shape so the same
/// component can draw it.
#[derive(Clone, Serialize)]
struct AppUpdateProgress {
    downloaded: u64,
    total: Option<u64>,
}

#[tauri::command]
pub fn get_update_channel(state: State<AppState>) -> Result<UpdateChannel, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let stored = db.get_setting(CHANNEL_SETTING).map_err(|e| e.to_string())?;
    Ok(stored
        .as_deref()
        .map(UpdateChannel::from_stored)
        .unwrap_or(UpdateChannel::Stable))
}

#[tauri::command]
pub fn set_update_channel(state: State<AppState>, channel: UpdateChannel) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_setting(CHANNEL_SETTING, channel.as_str())
        .map_err(|e| e.to_string())
}

/// Builds an updater aimed at one channel.
///
/// `version_comparator` is what makes the switch work in both directions. The default rule is
/// "offer it only if it is newer", which strands anyone trying to go back: an install sitting on
/// a nightly 0.3.0 would be told that stable 0.2.0 is not an update, and nothing would ever move
/// it again. Here a version that merely *differs* counts, so leaving the nightly channel offers
/// the stable build as something to install. That is a deliberate licence to go backwards, and
/// it is confined to this app's own updater.
fn updater_for(
    app: &AppHandle,
    channel: UpdateChannel,
) -> Result<tauri_plugin_updater::Updater, String> {
    let endpoint = channel
        .endpoint()
        .parse()
        .map_err(|e| format!("the {} update address is not a URL: {e}", channel.as_str()))?;
    app.updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|e| e.to_string())?
        .version_comparator(|current, remote| remote.version != current)
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_app_update(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<AppUpdateInfo>, String> {
    let channel = get_update_channel(state)?;
    let found = updater_for(&app, channel)?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    Ok(found.map(|update| AppUpdateInfo {
        version: update.version,
        notes: update.body,
    }))
}

/// Downloads and installs whatever the channel is currently offering.
///
/// Checks again rather than holding on to the `Update` from the last call. That costs one small
/// request and buys away a whole class of problem: no handle to keep alive between commands, no
/// question of what happens if the channel is switched between looking and installing, and no
/// way to install something the user was never shown.
///
/// On Windows this does not return: the installer takes over, closes the app and reopens it.
#[tauri::command]
pub async fn install_app_update(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let channel = get_update_channel(state)?;
    let update = updater_for(&app, channel)?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "there is nothing to install on this channel any more".to_string())?;

    let progress_app = app.clone();
    let mut downloaded: u64 = 0;
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = progress_app.emit(
                    "app-update-progress",
                    AppUpdateProgress { downloaded, total },
                );
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unknown_stored_channel_reads_as_stable() {
        // What a future build might write, or a corrupted value. Either way the answer that
        // cannot hand somebody an untested build is the right one.
        assert_eq!(
            UpdateChannel::from_stored("Experimental"),
            UpdateChannel::Stable
        );
        assert_eq!(UpdateChannel::from_stored(""), UpdateChannel::Stable);
    }

    #[test]
    fn a_stored_channel_survives_the_round_trip() {
        for channel in [UpdateChannel::Stable, UpdateChannel::Nightly] {
            assert_eq!(UpdateChannel::from_stored(channel.as_str()), channel);
        }
    }

    #[test]
    fn stable_never_points_at_the_rolling_tag() {
        // The whole safety of the arrangement: `releases/latest` is the one address GitHub
        // refuses to resolve to a prerelease.
        assert!(UpdateChannel::Stable.endpoint().contains("releases/latest/"));
        assert!(UpdateChannel::Nightly.endpoint().contains("/nightly/"));
        assert_ne!(
            UpdateChannel::Stable.endpoint(),
            UpdateChannel::Nightly.endpoint()
        );
    }
}
