CREATE TABLE brands (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE materials (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  variant    TEXT,
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX ux_materials_name_variant ON materials(name, COALESCE(variant, ''));

CREATE TABLE filaments (
  id                    INTEGER PRIMARY KEY,
  brand_id              INTEGER NOT NULL REFERENCES brands(id),
  material_id           INTEGER NOT NULL REFERENCES materials(id),
  color_name            TEXT NOT NULL,
  color_hex             TEXT,
  diameter_mm           REAL NOT NULL DEFAULT 1.75 CHECK (diameter_mm IN (1.75, 2.85)),
  initial_weight_g      REAL NOT NULL DEFAULT 1000 CHECK (initial_weight_g > 0),
  low_stock_threshold_g REAL NOT NULL DEFAULT 100,
  price                 REAL CHECK (price IS NULL OR price >= 0),
  currency              TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  purchased_at          TEXT,
  archived              INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE prints (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL CHECK (status IN
                ('planned', 'printing', 'completed', 'failed', 'cancelled')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at  TEXT,
  finished_at TEXT,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE print_filaments (
  print_id        INTEGER NOT NULL REFERENCES prints(id) ON DELETE CASCADE,
  filament_id     INTEGER NOT NULL REFERENCES filaments(id),
  grams_estimated REAL NOT NULL CHECK (grams_estimated > 0),
  grams_used      REAL CHECK (grams_used IS NULL OR grams_used >= 0),
  PRIMARY KEY (print_id, filament_id)
);

CREATE TABLE stock_adjustments (
  id          INTEGER PRIMARY KEY,
  filament_id INTEGER NOT NULL REFERENCES filaments(id),
  grams_delta REAL NOT NULL CHECK (grams_delta <> 0),
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_filaments_brand ON filaments(brand_id);
CREATE INDEX idx_filaments_material ON filaments(material_id);
CREATE INDEX idx_print_filaments_filament ON print_filaments(filament_id);
CREATE INDEX idx_stock_adjustments_filament ON stock_adjustments(filament_id);

INSERT INTO brands (name) VALUES
  ('Bambu Lab'), ('Creality'), ('Elegoo'), ('Toolbox'), ('Fremover');

INSERT INTO materials (name, variant) VALUES
  ('PLA', 'Basic'), ('PLA', 'Plus'), ('PLA', 'High Speed'),
  ('PLA', 'Silk'), ('PLA', 'Matte'), ('PLA', 'Tough'),
  ('PETG', NULL), ('ASA', NULL), ('ABS', NULL), ('PC', NULL),
  ('TPU', NULL), ('PA', NULL), ('PVA', NULL), ('PEBA', NULL);
