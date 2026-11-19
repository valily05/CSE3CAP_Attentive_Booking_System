# Attentive Care Connect (Group 09). Run `make help`.
GO ?= $(shell command -v go || echo $(HOME)/.local/go/bin/go)
GOLANGCI ?= $(shell command -v golangci-lint || echo $(HOME)/go/bin/golangci-lint)

.PHONY: help up down seed api web test lint check e2e

help: ## Show targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-8s %s\n", $$1, $$2}'

up: ## Start Postgres and Mailpit (http://localhost:8025)
	docker compose up -d --wait

down: ## Stop containers
	docker compose down

seed: ## Reset the dev database with test data only
	cd backend && ALLOW_RESET=yes $(GO) run ./cmd/seed -reset

api: ## Run the Go API on :8080
	cd backend && $(GO) run ./cmd/api

web: ## Run the website on :3000
	cd frontend && npm run dev

test: ## All unit and integration tests (needs `make up`)
	cd backend && $(GO) test ./...
	cd frontend && npm test

lint: ## Go and TypeScript lint, including the project's own rules
	cd backend && $(GOLANGCI) run ./...
	cd frontend && npm run -s lint && npm run -s typecheck

check: lint test ## Everything CI runs, except e2e

e2e: ## End-to-end in a real browser (needs `make up`)
	cd frontend && npm run test:e2e
