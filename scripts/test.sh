#!/usr/bin/env zsh
# Run tests (Jest backend + Vitest frontend) inside a container.
# Usage: scripts/test.sh [backend|frontend|all]
# Default: all

set -euo pipefail
source "$(dirname "$0")/lib.sh"

target="${1:-all}"

case "$target" in
  backend)
    info "Running backend tests (Jest)..."
    retry 2 "backend tests (Docker)" \
      docker_node sh -c "npm ci --ignore-scripts && npx jest src/backend --testPathPattern=src/backend"
    ;;
  frontend)
    info "Running frontend tests (Vitest)..."
    retry 2 "frontend tests (Docker)" \
      docker_node sh -c "npm ci --ignore-scripts && npm rebuild esbuild && npx vitest run src/"
    ;;
  all)
    info "Running all tests..."
    retry 2 "all tests (Docker)" \
      docker_node sh -c "npm ci --ignore-scripts && npm rebuild esbuild && npx jest src/backend --testPathPattern=src/backend --passWithNoTests && npx vitest run src/"
    ;;
  *)
    error "Unknown target: $target"
    echo "Usage: $0 [backend|frontend|all]"
    exit 1
    ;;
esac

success "Tests passed"
