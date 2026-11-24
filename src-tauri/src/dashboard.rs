use std::collections::BTreeMap;

use rusqlite::Connection;
use serde::Serialize;

use crate::filaments::{self, Filament};
use crate::prints::{self, Print};

const RECENT_PRINTS: usize = 5;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CurrencyValue {
    pub currency: String,
    pub value: f64,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StockSummary {
    /// Σ restante de filamentos no archivados.
    pub remaining_g: f64,
    /// Σ reservado (impresiones planned/printing).
    pub reserved_g: f64,
    /// remaining − reserved. Puede ser negativo.
    pub free_g: f64,
    /// Valor del restante por moneda, solo de carretes con precio. Nunca se suman monedas distintas.
    pub value: Vec<CurrencyValue>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub stock: StockSummary,
    pub recent_prints: Vec<Print>,
    /// Carretes no archivados con restante por debajo de su umbral, el más vacío primero.
    pub low_stock: Vec<Filament>,
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

pub fn summary(conn: &Connection) -> Result<DashboardSummary, String> {
    let filaments = filaments::list(conn, false)?;

    let mut remaining_g = 0.0;
    let mut reserved_g = 0.0;
    let mut value: BTreeMap<String, f64> = BTreeMap::new();
    let mut low_stock = Vec::new();

    for f in &filaments {
        remaining_g += f.remaining_g;
        reserved_g += f.reserved_g;
        if let Some(price) = f.price {
            *value.entry(f.currency.clone()).or_insert(0.0) +=
                f.remaining_g.max(0.0) * price / f.initial_weight_g;
        }
        if f.remaining_g < f.low_stock_threshold_g {
            low_stock.push(f.clone());
        }
    }
    low_stock.sort_by(|a, b| a.remaining_g.total_cmp(&b.remaining_g));

    let recent_prints = prints::list(conn)?.into_iter().take(RECENT_PRINTS).collect();

    Ok(DashboardSummary {
        stock: StockSummary {
            remaining_g: round2(remaining_g),
            reserved_g: round2(reserved_g),
            free_g: round2(remaining_g - reserved_g),
            value: value
                .into_iter()
                .map(|(currency, v)| CurrencyValue { currency, value: round2(v) })
                .collect(),
        },
        recent_prints,
        low_stock,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrate;
    use crate::filaments::FilamentInput;
    use crate::prints::{PrintFilamentInput, PrintInput};

    fn conn() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        migrate(&mut c).unwrap();
        c
    }

    fn filament(c: &Connection, price: Option<f64>, threshold: f64) -> i64 {
        filaments::create(
            c,
            FilamentInput {
                brand_id: 1,
                material_id: 7,
                color_name: "Blanco".into(),
                color_hex: None,
                diameter_mm: 1.75,
                initial_weight_g: 1000.0,
                low_stock_threshold_g: threshold,
                price,
                currency: "ARS".into(),
                purchased_at: None,
            },
        )
        .unwrap()
        .id
    }

    fn planned_print(c: &Connection, filament_id: i64, grams: f64) {
        let input = PrintInput {
            name: "Llavero".into(),
            description: None,
            filaments: vec![PrintFilamentInput { filament_id, grams_estimated: grams }],
        };
        prints::create(c, input, "planned", vec![]).unwrap();
    }

    #[test]
    fn totals_reserved_free_and_value_skip_archived() {
        let c = conn();
        let priced = filament(&c, Some(10000.0), 0.0);
        filament(&c, None, 0.0);
        let archived = filament(&c, Some(5000.0), 0.0);
        filaments::set_archived(&c, archived, true).unwrap();
        planned_print(&c, priced, 200.0);

        let s = summary(&c).unwrap().stock;
        assert_eq!(s.remaining_g, 2000.0);
        assert_eq!(s.reserved_g, 200.0);
        assert_eq!(s.free_g, 1800.0);
        assert_eq!(s.value, vec![CurrencyValue { currency: "ARS".into(), value: 10000.0 }]);
    }

    fn consume(c: &Connection, filament_id: i64, grams: f64) {
        let input = PrintInput {
            name: "Pieza".into(),
            description: None,
            filaments: vec![PrintFilamentInput { filament_id, grams_estimated: grams }],
        };
        let used = vec![prints::GramsUsedInput { filament_id, grams_used: grams }];
        prints::create(c, input, "completed", used).unwrap();
    }

    #[test]
    fn low_stock_lists_only_active_under_threshold_sorted_by_remaining() {
        let c = conn();
        let plenty = filament(&c, None, 100.0);
        let low = filament(&c, None, 500.0);
        let lower = filament(&c, None, 100.0);
        let archived_low = filament(&c, None, 100.0);
        consume(&c, plenty, 100.0); // 900 g, sobre el umbral
        consume(&c, low, 950.0); // 50 g, bajo 500
        consume(&c, lower, 980.0); // 20 g, bajo 100
        consume(&c, archived_low, 960.0); // 40 g, pero archivado
        filaments::set_archived(&c, archived_low, true).unwrap();

        let alerts = summary(&c).unwrap().low_stock;
        let ids: Vec<i64> = alerts.iter().map(|f| f.id).collect();
        assert_eq!(ids, vec![lower, low]);
    }

    #[test]
    fn recent_prints_are_capped_and_newest_first() {
        let c = conn();
        let f = filament(&c, None, 0.0);
        for _ in 0..6 {
            planned_print(&c, f, 10.0);
        }
        let recent = summary(&c).unwrap().recent_prints;
        assert_eq!(recent.len(), RECENT_PRINTS);
        assert!(recent[0].id > recent[1].id);
    }
}
