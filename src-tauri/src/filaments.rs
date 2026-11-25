use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

use crate::catalog::map_unique_error;

const ALLOWED_DIAMETERS: [f64; 2] = [1.75, 2.85];
const ALLOWED_CURRENCIES: [&str; 2] = ["ARS", "USD"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Filament {
    pub id: i64,
    pub brand_id: i64,
    pub brand_name: String,
    pub material_id: i64,
    pub material_name: String,
    pub material_variant: Option<String>,
    pub color_name: String,
    pub color_hex: Option<String>,
    pub diameter_mm: f64,
    pub initial_weight_g: f64,
    pub price: Option<f64>,
    pub currency: String,
    pub purchased_at: Option<String>,
    pub archived: bool,
    /// initial − consumido + ajustes. Lo que dice el carrete.
    pub remaining_g: f64,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FilamentInput {
    pub brand_id: i64,
    pub material_id: i64,
    pub color_name: String,
    pub color_hex: Option<String>,
    pub diameter_mm: f64,
    pub initial_weight_g: f64,
    pub price: Option<f64>,
    pub currency: String,
    pub purchased_at: Option<String>,
}

const FILAMENT_SELECT: &str = "
SELECT f.id, f.brand_id, b.name, f.material_id, m.name, m.variant,
       f.color_name, f.color_hex, f.diameter_mm, f.initial_weight_g,
       f.price, f.currency, f.purchased_at, f.archived,
       f.initial_weight_g
         - COALESCE((SELECT SUM(pf.grams_used) FROM print_filaments pf
                     JOIN prints p ON p.id = pf.print_id
                     WHERE pf.filament_id = f.id AND p.status IN ('completed', 'failed')), 0)
         + COALESCE((SELECT SUM(a.grams_delta) FROM stock_adjustments a
                     WHERE a.filament_id = f.id), 0) AS remaining_g
FROM filaments f
JOIN brands b ON b.id = f.brand_id
JOIN materials m ON m.id = f.material_id";

fn map_row(r: &Row) -> rusqlite::Result<Filament> {
    Ok(Filament {
        id: r.get(0)?,
        brand_id: r.get(1)?,
        brand_name: r.get(2)?,
        material_id: r.get(3)?,
        material_name: r.get(4)?,
        material_variant: r.get(5)?,
        color_name: r.get(6)?,
        color_hex: r.get(7)?,
        diameter_mm: r.get(8)?,
        initial_weight_g: r.get(9)?,
        price: r.get(10)?,
        currency: r.get(11)?,
        purchased_at: r.get(12)?,
        archived: r.get::<_, i64>(13)? == 1,
        remaining_g: r.get(14)?,
    })
}

pub fn list(conn: &Connection, include_archived: bool) -> Result<Vec<Filament>, String> {
    let sql = format!(
        "{FILAMENT_SELECT} WHERE (?1 = 1 OR f.archived = 0)
         ORDER BY f.archived, b.name COLLATE NOCASE, m.name COLLATE NOCASE, f.color_name COLLATE NOCASE"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![include_archived], map_row).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

fn get(conn: &Connection, id: i64) -> Result<Filament, String> {
    let sql = format!("{FILAMENT_SELECT} WHERE f.id = ?1");
    conn.query_row(&sql, params![id], map_row).map_err(|e| e.to_string())
}

/// Valida y normaliza la entrada. Devuelve el input listo para guardar.
pub fn validate(input: FilamentInput) -> Result<FilamentInput, String> {
    let color_name = input.color_name.trim().to_string();
    if color_name.is_empty() {
        return Err("El color es obligatorio".into());
    }
    if !ALLOWED_DIAMETERS.iter().any(|d| (d - input.diameter_mm).abs() < f64::EPSILON) {
        return Err("El diámetro debe ser 1.75 mm o 2.85 mm".into());
    }
    if !(input.initial_weight_g > 0.0) {
        return Err("El peso inicial debe ser mayor a 0 g".into());
    }
    if input.price.is_some_and(|p| !(p >= 0.0)) {
        return Err("El precio no puede ser negativo".into());
    }
    if !ALLOWED_CURRENCIES.contains(&input.currency.as_str()) {
        return Err("La moneda debe ser ARS o USD".into());
    }
    let color_hex = input
        .color_hex
        .map(|h| h.trim().to_string())
        .filter(|h| !h.is_empty());
    if let Some(hex) = &color_hex {
        let valid = hex.len() == 7
            && hex.starts_with('#')
            && hex[1..].chars().all(|c| c.is_ascii_hexdigit());
        if !valid {
            return Err("El color hexadecimal debe tener el formato #RRGGBB".into());
        }
    }
    let purchased_at = input.purchased_at.map(|d| d.trim().to_string()).filter(|d| !d.is_empty());
    Ok(FilamentInput {
        color_name,
        color_hex,
        purchased_at,
        ..input
    })
}

fn ensure_catalog_refs(conn: &Connection, input: &FilamentInput) -> Result<(), String> {
    let brand_ok: bool = conn
        .query_row("SELECT EXISTS(SELECT 1 FROM brands WHERE id = ?1)", params![input.brand_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if !brand_ok {
        return Err("La marca seleccionada no existe".into());
    }
    let material_ok: bool = conn
        .query_row("SELECT EXISTS(SELECT 1 FROM materials WHERE id = ?1)", params![input.material_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if !material_ok {
        return Err("El material seleccionado no existe".into());
    }
    Ok(())
}

pub fn create(conn: &Connection, input: FilamentInput) -> Result<Filament, String> {
    let input = validate(input)?;
    ensure_catalog_refs(conn, &input)?;
    conn.execute(
        "INSERT INTO filaments (brand_id, material_id, color_name, color_hex, diameter_mm,
            initial_weight_g, price, currency, purchased_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            input.brand_id,
            input.material_id,
            input.color_name,
            input.color_hex,
            input.diameter_mm,
            input.initial_weight_g,
            input.price,
            input.currency,
            input.purchased_at
        ],
    )
    .map_err(|e| map_unique_error(e, "Ya existe ese filamento"))?;
    get(conn, conn.last_insert_rowid())
}

pub fn update(conn: &Connection, id: i64, input: FilamentInput) -> Result<Filament, String> {
    let input = validate(input)?;
    ensure_catalog_refs(conn, &input)?;
    let changed = conn
        .execute(
            "UPDATE filaments SET brand_id = ?1, material_id = ?2, color_name = ?3, color_hex = ?4,
                diameter_mm = ?5, initial_weight_g = ?6, price = ?7,
                currency = ?8, purchased_at = ?9, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?10",
            params![
                input.brand_id,
                input.material_id,
                input.color_name,
                input.color_hex,
                input.diameter_mm,
                input.initial_weight_g,
                input.price,
                input.currency,
                input.purchased_at,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Filamento no encontrado".into());
    }
    get(conn, id)
}

pub fn set_archived(conn: &Connection, id: i64, archived: bool) -> Result<Filament, String> {
    let changed = conn
        .execute("UPDATE filaments SET archived = ?1 WHERE id = ?2", params![archived, id])
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Filamento no encontrado".into());
    }
    get(conn, id)
}

/// Descuenta gramos que no se pueden imprimir (la impresora no los toma, etc.).
pub fn add_waste(conn: &Connection, id: i64, grams: f64) -> Result<Filament, String> {
    if !(grams > 0.0 && grams.is_finite()) {
        return Err("Los gramos de residuo deben ser mayores a 0".into());
    }
    let changed = conn
        .execute(
            "INSERT INTO stock_adjustments (filament_id, grams_delta, reason)
             SELECT id, ?2, 'Residuo' FROM filaments WHERE id = ?1",
            params![id, -grams],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Filamento no encontrado".into());
    }
    get(conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrate;

    fn conn() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&mut c).unwrap();
        c
    }

    fn input() -> FilamentInput {
        FilamentInput {
            brand_id: 1,
            material_id: 7,
            color_name: "Blanco".into(),
            color_hex: Some("#FFFFFF".into()),
            diameter_mm: 1.75,
            initial_weight_g: 1000.0,
            price: Some(25000.0),
            currency: "ARS".into(),
            purchased_at: None,
        }
    }

    fn add_print(c: &Connection, status: &str, used: Option<f64>, filament: i64) {
        c.execute(
            "INSERT INTO prints (name, status) VALUES ('p', ?1)",
            params![status],
        )
        .unwrap();
        let print_id = c.last_insert_rowid();
        c.execute(
            "INSERT INTO print_filaments (print_id, filament_id, grams_used) VALUES (?1, ?2, ?3)",
            params![print_id, filament, used],
        )
        .unwrap();
    }

    #[test]
    fn remaining_without_movements_is_initial_weight() {
        let c = conn();
        let f = create(&c, input()).unwrap();
        assert_eq!(f.remaining_g, 1000.0);
    }

    #[test]
    fn remaining_discounts_completed_and_failed_only() {
        let c = conn();
        let f = create(&c, input()).unwrap();
        add_print(&c, "completed", Some(90.0), f.id);
        add_print(&c, "failed", Some(20.0), f.id);
        add_print(&c, "cancelled", None, f.id);
        add_print(&c, "planned", None, f.id);
        add_print(&c, "printing", None, f.id);
        assert_eq!(get(&c, f.id).unwrap().remaining_g, 890.0);
    }

    #[test]
    fn waste_reduces_remaining_and_rejects_invalid_grams() {
        let c = conn();
        let f = create(&c, input()).unwrap();
        let after = add_waste(&c, f.id, 45.5).unwrap();
        assert_eq!(after.remaining_g, 954.5);
        assert!(add_waste(&c, f.id, 0.0).is_err());
        assert!(add_waste(&c, f.id, -5.0).is_err());
        assert!(add_waste(&c, f.id, f64::NAN).is_err());
        assert!(add_waste(&c, 999, 10.0).is_err());
        assert_eq!(get(&c, f.id).unwrap().remaining_g, 954.5);
    }

    #[test]
    fn adjustments_add_to_remaining() {
        let c = conn();
        let f = create(&c, input()).unwrap();
        add_print(&c, "completed", Some(100.0), f.id);
        c.execute(
            "INSERT INTO stock_adjustments (filament_id, grams_delta, reason) VALUES (?1, 30, 'pesaje')",
            params![f.id],
        )
        .unwrap();
        c.execute(
            "INSERT INTO stock_adjustments (filament_id, grams_delta, reason) VALUES (?1, -10, 'error')",
            params![f.id],
        )
        .unwrap();
        assert_eq!(get(&c, f.id).unwrap().remaining_g, 920.0);
    }

    #[test]
    fn rejects_invalid_input() {
        let c = conn();
        assert!(create(&c, FilamentInput { color_name: "  ".into(), ..input() }).is_err());
        assert!(create(&c, FilamentInput { diameter_mm: 3.0, ..input() }).is_err());
        assert!(create(&c, FilamentInput { initial_weight_g: 0.0, ..input() }).is_err());
        assert!(create(&c, FilamentInput { price: Some(-1.0), ..input() }).is_err());
        assert!(create(&c, FilamentInput { currency: "EUR".into(), ..input() }).is_err());
        assert!(create(&c, FilamentInput { color_hex: Some("white".into()), ..input() }).is_err());
        assert!(create(&c, FilamentInput { brand_id: 999, ..input() }).is_err());
    }

    #[test]
    fn archive_hides_from_default_list_but_keeps_stock() {
        let c = conn();
        let f = create(&c, input()).unwrap();
        set_archived(&c, f.id, true).unwrap();
        assert!(list(&c, false).unwrap().is_empty());
        let all = list(&c, true).unwrap();
        assert_eq!(all.len(), 1);
        assert!(all[0].archived);
    }

    #[test]
    fn update_changes_fields() {
        let c = conn();
        let f = create(&c, input()).unwrap();
        let updated = update(&c, f.id, FilamentInput { price: None, ..input() }).unwrap();
        assert_eq!(updated.price, None);
        assert_eq!(updated.brand_name, "Bambu Lab");
    }
}
