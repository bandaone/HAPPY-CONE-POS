#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example to .env and configure it first." >&2
  exit 1
fi

if grep -q '^POSTGRES_PASSWORD=replace-with-' .env; then
  echo "Replace the POSTGRES_PASSWORD placeholder in .env before seeding." >&2
  exit 1
fi

seed_password="${HAPPYCONE_SEED_PASSWORD:-}"
if [[ ${#seed_password} -lt 12 ]]; then
  echo "Set HAPPYCONE_SEED_PASSWORD to a development-only password of at least 12 characters." >&2
  exit 1
fi

docker compose run --rm \
  -e HAPPYCONE_SEED_PASSWORD \
  api python -m app.cli seed --password "$seed_password"
