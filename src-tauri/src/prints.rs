use std::collections::{BTreeMap, HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

const NOW_SQL: &str = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PrintFilament {
    pub filament_id: i64,
    pub brand_name: String,
    pub material_name: String,
    pub material_variant: Option<String>,
    pub color_name: String,
    pub color_hex: Option<String>,
    pub grams_estimated: f64,
    pub grams_used: Option<f64>,
    pub currency: String,
    /// grams_used × precio por gramo. None si el filamento no tiene precio o no hay consumo.
    pub cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CurrencyAmount {
    pub currency: String,
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Print {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub updated_at: String,
    pub filaments: Vec<PrintFilament>,
    pub costs: Vec<CurrencyAmount>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PrintFilamentInput {
    pub filament_id: i64,
    pub grams_estimated: f64,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PrintInput {
    pub name: String,
    pub description: Option<String>,
    pub filaments: Vec<PrintFilamentInput>,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GramsUsedInput {
    pub filament_id: i64,
    pub grams_used: f64,
}

fn db_err(e: rusqlite::Error) -> String {
    e.to_string()
}

fn status_label(status: &str) -> &'static str {
    match status {
        "planned" => "planificada",
        "printing" => "en curso",
        "completed" => "completada",
        "failed" => "fallida",
        "cancelled" => "cancelada",
        _ => "desconocida",
    }
}

/// planned → printing | completed | failed | cancelled; printing → completed | failed | cancelled.
/// Los estados terminales no se reabren.
pub fn is_transition_allowed(from: &str, to: &str) -> bool {
    match from {
        "planned" => matches!(to, "printing" | "completed" | "failed" | "cancelled"),
        "printing" => matches!(to, "completed" | "failed" | "cancelled"),
        _ => false,
    }
}

fn load_filament_rows(conn: &Connection, print_id: Option<i64>) -> Result<HashMap<i64, Vec<PrintFilament>>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT pf.print_id, f.id, b.name, m.name, m.variant, f.color_name, f.color_hex,
                    pf.grams_estimated, pf.grams_used, f.currency, f.price, f.initial_weight_g
             FROM print_filaments pf
             JOIN filaments f ON f.id = pf.filament_id
             JOIN brands b ON b.id = f.brand_id
             JOIN materials m ON m.id = f.material_id
             WHERE (?1 IS NULL OR pf.print_id = ?1)
             ORDER BY pf.rowid",
        )
        .map_err(db_err)?;
    let rows = stmt
        .query_map(params![print_id], |r| {
            let grams_used: Option<f64> = r.get(8)?;
            let price: Option<f64> = r.get(10)?;
            let initial_weight: f64 = r.get(11)?;
            let cost = match (grams_used, price) {
                (Some(g), Some(p)) => Some(g * p / initial_weight),
                _ => None,
            };
            let row = PrintFilament {
                filament_id: r.get(1)?,
                brand_name: r.get(2)?,
                material_name: r.get(3)?,
                material_variant: r.get(4)?,
                color_name: r.get(5)?,
                color_hex: r.get(6)?,
                grams_estimated: r.get(7)?,
                grams_used,
                currency: r.get(9)?,
                cost,
            };
            Ok((r.get::<_, i64>(0)?, row))
        })
        .map_err(db_err)?;
    let mut by_print: HashMap<i64, Vec<PrintFilament>> = HashMap::new();
    for row in rows {
        let (print_id, filament) = row.map_err(db_err)?;
        by_print.entry(print_id).or_default().push(filament);
    }
    Ok(by_print)
}

fn totals(filaments: &[PrintFilament]) -> Vec<CurrencyAmount> {
    let mut by_currency: BTreeMap<String, f64> = BTreeMap::new();
    for f in filaments {
        if let Some(cost) = f.cost {
            *by_currency.entry(f.currency.clone()).or_insert(0.0) += cost;
        }
    }
    by_currency
        .into_iter()
        .map(|(currency, amount)| CurrencyAmount { currency, amount })
        .collect()
}

fn load(conn: &Connection, id: Option<i64>) -> Result<Vec<Print>, String> {
    let mut rows_by_print = load_filament_rows(conn, id)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, status, created_at, started_at, finished_at, updated_at
             FROM prints
             WHERE (?1 IS NULL OR id = ?1)
             ORDER BY created_at DESC, id DESC",
        )
        .map_err(db_err)?;
    let prints = stmt
        .query_map(params![id], |r| {
            Ok(Print {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                status: r.get(3)?,
                created_at: r.get(4)?,
                started_at: r.get(5)?,
                finished_at: r.get(6)?,
                updated_at: r.get(7)?,
                filaments: Vec::new(),
                costs: Vec::new(),
            })
        })
        .map_err(db_err)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(db_err)?;
    Ok(prints
        .into_iter()
        .map(|mut p| {
            p.filaments = rows_by_print.remove(&p.id).unwrap_or_default();
            p.costs = totals(&p.filaments);
            p
        })
        .collect())
}

pub fn list(conn: &Connection) -> Result<Vec<Print>, String> {
    load(conn, None)
}

fn get(conn: &Connection, id: i64) -> Result<Print, String> {
    load(conn, Some(id))?
        .pop()
        .ok_or_else(|| "Impresión no encontrada".to_string())
}

fn status_of(conn: &Connection, id: i64) -> Result<String, String> {
    conn.query_row("SELECT status FROM prints WHERE id = ?1", params![id], |r| r.get(0))
        .optional()
        .map_err(db_err)?
        .ok_or_else(|| "Impresión no encontrada".to_string())
}

fn current_filament_ids(conn: &Connection, id: i64) -> Result<HashSet<i64>, String> {
    let mut stmt = conn
        .prepare("SELECT filament_id FROM print_filaments WHERE print_id = ?1")
        .map_err(db_err)?;
    let ids = stmt
        .query_map(params![id], |r| r.get::<_, i64>(0))
        .map_err(db_err)?
        .collect::<rusqlite::Result<HashSet<_>>>()
        .map_err(db_err)?;
    Ok(ids)
}

/// Valida la entrada. Los filamentos archivados solo se aceptan si ya estaban en la impresión.
fn validate_input(conn: &Connection, input: PrintInput, current: &HashSet<i64>) -> Result<PrintInput, String> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("El nombre es obligatorio".into());
    }
    let description = input
        .description
        .map(|d| d.trim().to_string())
        .filter(|d| !d.is_empty());
    if input.filaments.is_empty() {
        return Err("Agregá al menos un filamento".into());
    }
    let mut seen = HashSet::new();
    for row in &input.filaments {
        if !seen.insert(row.filament_id) {
            return Err("Un filamento aparece más de una vez en la impresión".into());
        }
        if !(row.grams_estimated > 0.0 && row.grams_estimated.is_finite()) {
            return Err("Los gramos estimados deben ser mayores a 0".into());
        }
        let archived: Option<bool> = conn
            .query_row(
                "SELECT archived FROM filaments WHERE id = ?1",
                params![row.filament_id],
                |r| Ok(r.get::<_, i64>(0)? == 1),
            )
            .optional()
            .map_err(db_err)?;
        match archived {
            None => return Err("El filamento seleccionado no existe".into()),
            Some(true) if !current.contains(&row.filament_id) => {
                return Err("No se puede usar un filamento archivado".into())
            }
            _ => {}
        }
    }
    Ok(PrintInput {
        name,
        description,
        filaments: input.filaments,
    })
}

fn insert_rows(conn: &Connection, print_id: i64, rows: &[PrintFilamentInput]) -> Result<(), String> {
    for row in rows {
        conn.execute(
            "INSERT INTO print_filaments (print_id, filament_id, grams_estimated) VALUES (?1, ?2, ?3)",
            params![print_id, row.filament_id, row.grams_estimated],
        )
        .map_err(db_err)?;
    }
    Ok(())
}

/// Crea la impresión directamente en `status`. Al crearla como completada o fallida
/// se descuentan los gramos indicados, con las mismas reglas que `change_status`.
pub fn create(
    conn: &Connection,
    input: PrintInput,
    status: &str,
    grams_used: Vec<GramsUsedInput>,
) -> Result<Print, String> {
    let input = validate_input(conn, input, &HashSet::new())?;
    let rows: Vec<(i64, f64)> = input
        .filaments
        .iter()
        .map(|f| (f.filament_id, f.grams_estimated))
        .collect();
    let used = resolve_grams_used(status, &rows, grams_used)?;
    let tx = conn.unchecked_transaction().map_err(db_err)?;
    tx.execute(
        &format!(
            "INSERT INTO prints (name, description, status, updated_at)
             VALUES (?1, ?2, 'planned', {NOW_SQL})"
        ),
        params![input.name, input.description],
    )
    .map_err(db_err)?;
    let id = tx.last_insert_rowid();
    insert_rows(&tx, id, &input.filaments)?;
    apply_status(&tx, id, status, &used)?;
    tx.commit().map_err(db_err)?;
    get(conn, id)
}

pub fn update(conn: &Connection, id: i64, input: PrintInput) -> Result<Print, String> {
    let status = status_of(conn, id)?;
    if !matches!(status.as_str(), "planned" | "printing") {
        return Err("Solo se pueden editar impresiones planificadas o en curso".into());
    }
    let current = current_filament_ids(conn, id)?;
    let input = validate_input(conn, input, &current)?;
    let tx = conn.unchecked_transaction().map_err(db_err)?;
    tx.execute(
        &format!("UPDATE prints SET name = ?1, description = ?2, updated_at = {NOW_SQL} WHERE id = ?3"),
        params![input.name, input.description, id],
    )
    .map_err(db_err)?;
    tx.execute("DELETE FROM print_filaments WHERE print_id = ?1", params![id])
        .map_err(db_err)?;
    insert_rows(&tx, id, &input.filaments)?;
    tx.commit().map_err(db_err)?;
    get(conn, id)
}

/// Calcula los gramos a descontar por filamento según el estado destino.
/// Al completar, cada filamento usa `grams_estimated` salvo que se indique otro valor.
/// Al fallar, cada filamento debe indicar `grams_used`. Cancelar o imprimir no descuentan.
fn resolve_grams_used(
    to: &str,
    rows: &[(i64, f64)],
    provided: Vec<GramsUsedInput>,
) -> Result<Vec<(i64, f64)>, String> {
    if !matches!(to, "completed" | "failed") {
        if provided.is_empty() {
            return Ok(Vec::new());
        }
        return Err("Solo se indican gramos usados al completar o fallar".into());
    }
    let provided: HashMap<i64, f64> = provided
        .into_iter()
        .map(|g| (g.filament_id, g.grams_used))
        .collect();
    if provided
        .keys()
        .any(|fid| !rows.iter().any(|(rid, _)| rid == fid))
    {
        return Err("Un filamento no pertenece a la impresión".into());
    }
    let mut out = Vec::with_capacity(rows.len());
    for &(fid, estimated) in rows {
        let used = match provided.get(&fid) {
            Some(g) => *g,
            None if to == "completed" => estimated,
            None => return Err("Indicá los gramos usados de cada filamento".into()),
        };
        if !(used >= 0.0 && used.is_finite()) {
            return Err("Los gramos usados no pueden ser negativos".into());
        }
        out.push((fid, used));
    }
    Ok(out)
}

pub fn change_status(
    conn: &Connection,
    id: i64,
    to: &str,
    grams_used: Vec<GramsUsedInput>,
) -> Result<Print, String> {
    let from = status_of(conn, id)?;
    if !is_transition_allowed(&from, to) {
        return Err(format!(
            "No se puede pasar de {} a {}",
            status_label(&from),
            status_label(to)
        ));
    }
    let rows: Vec<(i64, f64)> = {
        let mut stmt = conn
            .prepare("SELECT filament_id, grams_estimated FROM print_filaments WHERE print_id = ?1 ORDER BY rowid")
            .map_err(db_err)?;
        stmt.query_map(params![id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(db_err)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(db_err)?
    };
    let used = resolve_grams_used(to, &rows, grams_used)?;

    let tx = conn.unchecked_transaction().map_err(db_err)?;
    apply_status(&tx, id, to, &used)?;
    tx.commit().map_err(db_err)?;
    get(conn, id)
}

/// Guarda el estado, los gramos usados y las fechas de inicio/fin. Debe llamarse dentro de una transacción.
fn apply_status(conn: &Connection, id: i64, to: &str, used: &[(i64, f64)]) -> Result<(), String> {
    for (filament_id, grams) in used {
        conn.execute(
            "UPDATE print_filaments SET grams_used = ?1 WHERE print_id = ?2 AND filament_id = ?3",
            params![grams, id, filament_id],
        )
        .map_err(db_err)?;
    }
    conn.execute(
        &format!(
            "UPDATE prints SET status = ?1,
                started_at = CASE WHEN ?1 = 'printing' THEN {NOW_SQL} ELSE started_at END,
                finished_at = CASE WHEN ?1 IN ('completed', 'failed', 'cancelled') THEN {NOW_SQL} ELSE finished_at END,
                updated_at = {NOW_SQL}
             WHERE id = ?2"
        ),
        params![to, id],
    )
    .map_err(db_err)?;
    Ok(())
}

/// Solo las impresiones planificadas se borran; el resto queda como historial.
pub fn delete(conn: &Connection, id: i64) -> Result<(), String> {
    let status = status_of(conn, id)?;
    if status != "planned" {
        return Err("Solo se pueden eliminar impresiones planificadas".into());
    }
    conn.execute("DELETE FROM prints WHERE id = ?1", params![id])
        .map_err(db_err)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrate;
    use crate::filaments::{self, Filament, FilamentInput};

    fn conn() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&mut c).unwrap();
        c
    }

    fn new_filament(c: &Connection, weight: f64, price: Option<f64>) -> i64 {
        filaments::create(
            c,
            FilamentInput {
                brand_id: 1,
                material_id: 7,
                color_name: "Blanco".into(),
                color_hex: None,
                diameter_mm: 1.75,
                initial_weight_g: weight,
                low_stock_threshold_g: 100.0,
                price,
                currency: "ARS".into(),
                purchased_at: None,
            },
        )
        .unwrap()
        .id
    }

    fn print_input(rows: &[(i64, f64)]) -> PrintInput {
        PrintInput {
            name: "Llavero".into(),
            description: None,
            filaments: rows
                .iter()
                .map(|&(filament_id, grams_estimated)| PrintFilamentInput { filament_id, grams_estimated })
                .collect(),
        }
    }

    fn new_print(c: &Connection, rows: &[(i64, f64)]) -> i64 {
        create(c, print_input(rows), "planned", vec![]).unwrap().id
    }

    fn used(rows: &[(i64, f64)]) -> Vec<GramsUsedInput> {
        rows.iter()
            .map(|&(filament_id, grams_used)| GramsUsedInput { filament_id, grams_used })
            .collect()
    }

    fn stock(c: &Connection, id: i64) -> Filament {
        filaments::list(c, true).unwrap().into_iter().find(|f| f.id == id).unwrap()
    }

    #[test]
    fn transitions_follow_state_machine() {
        assert!(is_transition_allowed("planned", "printing"));
        assert!(is_transition_allowed("planned", "completed"));
        assert!(is_transition_allowed("planned", "failed"));
        assert!(is_transition_allowed("planned", "cancelled"));
        assert!(is_transition_allowed("printing", "completed"));
        assert!(is_transition_allowed("printing", "failed"));
        assert!(is_transition_allowed("printing", "cancelled"));
        assert!(!is_transition_allowed("printing", "planned"));
        assert!(!is_transition_allowed("printing", "printing"));
        for terminal in ["completed", "failed", "cancelled"] {
            for to in ["planned", "printing", "completed", "failed", "cancelled"] {
                assert!(!is_transition_allowed(terminal, to), "{terminal} → {to}");
            }
        }
    }

    #[test]
    fn planned_and_printing_reserve_without_consuming() {
        let c = conn();
        let f = new_filament(&c, 1000.0, None);
        let id = new_print(&c, &[(f, 200.0)]);
        let s = stock(&c, f);
        assert_eq!((s.remaining_g, s.reserved_g, s.free_g), (1000.0, 200.0, 800.0));
        change_status(&c, id, "printing", vec![]).unwrap();
        let s = stock(&c, f);
        assert_eq!((s.remaining_g, s.reserved_g), (1000.0, 200.0));
    }

    #[test]
    fn completing_defaults_grams_used_to_estimated() {
        let c = conn();
        let f = new_filament(&c, 1000.0, None);
        let id = new_print(&c, &[(f, 200.0)]);
        let print = change_status(&c, id, "completed", vec![]).unwrap();
        assert_eq!(print.filaments[0].grams_used, Some(200.0));
        assert!(print.finished_at.is_some());
        let s = stock(&c, f);
        assert_eq!((s.remaining_g, s.reserved_g), (800.0, 0.0));
    }

    #[test]
    fn completing_accepts_edited_grams_used() {
        let c = conn();
        let f = new_filament(&c, 1000.0, None);
        let id = new_print(&c, &[(f, 200.0)]);
        change_status(&c, id, "completed", used(&[(f, 180.0)])).unwrap();
        assert_eq!(stock(&c, f).remaining_g, 820.0);
    }

    #[test]
    fn failed_requires_grams_used_for_every_filament() {
        let c = conn();
        let f1 = new_filament(&c, 1000.0, None);
        let f2 = new_filament(&c, 1000.0, None);
        let id = new_print(&c, &[(f1, 100.0), (f2, 50.0)]);
        assert!(change_status(&c, id, "failed", used(&[(f1, 30.0)])).is_err());
        assert_eq!(status_of(&c, id).unwrap(), "planned");
        change_status(&c, id, "failed", used(&[(f1, 30.0), (f2, 10.0)])).unwrap();
        assert_eq!(stock(&c, f1).remaining_g, 970.0);
        assert_eq!(stock(&c, f2).remaining_g, 990.0);
    }

    #[test]
    fn cancelled_consumes_nothing() {
        let c = conn();
        let f = new_filament(&c, 1000.0, None);
        let id = new_print(&c, &[(f, 200.0)]);
        change_status(&c, id, "printing", vec![]).unwrap();
        let print = change_status(&c, id, "cancelled", vec![]).unwrap();
        assert_eq!(print.filaments[0].grams_used, None);
        let s = stock(&c, f);
        assert_eq!((s.remaining_g, s.reserved_g), (1000.0, 0.0));
    }

    #[test]
    fn grams_used_only_allowed_when_completing_or_failing() {
        let c = conn();
        let f = new_filament(&c, 1000.0, None);
        let id = new_print(&c, &[(f, 200.0)]);
        assert!(change_status(&c, id, "cancelled", used(&[(f, 10.0)])).is_err());
    }

    #[test]
    fn terminal_prints_cannot_change_status() {
        let c = conn();
        let f = new_filament(&c, 1000.0, None);
        let id = new_print(&c, &[(f, 200.0)]);
        change_status(&c, id, "cancelled", vec![]).unwrap();
        assert!(change_status(&c, id, "printing", vec![]).is_err());
        assert!(change_status(&c, id, "completed", vec![]).is_err());
    }

    #[test]
    fn rejects_invalid_print_input() {
        let c = conn();
        let f = new_filament(&c, 1000.0, None);
        assert!(create(&c, PrintInput { name: " ".into(), ..print_input(&[(f, 1.0)]) }, "planned", vec![]).is_err());
        assert!(create(&c, print_input(&[]), "planned", vec![]).is_err());
        assert!(create(&c, print_input(&[(f, 10.0), (f, 20.0)]), "planned", vec![]).is_err());
        assert!(create(&c, print_input(&[(f, 0.0)]), "planned", vec![]).is_err());
        assert!(create(&c, print_input(&[(999, 10.0)]), "planned", vec![]).is_err());
        filaments::set_archived(&c, f, true).unwrap();
        assert!(create(&c, print_input(&[(f, 10.0)]), "planned", vec![]).is_err());
    }

    #[test]
    fn can_be_created_in_any_status() {
        let c = conn();
        let f = new_filament(&c, 1000.0, None);
        let printing = create(&c, print_input(&[(f, 100.0)]), "printing", vec![]).unwrap();
        assert_eq!(printing.status, "printing");
        assert!(printing.started_at.is_some());
        assert_eq!(printing.filaments[0].grams_used, None);

        let cancelled = create(&c, print_input(&[(f, 100.0)]), "cancelled", vec![]).unwrap();
        assert!(cancelled.finished_at.is_some());
        assert_eq!(cancelled.filaments[0].grams_used, None);
        assert_eq!(stock(&c, f).remaining_g, 1000.0);
    }

    #[test]
    fn creating_completed_or_failed_consumes_given_grams() {
        let c = conn();
        let f1 = new_filament(&c, 1000.0, Some(20.0));
        let f2 = new_filament(&c, 1000.0, None);
        let rows = print_input(&[(f1, 100.0), (f2, 50.0)]);

        assert!(create(&c, rows.clone(), "failed", used(&[(f1, 30.0)])).is_err());
        assert!(create(&c, rows.clone(), "cancelled", used(&[(f1, 30.0), (f2, 10.0)])).is_err());

        let done = create(&c, rows.clone(), "completed", vec![]).unwrap();
        assert_eq!(done.filaments[0].grams_used, Some(100.0));
        assert_eq!(done.filaments[1].grams_used, Some(50.0));
        assert_eq!(stock(&c, f1).remaining_g, 900.0);

        let failed = create(&c, rows, "failed", used(&[(f1, 30.0), (f2, 10.0)])).unwrap();
        assert_eq!(failed.filaments[0].grams_used, Some(30.0));
        assert_eq!(stock(&c, f1).remaining_g, 870.0);
        assert_eq!(stock(&c, f2).remaining_g, 940.0);
    }


    #[test]
    fn only_planned_prints_can_be_deleted() {
        let c = conn();
        let f = new_filament(&c, 1000.0, None);
        let planned = new_print(&c, &[(f, 10.0)]);
        let done = new_print(&c, &[(f, 10.0)]);
        change_status(&c, done, "completed", vec![]).unwrap();
        assert!(delete(&c, done).is_err());
        delete(&c, planned).unwrap();
        let rows: i64 = c
            .query_row("SELECT COUNT(*) FROM print_filaments WHERE print_id = ?1", params![planned], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 0);
        assert_eq!(list(&c).unwrap().len(), 1);
    }

    #[test]
    fn only_open_prints_can_be_edited() {
        let c = conn();
        let f = new_filament(&c, 1000.0, None);
        let id = new_print(&c, &[(f, 10.0)]);
        change_status(&c, id, "failed", used(&[(f, 5.0)])).unwrap();
        assert!(update(&c, id, print_input(&[(f, 10.0)])).is_err());
    }

    #[test]
    fn cost_uses_price_per_gram_of_used_grams() {
        let c = conn();
        let f = new_filament(&c, 1000.0, Some(25000.0));
        let id = new_print(&c, &[(f, 200.0)]);
        assert!(get(&c, id).unwrap().costs.is_empty());
        let print = change_status(&c, id, "completed", used(&[(f, 100.0)])).unwrap();
        assert_eq!(print.costs, vec![CurrencyAmount { currency: "ARS".into(), amount: 2500.0 }]);
    }
}
