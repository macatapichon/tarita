# Tarita

App de escritorio (macOS) para controlar el stock de filamento de impresión 3D y el consumo de cada impresión.
Sabe cuántos gramos quedan de cada carrete y cuánto costó cada impresión. Todos los datos quedan locales, en una base SQLite.

- **Stack:** [Tauri 2](https://tauri.app) (Rust) + React + TypeScript + Vite.
- **Base de datos:** SQLite vía `rusqlite`, con la lógica de stock en Rust. Migraciones en [src-tauri/migrations/](src-tauri/migrations).
- **Plan y etapas:** [docs/plan.md](docs/plan.md).
- **Gestor de paquetes:** `pnpm`.

## Conceptos

- **Filamento:** un carrete con marca, material, color, diámetro, peso inicial (1000 g por defecto) y precio opcional.
- **Impresión:** usa uno o varios filamentos, con los gramos de cada uno. Puede crearse, editarse y eliminarse en cualquier estado.
- **Estados:** `planned` y `printing` no descuentan. `completed` y `failed` descuentan los gramos
  usados que se ingresan para cada filamento. `cancelled` no descuenta.
- **Gramos restantes** = peso inicial − gramos de impresiones `completed` o `failed` ± ajustes de stock.
  Los ajustes sirven para corregir el valor pesando el carrete. Nada se guarda como total: todo se calcula desde los movimientos.
- **Residuo:** el botón de cada filamento activo registra gramos descartados (los que la impresora no toma y usás para otra cosa). Se guarda como un ajuste negativo con motivo "Residuo" y descuenta del stock.
- **Catálogo:** marcas (Bambu Lab, Creality, Elegoo, Toolbox, Fremover) y materiales (PLA y variantes, PETG, ASA, ABS, PC,
  TPU, PA, PVA, PEBA) vienen precargados. Se pueden agregar, editar y archivar.

## Requisitos

| Herramienta | Para qué | Instalación |
|-------------|----------|-------------|
| Node.js + pnpm | Frontend | `brew install node pnpm` |
| Rust (rustup + cargo) | Compilar la parte nativa de Tauri | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Xcode Command Line Tools | Linker/compilador en macOS | `xcode-select --install` |

Después de clonar: `pnpm install`.

## Entorno de desarrollo

### Con Cargo (app de escritorio completa) — lo habitual

```bash
pnpm tauri dev
```

Levanta Vite en `http://localhost:1421` (puerto fijo, `strictPort`) y compila/abre la ventana nativa. Es el único modo
donde funciona la base de datos, porque los comandos de Rust solo existen dentro de Tauri. Hay hot reload del frontend;
si cambiás código Rust (`src-tauri/src`) se recompila y reinicia solo.

La primera ejecución tarda varios minutos porque compila todas las dependencias de Rust. Las siguientes son rápidas.

**Si `cargo` no se encuentra** (`failed to run 'cargo metadata'` / `cargo: command not found`), hay que cargarlo en la
shell. rustup agrega `~/.cargo/bin` al PATH, pero una terminal o un IDE que no lea tu perfil no lo ve:

```bash
. "$HOME/.cargo/env"     # carga cargo en la shell actual
pnpm tauri dev
```

### Puertos

Tarita usa el **1421** y 2cents el **1420**, así que podés correr las dos apps a la vez.

> No corras `pnpm dev` solo: levanta Vite sin Rust, sin ventana y **sin base de datos**, así que las vistas no
> cargan datos. Usá `pnpm tauri dev`.

### Verificaciones

```bash
npx tsc --noEmit -p .                    # tipos de TypeScript
cd src-tauri && cargo test               # tests de la lógica de stock, impresiones y reportes
```

## Generar la app productiva

```bash
pnpm tauri build
```

Ejecuta `pnpm build` (`tsc` + `vite build` → `dist/`), compila Rust en modo release y empaqueta. Resultado en
`src-tauri/target/release/bundle/`:

| Archivo | Uso |
|---------|-----|
| `macos/tarita.app` | La app. Se copia a `/Applications`. |
| `dmg/tarita_<versión>_aarch64.dmg` | Instalador para Apple Silicon. |

- Con la app instalada **no hace falta** `pnpm tauri dev`.
- Para actualizar: cambiás el código, corrés `pnpm tauri build` otra vez y reemplazás el `.app` en `/Applications`
  (cerrá la app antes). Los datos no se tocan.
- La app **no está firmada ni notarizada**. La primera vez macOS puede bloquearla: clic derecho → Abrir (o
  Ajustes del Sistema → Privacidad y seguridad → Abrir de todos modos).
- Targets y versión se configuran en [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) (`bundle.targets`, `version`).

## Base de datos

**Ubicación** (la misma para `tauri dev` y para la app instalada):

```
~/Library/Application Support/com.macatapichon.tarita/tarita.db
```

Está fuera del proyecto y del `.app`, así que **`pnpm tauri build`, reinstalar o reemplazar la app no tocan los datos**.
`tauri dev` y la app instalada **comparten** la misma base.

### Qué NO cambiar

- El `identifier` (`com.macatapichon.tarita`) en `tauri.conf.json`: define la carpeta de datos.
- El nombre de la base `tarita.db`, en `src-tauri/src/lib.rs`.

Si se cambia alguno, la app crea una base nueva y vacía (los datos viejos siguen en la carpeta anterior).

### Migraciones

- Cada `src-tauri/migrations/NNN_nombre.sql` se registra en la constante `MIGRATIONS` de [src-tauri/src/db.rs](src-tauri/src/db.rs)
  con su número de versión. Se aplican al abrir la app, en orden, y solo las que faltan (control con `PRAGMA user_version`).
- **Nunca edites una migración ya aplicada**: la base de cada máquina ya la tiene registrada y el cambio no se aplica.
  Los cambios de esquema van en una migración nueva con el siguiente número.
- Cuidado con migraciones que borran o recrean tablas o columnas (`DROP COLUMN`, `DROP TABLE`): pueden perder datos.
  Hacé una copia de la base antes.
- Datos iniciales: marcas y materiales precargados, en `001_init.sql`. La `002_brands_nocase.sql` hace que los nombres de
  marca no distingan mayúsculas.

### Ver la base en un editor

El `.db` se abre con cualquier cliente SQLite:

- [DB Browser for SQLite](https://sqlitebrowser.org): `brew install --cask db-browser-for-sqlite`
- TablePlus, DBeaver o la extensión *SQLite Viewer* de VS Code.
- Terminal: `sqlite3 archivo.db ".tables"`

Abrí una **copia**, no la base real mientras la app está corriendo (evita bloqueos y ediciones accidentales).

## Estructura

- `src-tauri/src/`: lógica de negocio en Rust (`filaments.rs`, `prints.rs`, `reports.rs`), acceso a datos (`db.rs`) y
  comandos expuestos a la UI (`commands.rs`).
- `src/`: interfaz en React. `pages/` tiene una página por sección, `components/ui/` los componentes compartidos y
  `lib/api.ts` los tipos y las llamadas a los comandos.

