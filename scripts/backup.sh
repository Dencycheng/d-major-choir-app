#!/usr/bin/env bash
# 备份 SQLite 数据库与 uploads（PRD V2.1 §10.2）
# 用法：bash scripts/backup.sh [备份目录]
set -euo pipefail

DB_PATH="${SQLITE_DB_PATH:-${DATABASE_PATH:-data/dmajor.sqlite}}"
UPLOADS="${UPLOAD_DIR:-uploads}"
BACKUP_ROOT="${1:-${BACKUP_DIR:-backups}}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_ROOT/$STAMP"

mkdir -p "$TARGET"

if [ -f "$DB_PATH" ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_PATH" ".backup '$TARGET/dmajor.sqlite'"
  else
    cp "$DB_PATH" "$TARGET/dmajor.sqlite"
  fi
  echo "数据库已备份 → $TARGET/dmajor.sqlite"
else
  echo "警告：数据库文件不存在（$DB_PATH），跳过"
fi

if [ -d "$UPLOADS" ]; then
  tar -czf "$TARGET/uploads.tar.gz" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")"
  echo "上传文件已备份 → $TARGET/uploads.tar.gz"
fi

# 保留最近 30 份
ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | tail -n +31 | xargs -r rm -rf
echo "备份完成：$TARGET"
