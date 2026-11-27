#!/usr/bin/env bash
# clean-cache.sh — limpia el cache de desarrollo de un proyecto Tauri/Rust.
#
# Copialo a la raíz del proyecto (donde está src-tauri/) y corré:
#   chmod +x clean-cache.sh
#   ./clean-cache.sh            # abre un menú interactivo
#   ./clean-cache.sh --help     # opciones para usar sin menú
#
# Funciona desde cualquier carpeta: se ubica según dónde está el script.
# Compatible con el bash 3.2 que trae macOS.

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$PROJECT_DIR/src-tauri/target"

DO_RELEASE=0
DO_FRONTEND=0
DRY_RUN=0
FORCE=0
FREED_KB=0

# Sin argumentos y en una terminal -> menú interactivo
INTERACTIVE=0
if [ "$#" -eq 0 ] && [ -t 0 ]; then
  INTERACTIVE=1
fi

usage() {
  cat <<'EOF'
Uso: ./clean-cache.sh [opciones]

Sin opciones y en una terminal, abre un menú interactivo.
Con opciones, corre directo (útil para scripts de package.json):

  --release       Borra también target/release (verifica antes que las .app
                  del bundle estén en /Applications y pide confirmación)
  --frontend      Borra también dist/ y node_modules/.vite
  --all           debug + release + frontend
  --dry-run       Solo muestra qué borraría y cuánto espacio libera
  --force         Salta la verificación de /Applications y la confirmación
  -h, --help      Muestra esta ayuda

Siempre se borra src-tauri/target/debug.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --release)  DO_RELEASE=1 ;;
    --frontend) DO_FRONTEND=1 ;;
    --all)      DO_RELEASE=1; DO_FRONTEND=1 ;;
    --dry-run)  DRY_RUN=1 ;;
    --force)    FORCE=1 ;;
    -h|--help)  usage; exit 0 ;;
    *)          echo "Opción desconocida: $arg"; echo; usage; exit 1 ;;
  esac
done

# Tamaño en KB (0 si no existe)
size_kb() {
  if [ -e "$1" ]; then
    du -sk "$1" 2>/dev/null | awk '{print $1}'
  else
    echo 0
  fi
}

# KB -> texto legible
human() {
  awk -v k="$1" 'BEGIN {
    if (k >= 1048576)   printf "%.1f GB", k / 1048576;
    else if (k >= 1024) printf "%.0f MB", k / 1024;
    else                printf "%d KB", k;
  }'
}

# Borra (o simula borrar) una ruta y acumula el espacio liberado
remove() {
  local path="$1" kb
  [ -e "$path" ] || return 0
  kb="$(size_kb "$path")"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] borraría ${path#$PROJECT_DIR/} ($(human "$kb"))"
  else
    rm -rf "$path"
    echo "  borrado ${path#$PROJECT_DIR/} ($(human "$kb"))"
  fi
  FREED_KB=$((FREED_KB + kb))
}

# Verifica que cada .app compilada exista también en Applications.
# Devuelve 1 si alguna falta.
check_apps() {
  local bundle="$TARGET_DIR/release/bundle/macos" missing=0 app name
  if [ -d "$bundle" ]; then
    for app in "$bundle"/*.app; do
      [ -e "$app" ] || continue
      name="$(basename "$app")"
      if [ -d "/Applications/$name" ] || [ -d "$HOME/Applications/$name" ]; then
        echo "  ✓ $name está en Applications"
      else
        echo "  ✗ $name NO está en Applications"
        missing=1
      fi
    done
  fi
  if [ -d "$TARGET_DIR/release/bundle/dmg" ]; then
    echo "  ℹ hay instaladores .dmg en release/bundle/dmg (también se borrarían)"
  fi
  return "$missing"
}

# Menú interactivo: define qué flags se activan según la opción elegida
show_menu() {
  local ans
  echo "¿Qué querés hacer?"
  echo
  echo "  1) Simular todo                                  (--all --dry-run)"
  echo "     Muestra qué se borraría y cuánto espacio libera."
  echo "     No borra nada."
  echo
  echo "  2) Limpieza segura: solo debug                   ~$(human "$DEBUG_KB")"
  echo "     Borra src-tauri/target/debug."
  echo "     No toca release ni tus .app."
  echo
  echo "  3) Debug + frontend                              ~$(human $((DEBUG_KB + FRONT_KB)))"
  echo "     Además borra dist/ y node_modules/.vite."
  echo
  echo "  4) Debug + release                               ~$(human $((DEBUG_KB + RELEASE_KB)))"
  echo "     Además borra target/release. Verifica que tus .app estén"
  echo "     en Applications y pide confirmación."
  echo
  echo "  5) Todo: debug + release + frontend              ~$(human $((DEBUG_KB + RELEASE_KB + FRONT_KB)))"
  echo "     Igual que la 4, más el frontend."
  echo
  echo "  q) Salir sin hacer nada"
  echo
  read -r -p "Opción [1-5/q]: " ans
  case "$ans" in
    1) DO_RELEASE=1; DO_FRONTEND=1; DRY_RUN=1 ;;
    2) ;;
    3) DO_FRONTEND=1 ;;
    4) DO_RELEASE=1 ;;
    5) DO_RELEASE=1; DO_FRONTEND=1 ;;
    q|Q|"") echo "Cancelado."; exit 0 ;;
    *) echo "Opción inválida: $ans"; exit 1 ;;
  esac
  echo
}

if [ ! -d "$TARGET_DIR" ]; then
  echo "No encontré $TARGET_DIR — nada que limpiar."
  exit 0
fi

DEBUG_KB="$(size_kb "$TARGET_DIR/debug")"
RELEASE_KB="$(size_kb "$TARGET_DIR/release")"
FRONT_KB=$(( $(size_kb "$PROJECT_DIR/dist") + $(size_kb "$PROJECT_DIR/node_modules/.vite") ))

echo "Proyecto: $(basename "$PROJECT_DIR")"
echo
echo "Tamaños actuales:"
[ ! -d "$TARGET_DIR/debug" ]   || printf "  target/debug     %s\n" "$(human "$DEBUG_KB")"
[ ! -d "$TARGET_DIR/release" ] || printf "  target/release   %s\n" "$(human "$RELEASE_KB")"
[ "$FRONT_KB" -eq 0 ]          || printf "  frontend (dist, .vite)  %s\n" "$(human "$FRONT_KB")"
echo

if [ "$INTERACTIVE" -eq 1 ]; then
  show_menu
fi

# Si se pidió release: verificar apps y confirmar antes de borrar nada
if [ "$DO_RELEASE" -eq 1 ] && [ -d "$TARGET_DIR/release" ]; then
  echo "Verificando .app compiladas:"
  if ! check_apps && [ "$FORCE" -eq 0 ]; then
    echo
    echo "Hay .app en target/release/bundle que no están en Applications."
    echo "Copialas primero o usá --force si no las necesitás."
    [ "$DRY_RUN" -eq 1 ] || exit 1
  fi
  if [ "$FORCE" -eq 0 ] && [ "$DRY_RUN" -eq 0 ]; then
    read -r -p "¿Borrar target/release? [s/N] " ans
    case "$ans" in
      s|S|si|SI|y|Y) ;;
      *) echo "Release omitido."; DO_RELEASE=0 ;;
    esac
  fi
  echo
fi

remove "$TARGET_DIR/debug"
[ "$DO_RELEASE" -eq 0 ] || remove "$TARGET_DIR/release"
if [ "$DO_FRONTEND" -eq 1 ]; then
  remove "$PROJECT_DIR/dist"
  remove "$PROJECT_DIR/node_modules/.vite"
fi

echo
if [ "$DRY_RUN" -eq 1 ]; then
  echo "Se liberarían ~$(human "$FREED_KB") (dry-run, no se borró nada)."
else
  echo "Listo. Liberado: ~$(human "$FREED_KB")."
fi
