#!/usr/bin/env bash
# Snapshots the SQLite db from the running container into ./backups.
# Phase 0: smoke-only. Hardening (rotation, S3 upload) lands later.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
CONTAINER="${CONTAINER:-flowcore-sensor}"
DB_PATH_IN_CONTAINER="${DB_PATH_IN_CONTAINER:-/data/app.db}"

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTFILE="$BACKUP_DIR/app-${TIMESTAMP}.db"

echo "[backup] copying $CONTAINER:$DB_PATH_IN_CONTAINER -> $OUTFILE"
docker cp "${CONTAINER}:${DB_PATH_IN_CONTAINER}" "$OUTFILE"
echo "[backup] done"
