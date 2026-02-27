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

  # macOS — must run natively (requires macOS for DMG, universal binary, code signing)
  if [[ "$(uname -s)" == "Darwin" ]]; then
    info "Installing dependencies locally for macOS Electron build..."
    npm ci
    # Regenerate icon natively (container build may have left an empty placeholder)
    node scripts/generate-icon.js
    npx electron-builder \
      --config.extraMetadata.version="$CHART_VERSION" \
      --mac
  else
    info "Skipping macOS Electron build (not on macOS)"
  fi

  # Linux + Windows — run in electronuserland/builder:wine container
  info "Building Linux + Windows Electron packages (container)..."
  docker_electron bash -c "
    npm ci && \
    npx electron-builder \
      --config.extraMetadata.version=${CHART_VERSION} \
      --linux --win
  "

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
