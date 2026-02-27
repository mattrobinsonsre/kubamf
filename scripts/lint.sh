#!/usr/bin/env zsh
# Run ESLint on the kubamf codebase inside a container.
# Usage: scripts/lint.sh

set -euo pipefail
source "$(dirname "$0")/lib.sh"

info "Linting..."
docker_node sh -c "npm ci --ignore-scripts --force && npx eslint src/ --max-warnings 0"
success "Lint passed"
