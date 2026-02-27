#!/usr/bin/env zsh
# Run tests (Jest backend + Vitest frontend).
# Usage: scripts/test.sh [backend|frontend|all]
# Default: all

set -euo pipefail
source "$(dirname "$0")/lib.sh"

cd "$REPO_ROOT"

target="${1:-all}"

case "$target" in
  backend)
    info "Running backend tests (Jest)..."
    npx jest src/backend --testPathPattern=src/backend
    ;;
  frontend)
    info "Running frontend tests (Vitest)..."
    npx vitest run src/
    ;;
  all)
    info "Running all tests..."
    node scripts/test-parallel.js
    ;;
  *)
    error "Unknown target: $target"
    echo "Usage: $0 [backend|frontend|all]"
    exit 1
    ;;
esac

success "Tests passed"
