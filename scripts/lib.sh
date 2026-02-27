#!/usr/bin/env zsh
# Shared variables and helpers for kubamf build scripts.
# Sourced by all other scripts in scripts/.

set -euo pipefail

# ── Repo root ─────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${(%):-%x}")/.." && pwd)"

# ── Version info ──────────────────────────────────────────
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

# ── Container helpers ────────────────────────────────────
# Run a command inside a Node.js container.
# Uses named volumes for npm cache to speed up repeated runs.
docker_node() {
  docker run --rm \
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
