#!/bin/bash
# Builds a Windows update package (new_version\ contents) from the current
# project tree, for the Windows one-click updater (Update_System.bat).
#
# This is a Mac-side packaging convenience only - it never touches the
# Windows machine. Run it, then copy the resulting folder's CONTENTS into
# new_version\ on the school's Windows PC (see 更新说明.txt), or zip it and
# send the zip.
#
# Deliberately simple (cp + explicit include list), not templated/configurable
# beyond the include list below - see the "不要过度设计" instruction this was
# built under. If the project's file layout changes, update INCLUDE_PATHS.

set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(node -e "console.log(require('./package.json').version)")
OUT_DIR="Windows_Update_v${VERSION}"
ZIP_NAME="Merentas_Desa_Update_v${VERSION}.zip"

# What a Windows update package must contain to run the app - source code and
# the one binary asset (the PDF template) it depends on. Everything else
# (data/backup/logs/node_modules/.git/docs/scratch files) is deliberately
# left out - see the exclude reasoning in Update_System.bat's own EXCLUDE_DIRS
# comment for why some of these would be actively dangerous to ship.
INCLUDE_PATHS=(
  public
  routes
  lib
  templates
  server.js
  package.json
  package-lock.json
  CHANGELOG.md
)

echo "============================================================"
echo "  Merentas Desa - Prepare Windows Update Package"
echo "============================================================"
echo "Version:  $VERSION"
echo "Output:   $OUT_DIR/"
echo

# Refuse to silently merge into a leftover folder from a previous run - an
# old, partially-different version sitting underneath would defeat the whole
# point of a clean package.
if [ -e "$OUT_DIR" ]; then
  echo "[ERROR] $OUT_DIR already exists. Remove or rename it first, then re-run."
  echo "        (Not deleting it automatically - it might not be what you think it is.)"
  exit 1
fi

mkdir "$OUT_DIR"

MISSING=0
for item in "${INCLUDE_PATHS[@]}"; do
  if [ ! -e "$item" ]; then
    echo "[ERROR] Expected file/folder not found: $item"
    MISSING=1
    continue
  fi
  cp -R "$item" "$OUT_DIR/$item"
  echo "  copied: $item"
done

if [ "$MISSING" -ne 0 ]; then
  echo
  echo "[ERROR] One or more expected files were missing - package is incomplete."
  echo "        Removing incomplete $OUT_DIR so it can't be shipped by mistake."
  rm -rf "$OUT_DIR"
  exit 1
fi

# Defense in depth: even though INCLUDE_PATHS is a strict allow-list (nothing
# outside it gets copied in the first place), explicitly verify none of the
# things that must NEVER ship ended up in the package - guards against a
# future edit to INCLUDE_PATHS accidentally adding one of these.
echo
echo "Verifying nothing sensitive made it into the package..."
FORBIDDEN=(data backup logs node_modules .git .DS_Store .env)
FOUND_FORBIDDEN=0
for f in "${FORBIDDEN[@]}"; do
  if [ -e "$OUT_DIR/$f" ]; then
    echo "  [ERROR] Forbidden path present: $OUT_DIR/$f"
    FOUND_FORBIDDEN=1
  fi
done
if find "$OUT_DIR" -iname "*.pdf" -not -path "*/templates/*" | grep -q .; then
  echo "  [ERROR] Unexpected generated PDF found outside templates/"
  FOUND_FORBIDDEN=1
fi
if [ "$FOUND_FORBIDDEN" -ne 0 ]; then
  echo
  echo "[ERROR] Package failed the safety check - removing $OUT_DIR."
  rm -rf "$OUT_DIR"
  exit 1
fi
echo "  OK - no data/backup/logs/node_modules/.git/.env/stray PDFs present."

# Sanity check the one binary asset this whole feature depends on.
TEMPLATE="$OUT_DIR/templates/borang-pengakuan.pdf"
if [ ! -f "$TEMPLATE" ]; then
  echo
  echo "[ERROR] templates/borang-pengakuan.pdf missing from package - Document"
  echo "        Generator would fail on Windows. Removing $OUT_DIR."
  rm -rf "$OUT_DIR"
  exit 1
fi
echo "  OK - templates/borang-pengakuan.pdf present ($(wc -c < "$TEMPLATE" | tr -d ' ') bytes)."

echo
echo "Package version declared in package.json: $VERSION"
echo "Package version declared in server.js's SYSTEM_VERSION (lib/config.js):"
grep -o "SYSTEM_VERSION = '[^']*'" lib/config.js | sed "s/^/  /"

echo
read -r -p "Also create a zip ($ZIP_NAME)? [y/N] " MAKE_ZIP
if [[ "$MAKE_ZIP" =~ ^[Yy]$ ]]; then
  if [ -e "$ZIP_NAME" ]; then
    echo "[ERROR] $ZIP_NAME already exists - not overwriting. Remove it first if you want a fresh zip."
  else
    # -X: no extended attrs/resource forks (avoids macOS ._* junk files ending
    # up in the zip that Windows Explorer would otherwise show).
    zip -rq -X "$ZIP_NAME" "$OUT_DIR"
    echo "  Created: $ZIP_NAME ($(du -h "$ZIP_NAME" | cut -f1))"
  fi
fi

echo
echo "============================================================"
echo "  PACKAGE READY"
echo "============================================================"
echo "Folder: $OUT_DIR/"
[ -e "$ZIP_NAME" ] && echo "Zip:    $ZIP_NAME"
echo
echo "Next step on the Windows machine:"
echo "  Copy the CONTENTS of $OUT_DIR/ (not the folder itself) into:"
echo "    <school's merentas-desa folder>\\new_version\\"
echo "  Then double-click Update_System.bat."
echo
