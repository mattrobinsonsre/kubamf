#!/usr/bin/env zsh
# Build web app, Electron packages, and/or Docker images.
# Usage: scripts/build.sh [web|electron|images|all] [--push]
# Default: all
#
# Web + lint + test run inside containers (docker_node / docker_electron).
# Electron macOS builds run natively (requires macOS host for DMG/signing).
# Docker images use Dockerfile.release (no npm install, no QEMU compilation).

set -euo pipefail
source "$(dirname "$0")/lib.sh"

PUSH=false
TARGETS=()

for arg in "$@"; do
  case "$arg" in
    --push) PUSH=true ;;
    *)      TARGETS+=("$arg") ;;
  esac
done

# Default to "all" if no targets specified
[[ ${#TARGETS[@]} -eq 0 ]] && TARGETS=("all")

# ── Build web app (Vite frontend + ncc backend) ─────────
build_web() {
  info "Building web app in container (VERSION=${VERSION})..."
  cd "$REPO_ROOT"

  docker_node sh -c "npm ci --ignore-scripts && npm run build"

  success "Web app built: dist/frontend/ + dist/backend/"
}

# ── Build Electron packages ────────────────────────────
build_electron() {
  # Verify web build output exists
  if [[ ! -d "$REPO_ROOT/dist/frontend" ]] || [[ ! -d "$REPO_ROOT/dist/backend" ]]; then
    error "dist/frontend/ or dist/backend/ missing — run 'scripts/build.sh web' first"
    exit 1
  fi

  info "Building Electron packages (version=${CHART_VERSION})..."
  cd "$REPO_ROOT"

  # Install dependencies locally (needed for all platforms).
  # Clean node_modules first — the Docker web build may leave stale entries
  # that confuse npm ci (ENOTEMPTY errors).
  info "Installing dependencies locally..."
  rm -rf "$REPO_ROOT/node_modules"
  npm ci
  # Regenerate icon natively (container build may have left an empty placeholder)
  node scripts/generate-icon.js

  # macOS — must run natively (requires macOS for DMG, universal binary, code signing)
  if [[ "$(uname -s)" == "Darwin" ]]; then
    info "Building macOS Electron packages..."
    npx electron-builder \
      --config.extraMetadata.version="$CHART_VERSION" \
      --mac
  fi

  # Linux — cross-compile from macOS. electron-builder downloads the
  # correct Electron binary per arch and handles AppImage/deb/tar.gz.
  # On CI, native Linux runners should be used for best reliability.
  info "Building Linux Electron packages..."
  npx electron-builder \
    --config.extraMetadata.version="$CHART_VERSION" \
    --linux --arm64 --x64

  # Windows — zip only from macOS (NSIS requires Wine).
  # On CI with Wine or native Windows runners, NSIS installers are built.
  if command -v wine &>/dev/null; then
    info "Building Windows Electron packages (Wine available)..."
    npx electron-builder \
      --config.extraMetadata.version="$CHART_VERSION" \
      --win
  else
    info "Building Windows Electron packages (zip only — Wine not available for NSIS)..."
    npx electron-builder \
      --config.extraMetadata.version="$CHART_VERSION" \
      --win --x64 --arm64 \
      -c.win.target=zip
  fi

  success "Electron packages written to dist-electron/"
}

# ── Build Docker images ──────────────────────────────────
build_images() {
  # Verify web build output exists
  if [[ ! -d "$REPO_ROOT/dist/frontend" ]] || [[ ! -d "$REPO_ROOT/dist/backend" ]]; then
    error "dist/frontend/ or dist/backend/ missing — run 'scripts/build.sh web' first"
    exit 1
  fi

  if $PUSH; then
    build_images_multiarch
  else
    build_images_local
  fi
}

build_images_local() {
  info "Building Docker image (single-arch, local)..."

  docker build \
    -f "$REPO_ROOT/Dockerfile.release" \
    -t "kubamf:${VERSION}" \
    -t "kubamf:dev" \
    "$REPO_ROOT"

  success "Local image built: kubamf:${VERSION}"
}

build_images_multiarch() {
  info "Building multi-arch Docker image (no QEMU compilation — just COPY)..."

  local tags="-t ${REGISTRY}/kubamf:${VERSION}"
  # Tag :latest only for semver tags (vX.Y.Z)
  if [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    tags="$tags -t ${REGISTRY}/kubamf:latest"
  fi

  docker buildx build \
    -f "$REPO_ROOT/Dockerfile.release" \
    --platform linux/amd64,linux/arm64 \
    ${=tags} --push "$REPO_ROOT"

  success "Multi-arch image pushed to ${REGISTRY}/kubamf:${VERSION}"
}

# ── Run targets ──────────────────────────────────────────
for target in "${TARGETS[@]}"; do
  case "$target" in
    web)      build_web ;;
    electron) build_electron ;;
    images)   build_images ;;
    all)
      build_web
      build_electron
      build_images
      ;;
    *)
      error "Unknown target: $target"
      echo "Usage: $0 [web|electron|images|all] [--push]"
      exit 1
      ;;
  esac
done
