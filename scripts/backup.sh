#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${SQLITE_PATH:-/home/ubuntu/d_major_data/dmajor.sqlite}"
UPLOAD_DIR="${UPLOAD_DIR:-/home/ubuntu/d_major_uploads}"
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/d_major_backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"
if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/dmajor_$STAMP.sqlite'"
fi
if [ -d "$UPLOAD_DIR" ]; then
  tar -czf "$BACKUP_DIR/uploads_$STAMP.tar.gz" -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")"
fi
echo "Backup written to $BACKUP_DIR"
