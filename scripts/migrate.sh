#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example to .env and configure it first." >&2
  exit 1
fi

if grep -q '^POSTGRES_PASSWORD=replace-with-' .env; then
  echo "Replace the POSTGRES_PASSWORD placeholder in .env before running migrations." >&2
  exit 1
fi

docker compose run --rm api python -m app.cli migrate
