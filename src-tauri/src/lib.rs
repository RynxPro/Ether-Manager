mod archive;
mod characters;
mod commands;
mod db;
mod fs_ops;

use std::sync::Mutex;

use tauri::Manager;

pub struct AppState {
    pub db: Mutex<db::Db>,
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
            app.manage(AppState { db: Mutex::new(db) });
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
