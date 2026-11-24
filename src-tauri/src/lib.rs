mod catalog;
mod commands;
mod dashboard;
mod db;
mod filaments;
mod prints;
mod reports;

use std::sync::Mutex;
use tauri::Manager;

pub struct DbState(pub Mutex<rusqlite::Connection>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let conn = db::open(&dir.join("tarita.db"))?;
            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_brands,
            commands::save_brand,
            commands::set_brand_archived,
            commands::list_materials,
            commands::save_material,
            commands::set_material_archived,
            commands::list_filaments,
            commands::create_filament,
            commands::update_filament,
            commands::set_filament_archived,
            commands::list_prints,
            commands::create_print,
            commands::update_print,
            commands::change_print_status,
            commands::delete_print,
            commands::cost_report,
            commands::dashboard_summary,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
