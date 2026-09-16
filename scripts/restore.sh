#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: HAPPYCONE_RESTORE_CONFIRM=restore-happycone $0 BACKUP.dump[.age]" >&2
  exit 2
fi
if [[ "${HAPPYCONE_RESTORE_CONFIRM:-}" != "restore-happycone" ]]; then
  echo "Restore replaces the current database. Set HAPPYCONE_RESTORE_CONFIRM=restore-happycone after verifying the target and backup." >&2
  exit 2
fi

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
backup="$(realpath "$1")"
[[ -f "$backup" ]] || { echo "Backup not found: $backup" >&2; exit 1; }

if [[ -f "$backup.sha256" ]]; then
  (cd "$(dirname "$backup")" && sha256sum --check "$(basename "$backup.sha256")")
fi

restore_input="$backup"
temporary=""
if [[ "$backup" == *.age ]]; then
  command -v age >/dev/null || { echo "age is required to decrypt this backup." >&2; exit 1; }
  identity="${HAPPYCONE_BACKUP_AGE_IDENTITY:-}"
  [[ -n "$identity" && -f "$identity" ]] || { echo "Set HAPPYCONE_BACKUP_AGE_IDENTITY to the age identity file." >&2; exit 1; }
  temporary="$(mktemp /tmp/happycone-restore.XXXXXX.dump)"
  trap 'rm -f "$temporary"' EXIT
  age --decrypt --identity "$identity" --output "$temporary" "$backup"
  restore_input="$temporary"
fi

docker compose exec -T db pg_restore --list < "$restore_input" > /dev/null
docker compose stop api web
docker compose exec -T db sh -c 'dropdb --username="$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb --username="$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T db sh -c 'exec pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-owner --no-privileges' < "$restore_input"
docker compose run --rm api python -m app.cli migrate
docker compose up -d api web

echo "Restore completed. Run ./scripts/production-check.sh and complete a signed-in smoke test."
