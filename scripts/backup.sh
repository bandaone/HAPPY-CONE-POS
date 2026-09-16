#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

backup_dir="${HAPPYCONE_BACKUP_DIR:-$project_dir/backups}"
retention_days="${HAPPYCONE_BACKUP_RETENTION_DAYS:-30}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
umask 077

temporary="$backup_dir/.happycone-$timestamp.dump.tmp"
plain="$backup_dir/happycone-$timestamp.dump"
trap 'rm -f "$temporary"' EXIT

docker compose exec -T db sh -c 'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --compress=9 --no-owner --no-privileges' > "$temporary"
docker compose exec -T db pg_restore --list < "$temporary" > /dev/null

recipient="${HAPPYCONE_BACKUP_AGE_RECIPIENT:-}"
if [[ -n "$recipient" ]]; then
  command -v age >/dev/null || { echo "age is required when HAPPYCONE_BACKUP_AGE_RECIPIENT is set." >&2; exit 1; }
  final="$plain.age"
  age --recipient "$recipient" --output "$final" "$temporary"
else
  final="$plain"
  mv "$temporary" "$final"
fi

sha256sum "$final" > "$final.sha256"
find "$backup_dir" -maxdepth 1 -type f \( -name 'happycone-*.dump' -o -name 'happycone-*.dump.age' -o -name 'happycone-*.sha256' \) -mtime "+$retention_days" -delete

echo "Backup created: $final"
if [[ -z "$recipient" ]]; then
  echo "This backup is not encrypted. Production scheduling must set HAPPYCONE_BACKUP_AGE_RECIPIENT and copy backups off-host." >&2
fi
