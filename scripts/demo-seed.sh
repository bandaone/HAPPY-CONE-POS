#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
api_python="$project_dir/apps/api/.venv/bin/python"

if [[ ! -x "$api_python" ]]; then
  echo "Missing apps/api/.venv. Create it and install the API development dependencies first." >&2
  exit 1
fi

seed_password="${HAPPYCONE_SEED_PASSWORD:-}"
if [[ ${#seed_password} -lt 12 ]]; then
  echo "Set HAPPYCONE_SEED_PASSWORD to a development-only password of at least 12 characters." >&2
  exit 1
fi

export DATABASE_URL="${HAPPYCONE_DEMO_DATABASE_URL:-sqlite:///./happycone-demo.db}"
if [[ "$DATABASE_URL" != sqlite:* ]]; then
  echo "Demo mode accepts only a SQLite DATABASE_URL." >&2
  exit 1
fi

cd "$project_dir/apps/api"
exec "$api_python" -m app.cli seed --password "$seed_password"
