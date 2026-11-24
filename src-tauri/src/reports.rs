use std::collections::BTreeMap;

use rusqlite::{params, Connection};
use serde::Serialize;

/// Costo por filamento dentro del período.
/// `invested`: precio de carretes comprados en el período (purchased_at).
/// `spent`: costo de gramos consumidos en impresiones completed/failed (finished_at, hora local).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CostReportRow {
    pub filament_id: i64,
    pub brand_name: String,
    pub material_name: String,
    pub material_variant: Option<String>,
    pub color_name: String,
    pub color_hex: Option<String>,
    pub currency: String,
    pub invested: f64,
    pub spent: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CurrencyTotal {
    pub currency: String,
    pub invested: f64,
    pub spent: f64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CostReport {
    pub year: i32,
    /// None = año completo.
    pub month: Option<u32>,
    pub rows: Vec<CostReportRow>,
    /// Totales por moneda. Nunca se suman montos de monedas distintas.
    pub totals: Vec<CurrencyTotal>,
}

const INFO_COLUMNS: &str = "f.id, b.name, m.name, m.variant, f.color_name, f.color_hex, f.currency";

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn info_from_row(row: &rusqlite::Row) -> rusqlite::Result<CostReportRow> {
    Ok(CostReportRow {
        filament_id: row.get(0)?,
        brand_name: row.get(1)?,
        material_name: row.get(2)?,
        material_variant: row.get(3)?,
        color_name: row.get(4)?,
        color_hex: row.get(5)?,
        currency: row.get(6)?,
        invested: 0.0,
        spent: 0.0,
    })
}

pub fn cost_report(conn: &Connection, year: i32, month: Option<u32>) -> Result<CostReport, String> {
    if let Some(m) = month {
        if !(1..=12).contains(&m) {
            return Err("El mes debe estar entre 1 y 12".into());
        }
    }
    let (fmt, key) = match month {
        Some(m) => ("%Y-%m", format!("{year:04}-{m:02}")),
        None => ("%Y", format!("{year:04}")),
    };

    let mut rows: BTreeMap<i64, CostReportRow> = BTreeMap::new();

    let invested_sql = format!(
        "SELECT {INFO_COLUMNS}, f.price
         FROM filaments f
         JOIN brands b ON b.id = f.brand_id
         JOIN materials m ON m.id = f.material_id
         WHERE f.price IS NOT NULL AND f.purchased_at IS NOT NULL
           AND strftime(?1, f.purchased_at) = ?2"
    );
    let mut stmt = conn.prepare(&invested_sql).map_err(|e| e.to_string())?;
    let invested = stmt
        .query_map(params![fmt, key], |row| Ok((info_from_row(row)?, row.get::<_, f64>(7)?)))
        .map_err(|e| e.to_string())?;
    for item in invested {
        let (mut row, price) = item.map_err(|e| e.to_string())?;
        row.invested = price;
        rows.insert(row.filament_id, row);
    }

    let spent_sql = format!(
        "SELECT {INFO_COLUMNS},
                SUM(pf.grams_used * COALESCE(f.price, 0) / f.initial_weight_g)
         FROM print_filaments pf
         JOIN prints p ON p.id = pf.print_id
         JOIN filaments f ON f.id = pf.filament_id
         JOIN brands b ON b.id = f.brand_id
         JOIN materials m ON m.id = f.material_id
         WHERE p.status IN ('completed', 'failed')
           AND pf.grams_used IS NOT NULL
           AND strftime(?1, p.finished_at, 'localtime') = ?2
         GROUP BY f.id"
    );
    let mut stmt = conn.prepare(&spent_sql).map_err(|e| e.to_string())?;
    let spent = stmt
        .query_map(params![fmt, key], |row| Ok((info_from_row(row)?, row.get::<_, f64>(7)?)))
        .map_err(|e| e.to_string())?;
    for item in spent {
        let (info, cost) = item.map_err(|e| e.to_string())?;
        rows.entry(info.filament_id).or_insert(info).spent += cost;
    }

    let mut rows: Vec<CostReportRow> = rows
        .into_values()
        .filter(|r| r.invested != 0.0 || r.spent != 0.0)
        .map(|mut r| {
            r.invested = round2(r.invested);
            r.spent = round2(r.spent);
            r
        })
        .collect();
    rows.sort_by_key(|r| {
        (
            r.brand_name.to_lowercase(),
            r.material_name.to_lowercase(),
            r.color_name.to_lowercase(),
        )
    });

    let mut by_currency: BTreeMap<String, (f64, f64)> = BTreeMap::new();
    for r in &rows {
        let t = by_currency.entry(r.currency.clone()).or_insert((0.0, 0.0));
        t.0 += r.invested;
        t.1 += r.spent;
    }
    let totals = by_currency
        .into_iter()
        .map(|(currency, (invested, spent))| CurrencyTotal {
            currency,
            invested: round2(invested),
            spent: round2(spent),
        })
        .collect();

    Ok(CostReport { year, month, rows, totals })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrate;
    use crate::filaments::{self, FilamentInput};
    use crate::prints::{self, GramsUsedInput, PrintFilamentInput, PrintInput};

    fn conn() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&mut c).unwrap();
        c
    }

    fn filament(c: &Connection, price: f64, currency: &str, purchased_at: Option<&str>) -> i64 {
        filaments::create(
            c,
            FilamentInput {
                brand_id: 1,
                material_id: 7,
                color_name: "Blanco".into(),
                color_hex: None,
                diameter_mm: 1.75,
                initial_weight_g: 1000.0,
                low_stock_threshold_g: 100.0,
                price: Some(price),
                currency: currency.into(),
                purchased_at: purchased_at.map(String::from),
            },
        )
        .unwrap()
        .id
    }

    fn print_with(filament_id: i64, grams: f64) -> PrintInput {
        PrintInput {
            name: "Llavero".into(),
            description: None,
            filaments: vec![PrintFilamentInput { filament_id, grams_estimated: grams }],
        }
    }

    /// Crea una impresión con estado final y fija finished_at a una fecha conocida.
    fn finished_print(c: &Connection, filament_id: i64, grams: f64, status: &str, finished_at: &str) {
        let used = vec![GramsUsedInput { filament_id, grams_used: grams }];
        let id = prints::create(c, print_with(filament_id, grams), status, used).unwrap().id;
        c.execute("UPDATE prints SET finished_at = ?1 WHERE id = ?2", params![finished_at, id])
            .unwrap();
    }

    #[test]
    fn splits_invested_and_spent_by_period() {
        let c = conn();
        // Mediodía UTC: el día local coincide en cualquier zona horaria.
        let f = filament(&c, 10000.0, "ARS", Some("2024-03-10"));
        finished_print(&c, f, 100.0, "completed", "2024-03-10T12:00:00Z");

        let march = cost_report(&c, 2024, Some(3)).unwrap();
        assert_eq!(march.rows.len(), 1);
        assert_eq!(march.rows[0].invested, 10000.0);
        assert_eq!(march.rows[0].spent, 1000.0);
        assert_eq!(march.totals, vec![CurrencyTotal { currency: "ARS".into(), invested: 10000.0, spent: 1000.0 }]);

        let april = cost_report(&c, 2024, Some(4)).unwrap();
        assert!(april.rows.is_empty());
        assert!(april.totals.is_empty());

        let year = cost_report(&c, 2024, None).unwrap();
        assert_eq!(year.totals[0].spent, 1000.0);
    }

    #[test]
    fn ignores_planned_printing_and_cancelled_prints() {
        let c = conn();
        let f = filament(&c, 1000.0, "USD", None);
        prints::create(&c, print_with(f, 100.0), "cancelled", vec![]).unwrap();
        prints::create(&c, print_with(f, 100.0), "planned", vec![]).unwrap();
        let report = cost_report(&c, 2024, None).unwrap();
        assert!(report.rows.is_empty());
    }

    #[test]
    fn keeps_currencies_separate_and_skips_missing_purchase_date() {
        let c = conn();
        filament(&c, 10000.0, "ARS", Some("2024-03-10"));
        let usd = filament(&c, 50.0, "USD", Some("2024-03-15"));
        filament(&c, 999.0, "ARS", None);
        finished_print(&c, usd, 500.0, "failed", "2024-03-20T12:00:00Z");

        let report = cost_report(&c, 2024, Some(3)).unwrap();
        assert_eq!(report.rows.len(), 2);
        assert_eq!(
            report.totals,
            vec![
                CurrencyTotal { currency: "ARS".into(), invested: 10000.0, spent: 0.0 },
                CurrencyTotal { currency: "USD".into(), invested: 50.0, spent: 25.0 },
            ]
        );
    }

    #[test]
    fn rejects_invalid_month() {
        let c = conn();
        assert!(cost_report(&c, 2024, Some(13)).is_err());
    }
}
