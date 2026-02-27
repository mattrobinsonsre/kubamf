# kubamf — top-level Makefile
# Uses port 10351 for Tilt to avoid conflicting with bamf (port 10350).

TILT_PORT ?= 10351

.PHONY: dev dev-down test test-frontend test-backend helm-lint \
        build build-web build-electron images lint release help

# ── Development ──────────────────────────────────────────
dev:                ## Start Tilt development environment
	tilt up --port $(TILT_PORT)

dev-down:           ## Stop Tilt
	tilt down

# ── Quality ──────────────────────────────────────────────
lint:               ## Run linter (ESLint)
	scripts/lint.sh

# ── Testing ──────────────────────────────────────────────
test:               ## Run all tests (frontend + backend)
	scripts/test.sh

test-frontend:      ## Run frontend tests (Vitest)
	scripts/test.sh frontend

test-backend:       ## Run backend tests (Jest)
	scripts/test.sh backend

# ── Build ────────────────────────────────────────────────
build:              ## Build web app + Electron packages
	scripts/build.sh

build-web:          ## Build web app only
	scripts/build.sh web

build-electron:     ## Build Electron packages only
	scripts/build.sh electron

images:             ## Build Docker images (local)
	scripts/build.sh images

# ── Helm ─────────────────────────────────────────────────
helm-lint:          ## Lint the kubamf Helm chart
	helm lint charts/kubamf

# ── Release ──────────────────────────────────────────────
release:            ## Full release: lint, test, build, publish
	scripts/lint.sh
	scripts/test.sh
	scripts/build.sh
	scripts/publish.sh

help:               ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'
