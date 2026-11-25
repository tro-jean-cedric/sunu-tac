#!/usr/bin/env bash
# Build the native Windows package (no Docker on the server): one zip with an embedded Python, every Python
# dependency as Windows wheels, the backend, the built frontend and a Windows service wrapper.
#
#   ./build-windows-package.sh                       → dist-windows/sunu-tac-windows-<git-sha>.zip
#   BUILD_MODE=test-only ./build-windows-package.sh  → frontend without the HR console
#
# On the server: unzip, right-click install.cmd > Run as administrator (see windows-native/README.txt).
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$PWD

PY_VERSION=3.12.10
PY_URL="https://www.python.org/ftp/python/$PY_VERSION/python-$PY_VERSION-embed-amd64.zip"
PY_SHA256=4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3
WINSW_URL="https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe"
WINSW_SHA256=05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da
BUILD_MODE="${BUILD_MODE:-production}"   # production | test-only | console-only

VERSION="$(git rev-parse --short HEAD)"
[[ -n "$(git status --porcelain)" ]] && VERSION="$VERSION-dirty"
NAME="sunu-tac-windows-$VERSION"
CACHE="$ROOT/.cache/windows"
STAGE="$ROOT/dist-windows/$NAME"
PROG="$STAGE/program"

say() { echo "→ $*"; }
need() { command -v "$1" >/dev/null || { echo "✗ $1 is required"; exit 1; }; }
need uv; need npm; need zip; need curl

fetch() {  # fetch <url> <sha256> <file>
  local url=$1 sha=$2 out="$CACHE/$3"
  mkdir -p "$CACHE"
  [[ -f $out ]] || { say "downloading $(basename "$url")"; curl -fsSL "$url" -o "$out.part" && mv "$out.part" "$out"; }
  echo "$sha  $out" | shasum -a 256 -c --quiet - || { rm -f "$out"; echo "✗ checksum mismatch: $url"; exit 1; }
}

# The .ps1/.cmd files are run by Windows PowerShell 5.1, which misreads UTF-8 without BOM: keep them ASCII.
if LC_ALL=C grep -n '[^[:print:][:space:]]' windows-native/*.ps1 windows-native/*.cmd windows-native/README.txt; then
  echo "✗ non-ASCII characters in windows-native scripts (above)"; exit 1
fi

rm -rf "$STAGE" "$STAGE.zip"
mkdir -p "$PROG"

say "frontend ($BUILD_MODE)"
(cd frontend && npm ci --no-audit --no-fund --loglevel=error && npx vite build --mode "$BUILD_MODE" --logLevel warn)
cp -R frontend/dist "$PROG/web"

say "backend"
mkdir -p "$PROG/backend" "$PROG/shared"
cp -R backend/app backend/alembic backend/alembic.ini "$PROG/backend/"
cp shared/referentiel.json "$PROG/shared/"
find "$PROG/backend" -name __pycache__ -type d -prune -exec rm -rf {} +

say "embedded Python $PY_VERSION (Windows x64)"
fetch "$PY_URL" "$PY_SHA256" "python-$PY_VERSION-embed-amd64.zip"
mkdir -p "$PROG/python"
unzip -q "$CACHE/python-$PY_VERSION-embed-amd64.zip" -d "$PROG/python"
# sys.path of the embedded interpreter: stdlib zip, site-packages, and the backend sources
printf 'python312.zip\r\n.\r\nLib\\site-packages\r\n..\\backend\r\nimport site\r\n' > "$PROG/python/python312._pth"

say "Python dependencies (Windows wheels)"
(cd backend && uv export --frozen --no-dev --no-hashes --no-emit-project --quiet -o "$STAGE/requirements.txt")
uv pip install --quiet --target "$PROG/python/Lib/site-packages" \
  --python-platform x86_64-pc-windows-msvc --python-version 3.12 --only-binary :all: -r "$STAGE/requirements.txt"
rm -rf "$PROG/python/Lib/site-packages/bin" "$STAGE/requirements.txt"   # unix console scripts, unused

say "Windows service wrapper (WinSW)"
fetch "$WINSW_URL" "$WINSW_SHA256" "WinSW-x64-2.12.0.exe"
mkdir -p "$PROG/service"
cp "$CACHE/WinSW-x64-2.12.0.exe" "$PROG/service/WinSW-x64.exe"

say "scripts"
cp windows-native/install.ps1 windows-native/install.cmd windows-native/backup.ps1 windows-native/backup.cmd \
   windows-native/restore.ps1 windows-native/restore.cmd windows-native/README.txt windows-native/.env.example "$STAGE/"
printf '%s (built %s)\r\n' "$VERSION" "$(date '+%Y-%m-%d %H:%M')" > "$STAGE/VERSION.txt"

(cd "$ROOT/dist-windows" && zip -qr "$NAME.zip" "$NAME")
rm -rf "$STAGE"
echo
echo "✓ dist-windows/$NAME.zip ($(du -h "dist-windows/$NAME.zip" | cut -f1))"
echo "  Copy it to the server, unzip, right-click install.cmd > Run as administrator."
