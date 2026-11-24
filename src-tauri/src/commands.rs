use tauri::State;

use crate::catalog::{self, Brand, Material};
use crate::dashboard::{self, DashboardSummary};
use crate::filaments::{self, Filament, FilamentInput};
use crate::prints::{self, GramsUsedInput, Print, PrintInput};
use crate::reports::{self, CostReport};
use crate::DbState;

fn with_conn<T>(
    state: &State<DbState>,
    f: impl FnOnce(&rusqlite::Connection) -> Result<T, String>,
) -> Result<T, String> {
    let conn = state.0.lock().map_err(|_| "La base de datos no está disponible".to_string())?;
    f(&conn)
}

#[tauri::command]
pub fn list_brands(state: State<DbState>, include_archived: bool) -> Result<Vec<Brand>, String> {
    with_conn(&state, |c| catalog::list_brands(c, include_archived))
}

#[tauri::command]
pub fn save_brand(state: State<DbState>, id: Option<i64>, name: String) -> Result<Brand, String> {
    with_conn(&state, |c| catalog::save_brand(c, id, &name))
}

#[tauri::command]
pub fn set_brand_archived(state: State<DbState>, id: i64, archived: bool) -> Result<Brand, String> {
    with_conn(&state, |c| catalog::set_brand_archived(c, id, archived))
}

#[tauri::command]
pub fn list_materials(state: State<DbState>, include_archived: bool) -> Result<Vec<Material>, String> {
    with_conn(&state, |c| catalog::list_materials(c, include_archived))
}

#[tauri::command]
pub fn save_material(
    state: State<DbState>,
    id: Option<i64>,
    name: String,
    variant: Option<String>,
) -> Result<Material, String> {
    with_conn(&state, |c| catalog::save_material(c, id, &name, variant.as_deref()))
}

#[tauri::command]
pub fn set_material_archived(state: State<DbState>, id: i64, archived: bool) -> Result<Material, String> {
    with_conn(&state, |c| catalog::set_material_archived(c, id, archived))
}

#[tauri::command]
pub fn list_filaments(state: State<DbState>, include_archived: bool) -> Result<Vec<Filament>, String> {
    with_conn(&state, |c| filaments::list(c, include_archived))
}

#[tauri::command]
pub fn create_filament(state: State<DbState>, input: FilamentInput) -> Result<Filament, String> {
    with_conn(&state, |c| filaments::create(c, input))
}

#[tauri::command]
pub fn update_filament(state: State<DbState>, id: i64, input: FilamentInput) -> Result<Filament, String> {
    with_conn(&state, |c| filaments::update(c, id, input))
}

#[tauri::command]
pub fn set_filament_archived(state: State<DbState>, id: i64, archived: bool) -> Result<Filament, String> {
    with_conn(&state, |c| filaments::set_archived(c, id, archived))
}

#[tauri::command]
pub fn list_prints(state: State<DbState>) -> Result<Vec<Print>, String> {
    with_conn(&state, prints::list)
}

#[tauri::command]
pub fn create_print(
    state: State<DbState>,
    input: PrintInput,
    status: String,
    grams_used: Vec<GramsUsedInput>,
) -> Result<Print, String> {
    with_conn(&state, |c| prints::create(c, input, &status, grams_used))
}

#[tauri::command]
pub fn update_print(state: State<DbState>, id: i64, input: PrintInput) -> Result<Print, String> {
    with_conn(&state, |c| prints::update(c, id, input))
}

#[tauri::command]
pub fn change_print_status(
    state: State<DbState>,
    id: i64,
    status: String,
    grams_used: Option<Vec<GramsUsedInput>>,
) -> Result<Print, String> {
    with_conn(&state, |c| prints::change_status(c, id, &status, grams_used.unwrap_or_default()))
}

#[tauri::command]
pub fn delete_print(state: State<DbState>, id: i64) -> Result<(), String> {
    with_conn(&state, |c| prints::delete(c, id))
}

#[tauri::command]
pub fn cost_report(state: State<DbState>, year: i32, month: Option<u32>) -> Result<CostReport, String> {
    with_conn(&state, |c| reports::cost_report(c, year, month))
}

#[tauri::command]
pub fn dashboard_summary(state: State<DbState>) -> Result<DashboardSummary, String> {
    with_conn(&state, dashboard::summary)
}
