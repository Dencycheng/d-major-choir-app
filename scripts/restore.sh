#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${SQLITE_PATH:-/home/ubuntu/d_major_data/dmajor.sqlite}"
UPLOAD_DIR="${UPLOAD_DIR:-/home/ubuntu/d_major_uploads}"
BACKUP_SQLITE="${1:-}"
BACKUP_UPLOADS="${2:-}"

if [ -z "$BACKUP_SQLITE" ] || [ ! -f "$BACKUP_SQLITE" ]; then
  echo "Usage: scripts/restore.sh /path/to/dmajor.sqlite [/path/to/uploads.tar.gz]" >&2
  exit 1
fi

mkdir -p "$(dirname "$DB_PATH")"
cp "$BACKUP_SQLITE" "$DB_PATH"
if [ -n "$BACKUP_UPLOADS" ] && [ -f "$BACKUP_UPLOADS" ]; then
  mkdir -p "$(dirname "$UPLOAD_DIR")"
  tar -xzf "$BACKUP_UPLOADS" -C "$(dirname "$UPLOAD_DIR")"
fi
echo "Restore completed."
