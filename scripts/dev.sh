#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example to .env and replace the local password placeholder." >&2
  exit 1
fi

if grep -q '^POSTGRES_PASSWORD=replace-with-' .env; then
  echo "Replace the POSTGRES_PASSWORD placeholder in .env before starting the stack." >&2
  exit 1
fi

docker compose config --quiet
exec docker compose up --build "$@"
