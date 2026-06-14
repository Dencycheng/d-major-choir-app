#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
DOCKER_COMPOSE="${DOCKER_COMPOSE:-docker-compose}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

"$DOCKER_COMPOSE" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_DIR/postgres_$STAMP.dump"

if [ -d "$ROOT/backend/uploads" ]; then
  tar -czf "$BACKUP_DIR/uploads_$STAMP.tar.gz" -C "$ROOT/backend" uploads
fi

echo "Production backup written to $BACKUP_DIR"
echo "Database: $BACKUP_DIR/postgres_$STAMP.dump"
if [ -f "$BACKUP_DIR/uploads_$STAMP.tar.gz" ]; then
  echo "Uploads:  $BACKUP_DIR/uploads_$STAMP.tar.gz"
fi
