# kubamf — top-level Makefile
# Uses port 10351 for Tilt to avoid conflicting with bamf (port 10350).

TILT_PORT ?= 10351

.PHONY: dev dev-down test test-frontend test-backend helm-lint

# ── Development ──────────────────────────────────────────
dev:                ## Start Tilt development environment (port $(TILT_PORT))
	tilt up --port $(TILT_PORT)

dev-down:           ## Stop Tilt
	tilt down

# ── Testing ──────────────────────────────────────────────
test:               ## Run all tests (frontend + backend)
	npm test

test-frontend:      ## Run frontend tests (Vitest)
	npx vitest run

test-backend:       ## Run backend tests (Jest)
	npx jest src/backend

# ── Helm ────────────────────────────────────────────────
helm-lint:          ## Lint the kubamf Helm chart
	helm lint charts/kubamf

help:               ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'
