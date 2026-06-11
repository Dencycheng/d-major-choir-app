#!/usr/bin/env bash
# 从指定备份恢复（PRD V2.1 §10.2）
# 用法：bash scripts/restore.sh backups/20260611-120000
set -euo pipefail

SOURCE="${1:?用法：bash scripts/restore.sh <备份目录>}"
DB_PATH="${SQLITE_DB_PATH:-${DATABASE_PATH:-data/dmajor.sqlite}}"
UPLOADS="${UPLOAD_DIR:-uploads}"

if [ ! -d "$SOURCE" ]; then
  echo "备份目录不存在：$SOURCE" >&2
  exit 1
fi

echo "即将恢复备份 $SOURCE → 数据库 $DB_PATH / 上传目录 $UPLOADS"
echo "恢复前请先停止服务：pm2 stop dmajor-app"
read -r -p "确认继续？(yes/no) " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "已取消"; exit 1; }

if [ -f "$SOURCE/dmajor.sqlite" ]; then
  mkdir -p "$(dirname "$DB_PATH")"
  cp "$SOURCE/dmajor.sqlite" "$DB_PATH"
  echo "数据库已恢复"
fi

if [ -f "$SOURCE/uploads.tar.gz" ]; then
  mkdir -p "$UPLOADS"
  tar -xzf "$SOURCE/uploads.tar.gz" -C "$(dirname "$UPLOADS")"
  echo "上传文件已恢复"
fi

echo "恢复完成，请执行 npm run migrate && pm2 restart dmajor-app"
