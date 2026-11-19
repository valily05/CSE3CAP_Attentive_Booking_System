#!/usr/bin/env bash
# Creates and reseeds the e2e database. Run from backend/ before the API starts.
set -euo pipefail
echo "SELECT 'CREATE DATABASE careconnect_e2e' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'careconnect_e2e')\gexec" \
  | docker exec -i careconnect-db-1 psql -U careconnect -d postgres -q
ALLOW_RESET=yes "$HOME/.local/go/bin/go" run ./cmd/seed -reset
