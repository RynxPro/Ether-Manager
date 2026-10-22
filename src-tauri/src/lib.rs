mod archive;
mod characters;
mod commands;
mod conflicts;
mod content_rating;
mod creator_feed;
mod db;
mod fs_ops;
mod gamebanana;
mod import;
mod thumbnail;
mod updates;
mod variant_label;
mod xxmi;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU8};
use std::sync::{Arc, Mutex};

use tauri::Manager;

pub struct AppState {
    pub db: Mutex<db::Db>,
    pub gamebanana: gamebanana::GameBananaClient,
    /// Set while an `update_installed_mod` call is in flight, so `cancel_gamebanana_install` has
    /// something to flip. Only one update is expected at a time, since that flow is still a modal
    /// the user waits in front of. Installs no longer use this — see `download_stops`.
    pub install_cancel: Mutex<Option<Arc<AtomicBool>>>,
    /// One stop flag per running download, keyed by its row id. A single shared slot was fine
    /// while a modal owned the only install in flight; with a queue behind it, a second download
    /// starting would have made the first permanently uncancellable.
    ///
    /// It holds a `Stop` rather than a bool because pausing and cancelling stop the transfer the
    /// same way and differ only in what happens afterwards — whether the row rests as paused or
    /// cancelled, and whether the part-downloaded file is kept.
    pub download_stops: Mutex<HashMap<i64, Arc<AtomicU8>>>,
    /// Held for the duration of one download so they run one at a time. Async, not `std`,
    /// because it is held across awaits — and tokio's is FIFO, which is what makes the queue
    /// run in the order things were added.
    pub download_slot: tokio::sync::Mutex<()>,
    /// Imports that have been unpacked and inspected but not yet filed, keyed by session id.
    /// An entry owns a staging directory, so it lives until the import is committed or
    /// cancelled — the dialog holding the id is what keeps it reachable.
    pub import_sessions: Mutex<commands::import::ImportSessions>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Everything the app has to say about itself, written to a file next to the database.
        //
        // This replaces a dozen `eprintln!` calls, which in a release build go to a console that
        // does not exist — so until now a bug report arrived with nothing attached to it, and
        // anything that could not be reproduced on this machine could not be looked into at all.
        //
        // The stock defaults are not usable for that: 40 KB per file with one old file kept,
        // which a single session of downloads scrolls past, losing exactly the beginning anyone
        // would want to read. Five files of 5 MB is a few sessions of real history and still
        // nothing anybody will notice on disk.
        //
        // Local time rather than the default UTC, because the person reading this file is the
        // person the timestamps have to line up with: they are matching a line against "it froze
        // around four o'clock", not against a server.
        .plugin(
            tauri_plugin_log::Builder::new()
                // Debug while developing, Info in the shipped build. The noisy half of what the
                // app knows is worth having at a terminal and is only weight in a user's file.
                .level(if cfg!(debug_assertions) {
                    tauri_plugin_log::log::LevelFilter::Debug
                } else {
                    tauri_plugin_log::log::LevelFilter::Info
                })
                // Dependencies that are chatty at Debug and say nothing a reader of this file
                // wants. The updater is here for a second reason: at Debug it prints the whole
                // of `latest.json` on every launch, signature included, which is kilobytes of
                // one line between every pair of ours.
                .level_for("reqwest", tauri_plugin_log::log::LevelFilter::Info)
                .level_for("hyper", tauri_plugin_log::log::LevelFilter::Info)
                .level_for("hyper_util", tauri_plugin_log::log::LevelFilter::Info)
                .level_for("rustls", tauri_plugin_log::log::LevelFilter::Info)
                .level_for(
                    "tauri_plugin_updater",
                    tauri_plugin_log::log::LevelFilter::Info,
                )
                .max_file_size(5_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Remembers window size, position and maximized state between launches — the
        // `tauri.conf.json` width/height become first-run defaults rather than a reset on every
        // start. Desktop apps are expected to reopen where you left them.
        //
        // Everything except whether the window has a frame. The plugin defaults to `all()`,
        // which includes `DECORATIONS`, so it had been restoring `decorated: true` from a state
        // file written back when the window still had a native title bar — silently undoing
        // `"decorations": false` on every launch and leaving the app with two title bars, ours
        // and Windows'. Decoration is not something anyone toggles at runtime here; it is a
        // decision the config makes once, so remembering it can only ever contradict that.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        .difference(tauri_plugin_window_state::StateFlags::DECORATIONS),
                )
                .build(),
        )
        .setup(|app| {
            // Desktop-only, and registered here rather than in the builder chain: the
            // crate is declared for non-mobile targets only, so a chain call would not
            // compile if this were ever built for Android or iOS.
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("ether-manager.sqlite3");
            let db = db::Db::open(&db_path)?;
            // A download that was still running when the app last exited has no task behind it
            // anymore. Parking those on the way in is what stops the Downloads page showing a
            // progress bar that will never move again — and because whatever they had fetched is
            // still staged on disk, they come back as paused, so closing the app mid-download
            // costs a click rather than the megabytes it had already pulled.
            if let Err(e) = db.park_interrupted_downloads() {
                log::warn!("could not sweep interrupted downloads: {e}");
            }
            // Mods installed under an older layout are still where that layout put them, since
            // each row records its own path. Settling them here keeps the library one shape
            // rather than several, and is a no-op on every launch after the one that needs it.
            // A failure is worth saying out loud but not worth refusing to start over — the old
            // paths still work, they are just untidy.
            match db.get_setting("mods_folder") {
                Ok(Some(folder)) => {
                    match fs_ops::settle_mod_folders(&db, std::path::Path::new(&folder)) {
                        Ok(0) => {}
                        Ok(moved) => {
                            log::info!("moved {moved} mod folder(s) into the current layout")
                        }
                        Err(e) => log::warn!("could not settle mod folders: {e}"),
                    }
                    commands::settings::allow_mods_folder_assets(app.handle(), &folder);
                }
                Ok(None) => {}
                Err(e) => log::warn!("could not read the mods folder setting: {e}"),
            }
            app.manage(AppState {
                db: Mutex::new(db),
                gamebanana: gamebanana::GameBananaClient::new(),
                install_cancel: Mutex::new(None),
                download_stops: Mutex::new(HashMap::new()),
                download_slot: tokio::sync::Mutex::new(()),
                import_sessions: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::characters::list_characters,
            commands::mods::list_mods_for_character,
            commands::mods::list_mod_counts,
            commands::app_update::check_app_update,
            commands::app_update::install_app_update,
            commands::app_update::get_update_channel,
            commands::app_update::set_update_channel,
            commands::mods::list_all_mods,
            commands::mods::list_mod_conflicts,
            commands::import::pick_mod_archive,
            commands::import::begin_import,
            commands::import::read_import_preview,
            commands::import::commit_import,
            commands::import::cancel_import,
            commands::mods::toggle_mod,
            commands::mods::rename_mod,
            commands::mods::move_mod,
            commands::mods::set_mod_thumbnail,
            commands::mods::pick_mod_thumbnail,
            commands::mods::clear_mod_thumbnail,
            commands::mods::delete_mod,
            commands::settings::detect_mods_folder,
            commands::settings::get_mods_folder,
            commands::settings::is_mods_folder_linked,
            commands::settings::set_mods_folder,
            commands::settings::pick_mods_folder,
            commands::settings::get_mature_content_visibility,
            commands::settings::set_mature_content_visibility,
            commands::settings::get_magnifier_settings,
            commands::settings::set_magnifier_settings,
            commands::settings::get_conflict_warnings,
            commands::settings::set_conflict_warnings,
            commands::settings::get_theme,
            commands::settings::set_theme,
            commands::gamebanana::check_gamebanana_api,
            commands::gamebanana::search_gamebanana_mods,
            commands::gamebanana::get_featured_mods,
            commands::gamebanana::get_gamebanana_mod_detail,
            commands::gamebanana::get_mod_posts,
            commands::gamebanana::get_creator_profile,
            commands::gamebanana::get_creator_mods,
            commands::gamebanana::list_bookmarks,
            commands::gamebanana::list_creator_bookmarks,
            commands::gamebanana::add_creator_bookmark,
            commands::gamebanana::remove_creator_bookmark,
            commands::gamebanana::refresh_creator_bookmark,
            commands::creator_feed::list_creator_feed,
            commands::creator_feed::check_creator_feed,
            commands::creator_feed::mark_creator_feed_seen,
            commands::creator_feed::clear_creator_feed,
            commands::presets::list_presets,
            commands::presets::create_preset,
            commands::presets::save_preset_from_current,
            commands::presets::rename_preset,
            commands::presets::delete_preset,
            commands::presets::set_preset_mods,
            commands::presets::preset_mod_ids,
            commands::presets::apply_preset,
            commands::gamebanana::add_bookmark,
            commands::gamebanana::backfill_bookmark_characters,
            commands::gamebanana::remove_bookmark,
            commands::downloads::enqueue_download,
            commands::downloads::list_downloads,
            commands::downloads::cancel_download,
            commands::downloads::pause_download,
            commands::downloads::resume_download,
            commands::downloads::retry_download,
            commands::downloads::clear_finished_downloads,
            commands::gamebanana::backfill_mod_thumbnails,
            commands::gamebanana::cancel_gamebanana_install,
            commands::updates::check_mod_update,
            commands::updates::check_all_mod_updates,
            commands::updates::list_update_checks,
            commands::updates::update_installed_mod,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
