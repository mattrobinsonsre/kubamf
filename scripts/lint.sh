#!/usr/bin/env zsh
# Run ESLint on the kubamf codebase.
# Usage: scripts/lint.sh

set -euo pipefail
source "$(dirname "$0")/lib.sh"

info "Linting..."
cd "$REPO_ROOT"
npx eslint src/ --max-warnings 0
success "Lint passed"
