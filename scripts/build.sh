#!/usr/bin/env zsh
# Build web app, Electron packages, and/or Docker images.
# Usage: scripts/build.sh [web|electron|images|all] [--push]
# Default: all
#
# Web build runs inside a Docker container (docker_node).
# Electron builds run natively on macOS (cross-compiles Linux + Windows).
# On Linux CI hosts, Electron builds use Docker (docker_electron).
# Docker images use Dockerfile.release (no npm install, no QEMU compilation).
#
# All flaky operations (hdiutil, Docker, npm, buildx) use retry loops.

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

  # Ensure node_modules directory exists on host — Docker's anonymous volume
  # (-v /project/node_modules) initializes differently when the bind-mount
  # target has no directory, causing npm extraction failures on Alpine.
  mkdir -p "$REPO_ROOT/node_modules"

  retry 3 "web build (Docker)" \
    docker_node sh -c "npm ci --ignore-scripts && npm rebuild esbuild && npm run build"

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

  # ── macOS: native install + icon generation ─────────────
  if [[ "$(uname -s)" == "Darwin" ]]; then
    info "Installing dependencies locally for Electron builds..."
    rm -rf "$REPO_ROOT/node_modules" 2>/dev/null || true
    retry 2 "npm ci (native)" npm ci --force
    node scripts/generate-icon.js

    # macOS packages — must run natively (DMG, universal binary, code signing)
    info "Building macOS Electron packages (DMG + zip, universal)..."
    retry 3 "macOS Electron build" \
      ./node_modules/.bin/electron-builder \
        --config.extraMetadata.version="$CHART_VERSION" \
        --mac
  else
    info "Skipping macOS Electron build (not on macOS)"
  fi

  # ── Linux x64: Docker for AppImage + RPM, native for deb/tar.gz ──
  # AppImage needs Linux appimagetool (not available on macOS).
  # RPM needs rpmbuild with xzmt support (macOS Homebrew rpmbuild lacks it).
  # deb/tar.gz work natively via electron-builder's macOS fpm.
  info "Building Linux x64 AppImage + RPM (container)..."
  mkdir -p "$REPO_ROOT/node_modules"
  retry 2 "Linux x64 AppImage + RPM (Docker)" \
    docker_electron bash -c "
      npm ci --ignore-scripts && \
      ./node_modules/.bin/electron-builder \
        --config.extraMetadata.version=${CHART_VERSION} \
        --linux AppImage rpm \
        --x64
    "

  if [[ "$(uname -s)" == "Darwin" ]]; then
    # Only reinstall if node_modules was corrupted by Docker
    if ! node -e "require('electron')" 2>/dev/null; then
      info "Reinstalling native dependencies after Docker..."
      rm -rf "$REPO_ROOT/node_modules" 2>/dev/null || true
      retry 2 "npm ci (native)" npm ci --force
    fi

    info "Building Linux x64 deb + tar.gz (native)..."
    retry 2 "Linux x64 deb/tar.gz" \
      ./node_modules/.bin/electron-builder \
        --config.extraMetadata.version="$CHART_VERSION" \
        --linux deb tar.gz \
        --x64
  fi

  # ── Linux arm64: Docker for AppImage + RPM, native for deb/tar.gz ──
  info "Building Linux arm64 AppImage + RPM (container)..."
  mkdir -p "$REPO_ROOT/node_modules"
  retry 2 "Linux arm64 AppImage + RPM (Docker)" \
    docker_electron bash -c "
      npm ci --ignore-scripts && \
      ./node_modules/.bin/electron-builder \
        --config.extraMetadata.version=${CHART_VERSION} \
        --linux AppImage rpm \
        --arm64
    "

  if [[ "$(uname -s)" == "Darwin" ]]; then
    if ! node -e "require('electron')" 2>/dev/null; then
      info "Reinstalling native dependencies after Docker..."
      rm -rf "$REPO_ROOT/node_modules" 2>/dev/null || true
      retry 2 "npm ci (native)" npm ci --force
    fi

    info "Building Linux arm64 deb + tar.gz (native)..."
    retry 2 "Linux arm64 deb/tar.gz" \
      ./node_modules/.bin/electron-builder \
        --config.extraMetadata.version="$CHART_VERSION" \
        --linux deb tar.gz \
        --arm64
  fi

  # ── Windows: NSIS + zip (all arches) ─────────────────────
  if [[ "$(uname -s)" == "Darwin" ]]; then
    info "Building Windows Electron packages (native, NSIS + zip)..."
    retry 2 "Windows Electron build" \
      ./node_modules/.bin/electron-builder \
        --config.extraMetadata.version="$CHART_VERSION" \
        --win
  else
    info "Building Windows Electron packages (container)..."
    retry 2 "Windows Electron build (Docker)" \
      docker_electron bash -c "
        npm ci --ignore-scripts && \
        ./node_modules/.bin/electron-builder \
          --config.extraMetadata.version=${CHART_VERSION} \
          --win
      "
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

  retry 2 "Docker image build" \
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

  retry 3 "multi-arch Docker push" \
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
