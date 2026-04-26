#!/usr/bin/env sh
# SQLite backup with rotation. Designed to be invoked from a Railway cron job
# or from a docker compose exec on a host:
#
#   # Inside the running container (Railway cron or local prod compose):
#   docker compose exec app sh /app/scripts/backup.sh
#
#   # Restore (manual):
#   docker compose exec app sqlite3 /data/app.db ".restore /backups/<file>"
#
# Configuration via env vars:
#   DB_PATH     — path to the live database (default: /data/app.db)
#   BACKUP_DIR  — destination volume mount (default: /backups)
#   RETENTION_DAYS — purge backups older than this many days (default: 30)

set -eu

DB_PATH="${DB_PATH:-/data/app.db}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

if [ ! -f "$DB_PATH" ]; then
  echo "[backup] database not found at $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTFILE="$BACKUP_DIR/backup-${TIMESTAMP}.db"

echo "[backup] $DB_PATH -> $OUTFILE"
# Use SQLite's .backup which is safe even with concurrent readers/writers
# (vs. cp which can capture an inconsistent snapshot under WAL).
sqlite3 "$DB_PATH" ".backup '$OUTFILE'"

# Retention: drop anything older than RETENTION_DAYS.
echo "[backup] pruning backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'backup-*.db' -mtime +"$RETENTION_DAYS" -print -delete || true

echo "[backup] done"
