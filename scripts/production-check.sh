#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

base_url="${HAPPYCONE_BASE_URL:-http://127.0.0.1:${WEB_PORT:-8080}}"

[[ -f .env ]] || { echo "Missing .env." >&2; exit 1; }
if grep -Eq 'replace-with-|pos\.example\.com' .env; then
  echo "Deployment placeholders remain in .env." >&2
  exit 1
fi
grep -Eq '^APP_ENV=production$' .env || { echo "APP_ENV must be production." >&2; exit 1; }

docker compose -f docker-compose.yml -f docker-compose.production.yml config --quiet
running="$(docker compose -f docker-compose.yml -f docker-compose.production.yml ps --status running --services)"
for service in db api web; do
  grep -qx "$service" <<<"$running" || { echo "Service is not running: $service" >&2; exit 1; }
done
curl --fail --silent --show-error "$base_url/health" > /dev/null
curl --fail --silent --show-error "$base_url/ready" > /dev/null

echo "Configuration, running services, liveness and database readiness checks passed."
