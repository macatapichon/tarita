use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Brand {
    pub id: i64,
    pub name: String,
    pub archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Material {
    pub id: i64,
    pub name: String,
    pub variant: Option<String>,
    pub archived: bool,
}

pub fn clean_text(value: &str, what: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{what} es obligatorio"));
    }
    Ok(trimmed.to_string())
}

pub fn map_unique_error(err: rusqlite::Error, message: &str) -> String {
    if err.to_string().contains("UNIQUE") {
        message.to_string()
    } else {
        err.to_string()
    }
}

pub fn list_brands(conn: &Connection, include_archived: bool) -> Result<Vec<Brand>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, archived FROM brands
             WHERE (?1 = 1 OR archived = 0) ORDER BY name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![include_archived], |r| {
            Ok(Brand { id: r.get(0)?, name: r.get(1)?, archived: r.get::<_, i64>(2)? == 1 })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

pub fn save_brand(conn: &Connection, id: Option<i64>, name: &str) -> Result<Brand, String> {
    let name = clean_text(name, "El nombre de la marca")?;
    let message = "Ya existe una marca con ese nombre";
    match id {
        Some(id) => {
            conn.execute("UPDATE brands SET name = ?1 WHERE id = ?2", params![name, id])
                .map_err(|e| map_unique_error(e, message))?;
            get_brand(conn, id)
        }
        None => {
            conn.execute("INSERT INTO brands (name) VALUES (?1)", params![name])
                .map_err(|e| map_unique_error(e, message))?;
            get_brand(conn, conn.last_insert_rowid())
        }
    }
}

fn get_brand(conn: &Connection, id: i64) -> Result<Brand, String> {
    conn.query_row("SELECT id, name, archived FROM brands WHERE id = ?1", params![id], |r| {
        Ok(Brand { id: r.get(0)?, name: r.get(1)?, archived: r.get::<_, i64>(2)? == 1 })
    })
    .map_err(|e| e.to_string())
}

pub fn set_brand_archived(conn: &Connection, id: i64, archived: bool) -> Result<Brand, String> {
    conn.execute("UPDATE brands SET archived = ?1 WHERE id = ?2", params![archived, id])
        .map_err(|e| e.to_string())?;
    get_brand(conn, id)
}

pub fn list_materials(conn: &Connection, include_archived: bool) -> Result<Vec<Material>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, variant, archived FROM materials
             WHERE (?1 = 1 OR archived = 0) ORDER BY name COLLATE NOCASE, variant COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![include_archived], |r| {
            Ok(Material {
                id: r.get(0)?,
                name: r.get(1)?,
                variant: r.get(2)?,
                archived: r.get::<_, i64>(3)? == 1,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

pub fn save_material(
    conn: &Connection,
    id: Option<i64>,
    name: &str,
    variant: Option<&str>,
) -> Result<Material, String> {
    let name = clean_text(name, "El nombre del material")?;
    let variant = variant.map(str::trim).filter(|v| !v.is_empty()).map(str::to_string);
    let message = "Ya existe un material con ese nombre y variante";
    let target = match id {
        Some(id) => {
            conn.execute(
                "UPDATE materials SET name = ?1, variant = ?2 WHERE id = ?3",
                params![name, variant, id],
            )
            .map_err(|e| map_unique_error(e, message))?;
            id
        }
        None => {
            conn.execute(
                "INSERT INTO materials (name, variant) VALUES (?1, ?2)",
                params![name, variant],
            )
            .map_err(|e| map_unique_error(e, message))?;
            conn.last_insert_rowid()
        }
    };
    get_material(conn, target)
}

fn get_material(conn: &Connection, id: i64) -> Result<Material, String> {
    conn.query_row(
        "SELECT id, name, variant, archived FROM materials WHERE id = ?1",
        params![id],
        |r| {
            Ok(Material {
                id: r.get(0)?,
                name: r.get(1)?,
                variant: r.get(2)?,
                archived: r.get::<_, i64>(3)? == 1,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Material no encontrado".to_string())
}

pub fn set_material_archived(conn: &Connection, id: i64, archived: bool) -> Result<Material, String> {
    conn.execute("UPDATE materials SET archived = ?1 WHERE id = ?2", params![archived, id])
        .map_err(|e| e.to_string())?;
    get_material(conn, id)
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

    #[test]
    fn seeds_expected_brands_and_materials() {
        let c = conn();
        let brands: Vec<String> = list_brands(&c, false).unwrap().into_iter().map(|b| b.name).collect();
        assert!(brands.contains(&"Bambu Lab".to_string()));
        assert!(brands.contains(&"Fremover".to_string()));
        let materials = list_materials(&c, false).unwrap();
        assert!(materials.iter().any(|m| m.name == "PEBA"));
        assert_eq!(materials.iter().filter(|m| m.name == "PLA").count(), 6);
    }

    #[test]
    fn archived_brand_hidden_from_selectors_but_kept() {
        let c = conn();
        let bambu = list_brands(&c, false).unwrap().into_iter().find(|b| b.name == "Bambu Lab").unwrap();
        set_brand_archived(&c, bambu.id, true).unwrap();
        assert!(!list_brands(&c, false).unwrap().iter().any(|b| b.id == bambu.id));
        assert!(list_brands(&c, true).unwrap().iter().any(|b| b.id == bambu.id && b.archived));
    }

    #[test]
    fn rejects_duplicate_brand_and_blank_name() {
        let c = conn();
        assert_eq!(save_brand(&c, None, "creality").unwrap_err(), "Ya existe una marca con ese nombre");
        assert!(save_brand(&c, None, "   ").is_err());
    }

    #[test]
    fn material_variant_is_unique_including_null() {
        let c = conn();
        assert!(save_material(&c, None, "PETG", None).is_err());
        let pla = save_material(&c, None, "PLA", Some("  Glow  ")).unwrap();
        assert_eq!(pla.variant.as_deref(), Some("Glow"));
        assert!(save_material(&c, None, "PLA", Some("Glow")).is_err());
    }
}
