# Tarita — plan de desarrollo

App de escritorio para macOS que lleva el stock de filamentos para impresión 3D y el
consumo por impresión. Es independiente de 2cents (repositorio, base de datos e
identificador propios), pero comparte el mismo estilo visual y la misma arquitectura base.

## 1. Decisiones de arquitectura

| Tema | 2cents (referencia) | Tarita (propuesta) | Motivo |
|---|---|---|---|
| Shell | Tauri 2 + React + TS + Vite, pnpm | Igual | Mismo stack, mismo tooling |
| Estilos | CSS modules + `styles/tokens.css` | Igual (copiar tokens, no Tailwind) | Mismo aspecto. Tailwind + shadcn cambiarían el look y sumarían un stack nuevo |
| Fuente | Outfit empaquetada | Igual | Ver `design.md` de 2cents |
| Tema claro/oscuro | `lib/theme.ts` | Copiar | Mismo comportamiento |
| Acceso a datos | `plugin-sql` desde TS | **Comandos Rust** con `rusqlite` (feature `bundled`) | La lógica de stock queda en un solo lugar, con transacciones y tests unitarios |
| Tipos TS ↔ Rust | Manual | `tauri-specta` (verificar que la versión sea estable antes de adoptarla) | Evita duplicar modelos |
| Migraciones | Archivos `.sql` con `include_str!` | Igual, versionadas con `PRAGMA user_version` | Sin dependencias extra |
| Estado en UI | Contexto propio (`ctx.tsx`) | TanStack Query | Invalida el stock automáticamente al registrar impresiones |
| Gráficos | Recharts | Recharts | Ya usado en 2cents |

### Independencia respecto de 2cents

- `productName`: `Tarita`. Identificador: `com.macatapichon.tarita`.
- Puerto de Vite: **1421** (2cents usa 1420), con `strictPort: true`. Así ambas apps
  pueden correr en desarrollo al mismo tiempo.
- Base de datos en el directorio de datos de la app
  (`~/Library/Application Support/com.macatapichon.tarita/tarita.db`).
- Los tokens y el tema se **copian**, no se comparten como paquete. Así cada repo es
  autocontenido.

## 2. Modelo de datos

### 2.1 Esquema inicial (migración `001_init.sql`)

```sql
CREATE TABLE brands (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,                     -- Bambu Lab, Creality...
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE materials (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,                            -- PLA, PETG, ASA...
  variant    TEXT,                                     -- Basic, High Speed, Silk... (nullable)
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  -- índice único: (name, COALESCE(variant,'')) para que las variantes NULL no se dupliquen
);

CREATE TABLE filaments (
  id                    INTEGER PRIMARY KEY,
  brand_id              INTEGER NOT NULL REFERENCES brands(id),
  material_id           INTEGER NOT NULL REFERENCES materials(id),
  color_name            TEXT NOT NULL,                 -- White
  color_hex             TEXT,
  diameter_mm           REAL NOT NULL DEFAULT 1.75 CHECK (diameter_mm IN (1.75, 2.85)),
  initial_weight_g      REAL NOT NULL DEFAULT 1000 CHECK (initial_weight_g > 0),
  price                 REAL CHECK (price IS NULL OR price >= 0),  -- precio POR CARRETE
  currency              TEXT NOT NULL DEFAULT 'ARS' CHECK (currency IN ('ARS', 'USD')),
  purchased_at          TEXT,
  archived              INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE prints (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL CHECK (status IN
                ('planned', 'printing', 'completed', 'failed', 'cancelled')),
  created_at  TEXT NOT NULL,
  started_at  TEXT,
  finished_at TEXT,
  updated_at  TEXT NOT NULL
);

CREATE TABLE print_filaments (
  print_id        INTEGER NOT NULL REFERENCES prints(id) ON DELETE CASCADE,
  filament_id     INTEGER NOT NULL REFERENCES filaments(id),
  grams_used      REAL CHECK (grams_used IS NULL OR grams_used >= 0),
  PRIMARY KEY (print_id, filament_id)
);

CREATE TABLE stock_adjustments (
  id          INTEGER PRIMARY KEY,
  filament_id INTEGER NOT NULL REFERENCES filaments(id),
  grams_delta REAL NOT NULL CHECK (grams_delta <> 0),
  reason      TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_print_filaments_filament ON print_filaments(filament_id);
CREATE INDEX idx_stock_adjustments_filament ON stock_adjustments(filament_id);
```

Cambios respecto del MVP:

- `print_filaments` tiene `grams_used` por filamento (NULL mientras la impresión no esté cerrada).
  Así una impresión puede usar varios carretes y cada uno descuenta lo suyo.
- `brand` y `material` pasan a ser tablas propias (`brands`, `materials`) con ABM. Un
  material tiene `variant` opcional, así "PLA" + "High Speed" es una sola entrada del
  catálogo.
- `filaments` suma `diameter_mm` (default 1.75), `initial_weight_g` con default 1000,
  `currency` (default ARS) y timestamps. Se quitó la tara del carrete: se compra por kilo
  y no se pesa con carrete.
- `prints` suma `started_at` y `updated_at`.
- Las fechas son TEXT en ISO 8601 UTC.

**Seed de la migración `001_init.sql`** (datos iniciales, editables desde la UI):

- Marcas: Bambu Lab, Creality, Elegoo, Toolbox, Fremover.
- Materiales: PLA (variantes Basic, Plus, High Speed, Silk, Matte, Tough), PETG, ASA, ABS,
  PC, TPU, PA (nailon), PVA, PEBA.

### 2.2 Reglas de negocio

**Máquina de estados de una impresión.** Las transiciones válidas son:

- `planned` → `printing`, `completed`, `failed` o `cancelled`
- `printing` → `completed`, `failed` o `cancelled`
- `completed`, `failed` y `cancelled` son terminales.

Permitir saltar de `planned` a `completed` evita que el usuario tenga que marcar
"imprimiendo" si no lo registró. Los estados terminales no se reabren. Si hubo un error,
se corrige con un ajuste de stock.

**Consumo al cerrar la impresión:**

- `completed` y `failed`: el usuario **debe** ingresar `grams_used` para cada filamento.
- `planned` y `printing`: no descuentan nada.
- `cancelled`: no descuenta nada. `grams_used` queda en NULL.

**Fórmulas (siempre calculadas, nunca guardadas):**

```
consumido(f)  = Σ grams_used   de impresiones completed/failed
ajustes(f)    = Σ grams_delta  de stock_adjustments
restante(f)   = initial_weight_g − consumido(f) + ajustes(f)
```

- Como todo se deriva de las tablas, revertir un estado no deja stock inconsistente.

**Ajustes:** se usan para corregir pesando el carrete. El usuario ingresa el peso neto
(solo plástico) y la app calcula el delta (`neto − restante`) y lo guarda como ajuste.

**Residuo:** acción sobre filamentos activos. El usuario ingresa los gramos descartados y la app
guarda un ajuste con `grams_delta = −gramos` y motivo "Residuo". Debe ser mayor a 0 y finito.
Ver sección 3.

**Edición y eliminación:** cualquier impresión se puede editar y eliminar, en cualquier
estado. Al editar una completed o failed, se deben indicar los gramos de cada filamento,
igual que al crear. Eliminar una impresión que descontaba stock devuelve sus gramos al
filamento. Los filamentos se archivan, nunca se borran si tienen historial.

**Precio:** `price` es el precio por carrete, en `currency` (ARS por defecto, o USD). El
costo por gramo es
`price / initial_weight_g` y el costo de una impresión es la suma de
`grams_used × costo por gramo` de cada filamento. Se muestra en el detalle, no es
obligatorio cargarlo.

## 3. Etapas

Cada etapa termina con verificación: tests de Rust donde hay lógica, `pnpm build` y prueba
manual con `pnpm tauri dev`.

### Etapa 0 — Base

- Crear el proyecto con `pnpm create tauri-app` (plantilla React + TypeScript) y ajustar
  nombre, identificador, puerto 1421 y `strictPort`.
- Copiar `styles/tokens.css`, `lib/theme.ts`, `lib/useTheme.ts` y la fuente Outfit desde
  2cents. Ver [design.md](../../2cents/docs/design.md) como referencia.
- Módulo `db.rs`: abre la base en el directorio de datos, activa `PRAGMA foreign_keys = ON`
  y aplica migraciones según `PRAGMA user_version`.
- Migración `001_init.sql` con el esquema de la sección 2.1.
- Shell visual: sidebar y header igual que 2cents, con las secciones Dashboard, Filamentos
  e Impresiones.

**Verificación:** `cargo test` (la migración corre sobre una base en memoria), la ventana
abre y el archivo `tarita.db` se crea.

### Etapa 1 — Catálogos y filamentos

- **ABM de marcas y materiales** (`brands.rs`, `materials.rs`). Alta, edición y archivado.
  Una marca o material archivado no aparece en los selectores, pero los filamentos
  existentes lo conservan. No se borran si tienen uso.
- Comandos: `list_brands`, `save_brand`, `set_brand_archived`, `list_materials`,
  `save_material`, `set_material_archived`, `list_filaments`, `create_filament`,
  `update_filament`, `set_filament_archived`.
- **Alta de filamento:**
  - Marca y material se eligen de los catálogos.
  - Diámetro: selector con 1.75 mm por defecto (2.85 mm disponible).
  - Peso inicial: 1000 g por defecto, editable.
  - Precio: primero el selector de moneda (ARS por defecto), después el importe.
- Lista: swatch de color, marca, material y variante, y barra con `restante`. Filtro para
  mostrar archivados.
- Validaciones: `initial_weight_g > 0`, marca, material y color obligatorios, `price ≥ 0`.

**Verificación:** test de `restante` con y sin ajustes; test de que el seed inicial carga
las marcas y materiales esperados; prueba manual de alta, edición, archivado y de los
selectores.

**Estado (implementada):** comandos en `src-tauri/src/commands.rs`, lógica en `catalog.rs` y
`filaments.rs`, UI en `src/pages/`. Desvíos respecto del plan:
- Las marcas son únicas sin distinguir mayúsculas (migración `002_brands_nocase.sql`).
- Sin TanStack Query por ahora: los datos se cargan con el hook `src/lib/useLoad.ts`. Se
  puede adoptar cuando las impresiones necesiten invalidación cruzada.
- Sin tauri-specta: los tipos de `src/lib/api.ts` se escriben a mano.

### Etapa 2 — Impresiones

- Comandos: `list_prints`, `get_print`, `create_print`, `update_print`, `change_print_status`,
  `delete_print` (solo planned).
- Formulario: nombre, descripción, y una o más filas de filamento. Al crear como completed
  o failed, cada fila pide sus gramos usados.
- Cambio de estado: al completar o fallar, `grams_used` es obligatorio por filamento.
- Todo cambio de estado corre en una transacción.

**Verificación:** tests de Rust que cubran la máquina de estados (transiciones válidas e
inválidas) y la tabla de casos de stock: planned no descuenta, printing no descuenta,
completed descuenta, failed descuenta `grams_used`, cancelled no descuenta, un
filamento repetido en la misma impresión se rechaza, y el ajuste positivo y negativo.

**Estado (implementada):** lógica en `src-tauri/src/prints.rs`, comandos en `commands.rs`,
UI en `src/pages/PrintsPage.tsx`. Desvíos respecto del plan:
- Sin `get_print`: `list_prints` ya devuelve el detalle completo de cada impresión.
- Se puede crear una impresión directamente en cualquier estado. Al crear como completed o
  failed se pasan los `grams_used` en el mismo comando (`create_print`).
- El costo por moneda se muestra en el detalle (`PrintDetailModal`), no en la lista.
- Los tests cubren la lógica; la UI se verificó con `pnpm build` y el arranque de `tauri dev`.

### Etapa 3 — Dashboard

- Stock total en gramos y en valor (si hay precio), con `restante`.
- Impresiones recientes (últimas 5) con estado.
- Usa Recharts solo si aporta (por ejemplo, consumo por mes). Si no, no se agrega.
- **Reporte de costos (implementado):** `cost_report(year, month?)` en `src-tauri/src/reports.rs`,
  página `src/pages/DashboardPage.tsx`. Por período (mes o año completo) muestra
  *invertido* (precio de carretes con `purchased_at` en el período) y *gastado*
  (gramos usados × precio / peso inicial, de impresiones completed/failed con `finished_at` en
  el período, en hora local). Totales por moneda, sin sumar monedas distintas. Los carretes sin
  `purchased_at` no entran en "invertido". El gasto usa el precio actual del carrete.

- **Stock, impresiones recientes (implementado):** `dashboard::summary` en
  `src-tauri/src/dashboard.rs`, comando `dashboard_summary`. Muestra restante en gramos, valor
  por moneda y las últimas 5 impresiones. No hay reservas ni alertas de stock bajo: se
  descartaron a pedido del usuario y se quitaron de la base (migración `003`).
- **Residuo:** `dashboard::waste` suma los gramos de ajustes con motivo "Residuo" y su valor
  por moneda (mismo criterio de precio que el stock), incluidos filamentos archivados.

**Verificación:** tests de totales, valor y recientes en `dashboard.rs`;
tests del reporte de costos en `reports.rs` (período, estados, monedas, mes inválido).

### Etapa 4 — Pulido y distribución (sugerida, no pedida)

- Pesaje: pantalla para ingresar el peso neto del filamento restante. La app calcula el
  delta y crea el ajuste.
- Exportar a CSV: impresiones y movimientos de stock.
- Build para Mac: `pnpm tauri build` genera `.app` y `.dmg`. Icono propio en
  `src-tauri/icons/`.

## 4. Estructura propuesta

```
tarita/
├── docs/plan.md
├── package.json              (pnpm, mismo stack que 2cents)
├── vite.config.ts            (puerto 1421, strictPort)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/                  bindings generados (tauri-specta) + wrappers de TanStack Query
│   ├── views/                Dashboard, Filaments, Prints, Catalogs (marcas y materiales)
│   ├── components/
│   ├── lib/                  format, theme, useTheme
│   └── styles/tokens.css     copiado de 2cents
└── src-tauri/
    ├── migrations/001_init.sql
    └── src/
        ├── lib.rs
        ├── db.rs             conexión y migraciones
        ├── error.rs
        ├── stock.rs          fórmulas puras, con tests unitarios
        ├── prints.rs         máquina de estados
        └── commands/         brands.rs, materials.rs, filaments.rs, prints.rs, stock.rs, dashboard.rs
```

La lógica de `stock.rs` y de la máquina de estados se escribe como funciones puras para
poder testearla sin levantar la app.

## 5. Decisiones confirmadas

- **Moneda:** ARS y USD. Selector de moneda (ARS por defecto) antes del importe.
- **Estilos:** CSS modules + tokens de 2cents.
- **Pesaje:** siempre peso neto. Sin tara del carrete.
- **Multi-filamento:** sí, una impresión puede usar varios filamentos (tabla
  `print_filaments`). No se registra el slot del AMS.
- **Links de modelos:** no se guardan.
- **Defaults de alta:** diámetro 1.75 mm, peso 1000 g, moneda ARS.

## 6. Preguntas abiertas

Ninguna por ahora.
