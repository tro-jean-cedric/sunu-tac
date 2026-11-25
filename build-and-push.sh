#!/usr/bin/env bash
# Build the two production images (api + web) for the Windows server (linux/amd64) and push them
# to the container registry. The Windows server then only needs the windows-deploy/ folder.
#
#   ./build-and-push.sh                # build + push  :<git-sha>  and  :latest
#   ./build-and-push.sh --no-push      # build only (checks that everything compiles)
#   TAG=v1.2 ./build-and-push.sh       # custom tag (also pushes :latest)
#   BUILD_MODE=test-only ./build-and-push.sh   # web image without the HR console
#
# Registry: GitHub Container Registry (ghcr.io), linked to github.com/tro-jean-cedric/sunu-tac.
# Login reuses the GitHub CLI (`gh auth login`, token scope write:packages). Another registry: set IMAGE_PREFIX.
set -euo pipefail
cd "$(dirname "$0")"

IMAGE_PREFIX="${IMAGE_PREFIX:-ghcr.io/tro-jean-cedric/sunu-tac}"
REGISTRY="${IMAGE_PREFIX%%/*}"
PLATFORM="${PLATFORM:-linux/amd64}"          # the Windows PC is x86-64, even when building on an M-series Mac
BUILD_MODE="${BUILD_MODE:-production}"       # production | test-only | console-only
TAG="${TAG:-$(git rev-parse --short HEAD)}"
PUSH=true
[[ "${1:-}" == "--no-push" ]] && PUSH=false

if [[ -n "$(git status --porcelain)" ]]; then
  echo "⚠  Uncommitted changes: the images will contain them, but the tag ($TAG) points at the last commit."
fi

docker info >/dev/null 2>&1 || { echo "✗ Docker is not running (start Docker Desktop)."; exit 1; }

if $PUSH; then
  # ghcr.io: reuse the GitHub CLI login (its token needs the write:packages scope)
  if [[ "$REGISTRY" == "ghcr.io" ]] && command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
    gh auth token | docker login ghcr.io -u "$(gh api user -q .login)" --password-stdin >/dev/null
  else
    echo "→ Make sure you ran: docker login $REGISTRY"
  fi
  OUTPUT=(--push)
else
  OUTPUT=(--load)
fi

build() {  # build <name> <dockerfile> [extra args...]
  local name=$1 file=$2; shift 2
  echo "→ Building $IMAGE_PREFIX-$name:$TAG ($PLATFORM)"
  docker buildx build --platform "$PLATFORM" -f "$file" \
    -t "$IMAGE_PREFIX-$name:$TAG" -t "$IMAGE_PREFIX-$name:latest" \
    --label org.opencontainers.image.source=https://github.com/tro-jean-cedric/sunu-tac \
    "$@" "${OUTPUT[@]}" .
}

build api backend/Dockerfile
build web frontend/Dockerfile --build-arg BUILD_MODE="$BUILD_MODE"

# First run: give the Windows bundle a .env with fresh random secrets (gitignored, never pushed).
ENV_FILE=windows-deploy/.env
if [[ ! -f $ENV_FILE ]]; then
  sed -e "s|^IMAGE_PREFIX=.*|IMAGE_PREFIX=$IMAGE_PREFIX|" \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" \
      -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" \
      -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$(openssl rand -base64 12 | tr -d '/+=')|" \
      windows-deploy/.env.example > "$ENV_FILE"
  echo "→ Created $ENV_FILE with random secrets (admin password inside). Fill LDAP_* / API keys before copying it."
fi

echo
if $PUSH; then
  echo "✓ Pushed $IMAGE_PREFIX-api and -web  (tags: $TAG, latest)"
  echo "  On the Windows server: copy windows-deploy\\ and run update.bat"
else
  echo "✓ Built locally (not pushed)."
fi
