mod archive;
mod characters;
mod commands;
mod db;
mod fs_ops;
mod gamebanana;
mod updates;

use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use tauri::Manager;

pub struct AppState {
    pub db: Mutex<db::Db>,
    pub gamebanana: gamebanana::GameBananaClient,
    /// Set while an `install_from_gamebanana` call is in flight, so `cancel_gamebanana_install`
    /// has something to flip. Only one install is expected at a time in this UI.
    pub install_cancel: Mutex<Option<Arc<AtomicBool>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("ether-manager.sqlite3");
            let db = db::Db::open(&db_path)?;
            app.manage(AppState {
                db: Mutex::new(db),
                gamebanana: gamebanana::GameBananaClient::new(),
                install_cancel: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::characters::list_characters,
            commands::mods::list_mods_for_character,
            commands::mods::list_mod_counts,
            commands::mods::add_mod,
            commands::mods::toggle_mod,
            commands::mods::delete_mod,
            commands::settings::get_mods_folder,
            commands::settings::set_mods_folder,
            commands::settings::pick_mods_folder,
            commands::gamebanana::search_gamebanana_mods,
            commands::gamebanana::get_gamebanana_mod_detail,
            commands::gamebanana::list_bookmarks,
            commands::gamebanana::add_bookmark,
            commands::gamebanana::remove_bookmark,
            commands::gamebanana::install_from_gamebanana,
            commands::gamebanana::cancel_gamebanana_install,
            commands::updates::check_mod_update,
            commands::updates::check_all_mod_updates,
            commands::updates::list_update_checks,
            commands::updates::update_installed_mod,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
