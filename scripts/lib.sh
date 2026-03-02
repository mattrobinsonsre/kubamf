#!/usr/bin/env zsh
# Shared variables and helpers for kubamf build scripts.
# Sourced by all other scripts in scripts/.

set -euo pipefail

# ── Repo root ─────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${(%):-%x}")/.." && pwd)"

# ── Version info ──────────────────────────────────────────
# Refresh git index first — Docker bind mounts can desync stat cache on macOS
git -C "$REPO_ROOT" update-index --refresh &>/dev/null || true
VERSION="${VERSION:-$(git -C "$REPO_ROOT" describe --tags --always --dirty 2>/dev/null || echo "dev")}"
CHART_VERSION="${VERSION#v}"
GIT_COMMIT="${GIT_COMMIT:-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")}"

# ── Registry and repo ────────────────────────────────────
REGISTRY="${REGISTRY:-ghcr.io/mattrobinsonsre}"
GITHUB_REPO="${GITHUB_REPO:-mattrobinsonsre/kubamf}"

# ── Output helpers ────────────────────────────────────────
info()    { printf '\033[1;34m==> %s\033[0m\n' "$*"; }
success() { printf '\033[1;32m==> %s\033[0m\n' "$*"; }
error()   { printf '\033[1;31m==> ERROR: %s\033[0m\n' "$*" >&2; }

# ── Retry helper ─────────────────────────────────────────
# Usage: retry <max_attempts> <description> <command...>
# Retries on failure with exponential backoff (5s, 10s, 20s, ...).
retry() {
  local max_attempts=$1 desc=$2
  shift 2
  local attempt=1 delay=5
  while true; do
    if "$@"; then
      return 0
    fi
    if (( attempt >= max_attempts )); then
      error "$desc failed after $max_attempts attempts"
      return 1
    fi
    info "Attempt $attempt/$max_attempts failed for: $desc — retrying in ${delay}s..."
    sleep $delay
    (( attempt++ ))
    (( delay *= 2 ))
  done
}

# ── Container helpers ────────────────────────────────────
# Run a command inside a Node.js container.
# Uses named volumes for npm cache to speed up repeated runs.
docker_node() {
  docker run --rm \
    --memory=4g \
    -v "$REPO_ROOT:/project" \
    -v /project/node_modules \
    -v kubamf-npmcache:/root/.npm \
    -w /project \
    -e CI="${CI:-}" \
    node:18-alpine \
    "$@"
}

# Run electron-builder inside the official builder container.
# Includes Wine (for Windows NSIS), RPM tools, and all Linux deps.
docker_electron() {
  docker run --rm \
    -v "$REPO_ROOT:/project" \
    -v /project/node_modules \
    -v kubamf-electron-cache:/root/.cache/electron \
    -v kubamf-electron-builder-cache:/root/.cache/electron-builder \
    -v kubamf-npmcache:/root/.npm \
    -w /project \
    -e CI="${CI:-}" \
    electronuserland/builder:wine \
    "$@"
}
