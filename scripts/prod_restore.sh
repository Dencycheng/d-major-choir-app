#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"
DOCKER_COMPOSE="${DOCKER_COMPOSE:-docker-compose}"
DB_DUMP="${1:-}"
UPLOADS_TAR="${2:-}"

if [ -z "$DB_DUMP" ] || [ ! -f "$DB_DUMP" ]; then
  echo "Usage: scripts/prod_restore.sh /path/to/postgres.dump [/path/to/uploads.tar.gz]" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

cat "$DB_DUMP" | "$DOCKER_COMPOSE" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"

if [ -n "$UPLOADS_TAR" ] && [ -f "$UPLOADS_TAR" ]; then
  mkdir -p "$ROOT/backend"
  tar -xzf "$UPLOADS_TAR" -C "$ROOT/backend"
fi

echo "Production restore completed."
