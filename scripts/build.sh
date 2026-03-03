#!/usr/bin/env zsh
# Build web app, Electron packages, and/or Docker images.
# Usage: scripts/build.sh [web|electron|images|all] [--push]
# Default: all
#
# Web build runs inside a Docker container (docker_node).
# Electron builds run natively on macOS (cross-compiles Linux + Windows).
# RPM packages use Docker (electronuserland/builder:wine) even on macOS because
# electron-builder hardcodes --rpm-compression xzmt which macOS rpmbuild doesn't
# support. The Docker RPM build is lightweight (just fpm packaging, no esbuild).
# On Linux CI hosts, all Electron builds use Docker (docker_electron).
# Docker images use Dockerfile.release (no npm install, no compilation).
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

  if [[ "$(uname -s)" == "Darwin" ]]; then
    # ── macOS host ───────────────────────────────────────────────────
    # macOS + Windows: build natively (DMG requires macOS; Wine under
    #   Rosetta double-emulation fails, so NSIS runs natively too)
    # Linux: ALL formats in Docker (hard requirement — no cross-compile from mac)

    info "Installing dependencies locally for macOS/Windows Electron build..."
    rm -rf "$REPO_ROOT/node_modules" 2>/dev/null || true
    retry 2 "npm ci (native)" npm ci --force
    node scripts/generate-icon.js

    # Skip code signing identity scan — we don't sign locally.
    # Without this, electron-builder scans the keychain and its logger
    # can crash with RangeError if the identity list is too large.
    export CSC_IDENTITY_AUTO_DISCOVERY=false

    info "Building macOS Electron packages (DMG + zip, universal)..."
    retry 3 "macOS Electron build" \
      ./node_modules/.bin/electron-builder \
        --config.extraMetadata.version="$CHART_VERSION" \
        --mac

    info "Building Windows Electron packages (NSIS installer, x64 + arm64)..."
    retry 2 "Windows Electron build (native cross-compile)" \
      ./node_modules/.bin/electron-builder \
        --config.extraMetadata.version="$CHART_VERSION" \
        --win \
        --x64 --arm64

    info "Building Linux Electron packages (Docker — all formats, x64 + arm64)..."
    retry 2 "Linux Electron build (Docker)" \
      docker_electron bash -c '
        npm ci --ignore-scripts && \
        npm rebuild esbuild && \
        ./node_modules/.bin/electron-builder \
          --config.extraMetadata.version='"${CHART_VERSION}"' \
          --linux AppImage deb rpm tar.gz \
          --x64 --arm64
      '

  else
    # ── Linux host (CI): use Docker containers ─────────────
    info "Skipping macOS Electron build (not on macOS)"

    info "Building Linux Electron packages (container)..."
    retry 2 "Linux Electron build (Docker)" \
      docker_electron bash -c "
        npm ci --ignore-scripts && \
        ./node_modules/.bin/electron-builder \
          --config.extraMetadata.version=${CHART_VERSION} \
          --linux
      "

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
  info "Building multi-arch Docker image (no compilation — just COPY)..."

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
