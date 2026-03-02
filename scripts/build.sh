#!/usr/bin/env zsh
# Build web app, Electron packages, and/or Docker images.
# Usage: scripts/build.sh [web|electron|images|all] [--push]
# Default: all
#
# Web + lint + test run inside containers (docker_node / docker_electron).
# Electron macOS builds run natively (requires macOS host for DMG/signing).
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

  # macOS — must run natively (requires macOS for DMG, universal binary, code signing)
  if [[ "$(uname -s)" == "Darwin" ]]; then
    info "Installing dependencies locally for macOS Electron build..."
    # Clean npm cache to prevent corruption from Docker volume interactions
    npm cache clean --force 2>/dev/null || true
    rm -rf "$REPO_ROOT/node_modules" 2>/dev/null || true
    retry 2 "npm ci (native)" npm ci --force
    # Regenerate icon natively (container build may have left an empty placeholder)
    node scripts/generate-icon.js
    info "Building macOS Electron packages..."
    # DMG creation (hdiutil) is flaky on arm64 macOS — retry
    retry 3 "macOS Electron build (DMG + zip)" \
      ./node_modules/.bin/electron-builder \
        --config.extraMetadata.version="$CHART_VERSION" \
        --mac
  else
    info "Skipping macOS Electron build (not on macOS)"
  fi

  # Linux — run in electronuserland/builder:wine container.
  # RPM is excluded here because fpm's rpmbuild uses xzmt compression
  # which crashes under QEMU emulation on arm64 hosts. RPM is built
  # natively below instead.
  info "Building Linux Electron packages (container, excluding RPM)..."
  retry 2 "Linux Electron build (Docker)" \
    docker_electron bash -c "
      npm ci --ignore-scripts && \
      ./node_modules/.bin/electron-builder \
        --config.extraMetadata.version=${CHART_VERSION} \
        --linux AppImage deb tar.gz
    "

  # Linux RPM — build natively on macOS. electron-builder downloads its own
  # macOS-native fpm binary, avoiding the QEMU rpmbuild/xzmt crash.
  if [[ "$(uname -s)" == "Darwin" ]]; then
    info "Building Linux RPM packages (native fpm)..."
    retry 2 "Linux RPM build" \
      ./node_modules/.bin/electron-builder \
        --config.extraMetadata.version="$CHART_VERSION" \
        --linux rpm
  fi

  # Windows — build natively on macOS. electron-builder downloads a macOS
  # Wine binary for rcedit/NSIS. Wine doesn't work inside Docker under
  # QEMU on arm64 hosts. On native amd64 CI runners, Docker handles it.
  if [[ "$(uname -s)" == "Darwin" ]]; then
    info "Building Windows Electron packages (native + Wine)..."
    retry 2 "Windows Electron build (native)" \
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
