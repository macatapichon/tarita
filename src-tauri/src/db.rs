use rusqlite::Connection;
use std::path::Path;

const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../migrations/001_init.sql")),
    (2, include_str!("../migrations/002_brands_nocase.sql")),
];

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(e))
        })?;
    }
    let mut conn = Connection::open(path)?;
    migrate(&mut conn)?;
    Ok(conn)
}

pub fn migrate(conn: &mut Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "foreign_keys", true)?;
    let current: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    for (version, sql) in MIGRATIONS.iter().filter(|(v, _)| *v > current) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", version)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_and_seeds_catalogs() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();

        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, 2);

        let brands: i64 = conn.query_row("SELECT COUNT(*) FROM brands", [], |r| r.get(0)).unwrap();
        assert_eq!(brands, 5);

        let pla: i64 = conn
            .query_row("SELECT COUNT(*) FROM materials WHERE name = 'PLA'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(pla, 6);
    }

    #[test]
    fn migrating_twice_is_a_no_op() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        migrate(&mut conn).unwrap();
        let brands: i64 = conn.query_row("SELECT COUNT(*) FROM brands", [], |r| r.get(0)).unwrap();
        assert_eq!(brands, 5);
    }

    #[test]
    fn rejects_duplicate_material_variant() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        let dup = conn.execute("INSERT INTO materials (name, variant) VALUES ('PETG', NULL)", []);
        assert!(dup.is_err());
    }
}
