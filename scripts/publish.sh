#!/usr/bin/env zsh
# Push images, Helm chart, and create a GitHub Release.
# Usage: scripts/publish.sh [images|chart|release|all]
# Default: all
#
# Prerequisites:
#   images:  docker login ghcr.io
#   chart:   helm registry login ghcr.io
#   release: gh auth status

set -euo pipefail
source "$(dirname "$0")/lib.sh"

HELM_CHART_DIR="$REPO_ROOT/charts/kubamf"

# ── Push multi-arch Docker image to GHCR ─────────────────
publish_images() {
  info "Publishing multi-arch Docker image to ${REGISTRY}..."
  "$REPO_ROOT/scripts/build.sh" images --push
  success "Image published"
}

# ── Push Helm chart to OCI registry ──────────────────────
publish_chart() {
  info "Publishing Helm chart to OCI..."

  mkdir -p "$REPO_ROOT/dist"

  # Package the chart with version and appVersion from git tag
  helm package "$HELM_CHART_DIR" --destination "$REPO_ROOT/dist/" \
    --version "$CHART_VERSION" --app-version "$CHART_VERSION"

  # Push to GHCR OCI (retry for transient registry errors)
  retry 3 "Helm chart push" \
    helm push "$REPO_ROOT/dist/kubamf-${CHART_VERSION}.tgz" "oci://${REGISTRY}"

  success "Helm chart kubamf:${CHART_VERSION} pushed to oci://${REGISTRY}"
}

# ── Generate release notes from conventional commits ─────
generate_release_notes() {
  # Find the previous tag to diff against
  local prev_tag
  prev_tag=$(git -C "$REPO_ROOT" describe --tags --abbrev=0 "${VERSION}^" 2>/dev/null || echo "")

  local range
  if [[ -n "$prev_tag" ]]; then
    range="${prev_tag}..${VERSION}"
  else
    range="$VERSION"
  fi

  # Use the annotated tag message as the summary line (strip the "vX.Y.Z: " prefix)
  local tag_subject
  tag_subject=$(git -C "$REPO_ROOT" tag -l --format='%(subject)' "$VERSION" 2>/dev/null || echo "")
  local summary="${tag_subject#"${VERSION}: "}"

  # Collect commits by category using conventional commit prefixes.
  local feats="" fixes="" docs="" refactors="" tests="" chores="" others=""

  while IFS= read -r line; do
    # Strip conventional commit prefix: "type: msg" or "type(scope): msg"
    local msg
    msg=$(printf '%s' "$line" | gsed -E 's/^[a-z]+(\([^)]*\))?[!]?:[[:space:]]*//')

    case "$line" in
      feat:*|feat\(*)     feats+="- ${msg}"$'\n' ;;
      fix:*|fix\(*)       fixes+="- ${msg}"$'\n' ;;
      docs:*|docs\(*)     docs+="- ${msg}"$'\n' ;;
      refactor:*|refactor\(*) refactors+="- ${msg}"$'\n' ;;
      test:*|test\(*)     tests+="- ${msg}"$'\n' ;;
      chore:*|chore\(*|ci:*|ci\(*) chores+="- ${msg}"$'\n' ;;
      *)                  others+="- ${line}"$'\n' ;;
    esac
  done < <(git -C "$REPO_ROOT" log --format='%s' "$range" 2>/dev/null)

  # Build the notes body
  local notes=""

  if [[ -n "$summary" ]]; then
    notes+="$summary"$'\n\n'
  fi

  if [[ -n "$feats" ]]; then
    notes+="### Features"$'\n\n'"$feats"$'\n'
  fi
  if [[ -n "$fixes" ]]; then
    notes+="### Bug Fixes"$'\n\n'"$fixes"$'\n'
  fi
  if [[ -n "$docs" ]]; then
    notes+="### Documentation"$'\n\n'"$docs"$'\n'
  fi
  if [[ -n "$refactors" ]]; then
    notes+="### Refactoring"$'\n\n'"$refactors"$'\n'
  fi
  if [[ -n "$tests" ]]; then
    notes+="### Tests"$'\n\n'"$tests"$'\n'
  fi
  if [[ -n "$chores" ]]; then
    notes+="### Maintenance"$'\n\n'"$chores"$'\n'
  fi
  if [[ -n "$others" ]]; then
    notes+="### Other Changes"$'\n\n'"$others"$'\n'
  fi

  if [[ -n "$prev_tag" ]]; then
    notes+="**Full Changelog**: https://github.com/${GITHUB_REPO}/compare/${prev_tag}...${VERSION}"$'\n'
  fi

  printf '%s' "$notes"
}

# ── Create GitHub Release with Electron packages ─────────
publish_release() {
  info "Creating GitHub Release ${VERSION}..."

  # Verify dist-electron/ has artifacts
  if [[ ! -d "$REPO_ROOT/dist-electron" ]] || [[ -z "$(ls "$REPO_ROOT/dist-electron/" 2>/dev/null)" ]]; then
    error "dist-electron/ is empty — run 'scripts/build.sh electron' first"
    exit 1
  fi

  mkdir -p "$REPO_ROOT/dist"

  # Collect release artifacts (exclude builder metadata files)
  local release_dir="$REPO_ROOT/dist/release"
  rm -rf "$release_dir"
  mkdir -p "$release_dir"

  # Copy Electron artifacts (skip yml/yaml metadata, blockmap, and builder-debug)
  for f in "$REPO_ROOT"/dist-electron/*; do
    local base="$(basename "$f")"
    case "$base" in
      *.yml|*.yaml|*.blockmap|*.7z|.DS_Store|builder-debug.yml|builder-effective-config.yaml|__uninstaller*) continue ;;
      .icon-icns|mac-arm64|mac-universal|mac-universal-*-temp|linux-unpacked|linux-arm64-unpacked|win-unpacked|win-arm64-unpacked) continue ;;
      *) cp "$f" "$release_dir/" ;;
    esac
  done

  # Generate checksums (use gsha256sum on macOS, sha256sum on Linux)
  local sha_cmd="sha256sum"
  command -v gsha256sum &>/dev/null && sha_cmd="gsha256sum"

  info "Generating checksums..."
  (cd "$release_dir" && $sha_cmd -- * > checksums.txt)

  info "Generating release notes..."
  local notes
  notes=$(generate_release_notes)

  info "Creating release..."
  retry 3 "GitHub Release creation" \
    gh release create "$VERSION" "$release_dir"/* \
      --repo "$GITHUB_REPO" \
      --title "Kubamf ${VERSION}" \
      --notes "$notes"

  success "GitHub Release ${VERSION} created"
}

target="${1:-all}"

case "$target" in
  images)  publish_images ;;
  chart)   publish_chart ;;
  release) publish_release ;;
  all)
    publish_images
    publish_chart
    publish_release
    success "All artifacts published"
    ;;
  *)
    error "Unknown target: $target"
    echo "Usage: $0 [images|chart|release|all]"
    exit 1
    ;;
esac
