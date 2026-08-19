mod archive;
mod characters;
mod commands;
mod content_rating;
mod db;
mod fs_ops;
mod gamebanana;
mod import;
mod updates;
mod variant_label;

use std::sync::atomic::{AtomicBool, AtomicU8};
use std::collections::HashMap;
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Remembers window size, position and maximized state between launches — the
        // `tauri.conf.json` width/height become first-run defaults rather than a reset on every
        // start. Desktop apps are expected to reopen where you left them.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
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
                eprintln!("could not sweep interrupted downloads: {e}");
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
                        Ok(moved) => println!("moved {moved} mod folder(s) into the current layout"),
                        Err(e) => eprintln!("could not settle mod folders: {e}"),
                    }
                    commands::settings::allow_mods_folder_assets(app.handle(), &folder);
                }
                Ok(None) => {}
                Err(e) => eprintln!("could not read the mods folder setting: {e}"),
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
            commands::mods::list_all_mods,
            commands::import::pick_mod_archive,
            commands::import::begin_import,
            commands::import::read_import_preview,
            commands::import::commit_import,
            commands::import::cancel_import,
            commands::mods::toggle_mod,
            commands::mods::rename_mod,
            commands::mods::move_mod,
            commands::mods::delete_mod,
            commands::settings::get_mods_folder,
            commands::settings::is_mods_folder_linked,
            commands::settings::set_mods_folder,
            commands::settings::pick_mods_folder,
            commands::settings::get_mature_content_visibility,
            commands::settings::set_mature_content_visibility,
            commands::settings::get_magnifier_settings,
            commands::settings::set_magnifier_settings,
            commands::gamebanana::check_gamebanana_api,
            commands::gamebanana::search_gamebanana_mods,
            commands::gamebanana::get_featured_mods,
            commands::gamebanana::get_gamebanana_mod_detail,
            commands::gamebanana::list_bookmarks,
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
