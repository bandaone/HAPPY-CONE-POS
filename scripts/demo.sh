#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
api_python="$project_dir/apps/api/.venv/bin/python"
web_dir="$project_dir/apps/web"
api_port="8000"
web_port="${HAPPYCONE_DEMO_WEB_PORT:-5173}"

if [[ ! -x "$api_python" ]]; then
  echo "Missing apps/api/.venv. Create it and install the API development dependencies first." >&2
  exit 1
fi

if [[ ! -d "$web_dir/node_modules" ]]; then
  echo "Missing apps/web/node_modules. Run npm ci in apps/web first." >&2
  exit 1
fi

export DATABASE_URL="${HAPPYCONE_DEMO_DATABASE_URL:-sqlite:///./happycone-demo.db}"
if [[ "$DATABASE_URL" != sqlite:* ]]; then
  echo "Demo mode accepts only a SQLite DATABASE_URL." >&2
  exit 1
fi

export BRANCH_TIMEZONE="${BRANCH_TIMEZONE:-Africa/Lusaka}"
export SESSION_HOURS="${SESSION_HOURS:-12}"
export CORS_ORIGINS="[\"http://127.0.0.1:${web_port}\",\"http://localhost:${web_port}\"]"

cleanup() {
  if [[ -n "${api_pid:-}" ]]; then
    kill "$api_pid" 2>/dev/null || true
    wait "$api_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

(
  cd "$project_dir/apps/api"
  exec "$api_python" -m uvicorn app.main:app --host 127.0.0.1 --port "$api_port"
) &
api_pid=$!

api_ready="false"
for _attempt in {1..30}; do
  if ! kill -0 "$api_pid" 2>/dev/null; then
    echo "The demo API exited before becoming healthy." >&2
    exit 1
  fi
  if "$api_python" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:${api_port}/health', timeout=1).read()" 2>/dev/null; then
    api_ready="true"
    break
  fi
  sleep 0.2
done

if [[ "$api_ready" != "true" ]]; then
  echo "The demo API did not become healthy at http://127.0.0.1:${api_port}/health." >&2
  exit 1
fi

echo "Happy Cone demo: http://127.0.0.1:${web_port}"
echo "The SQLite database is not migrated or seeded automatically. See the README for explicit commands."

cd "$web_dir"
npm run dev -- --host 127.0.0.1 --port "$web_port"
