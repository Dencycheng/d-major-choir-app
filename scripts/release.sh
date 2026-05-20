#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-1.1.0}"
REMOTE_URL="${GITHUB_REMOTE_URL:-}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MINIPROGRAM_ROOT="$PROJECT_ROOT/miniprogram"
WECHAT_CLI="${WECHAT_DEVTOOLS_CLI:-/Applications/wechatwebdevtools.app/Contents/MacOS/cli}"

cd "$PROJECT_ROOT"

echo "==> D Major Choir release $VERSION"

echo "==> Checking version files"
node -e "const p=require('./package.json'); if (p.version !== '$VERSION') throw new Error('package.json version mismatch: '+p.version)"
node -e "const c=require('./miniprogram/config/index'); if (c.VERSION !== '$VERSION') throw new Error('miniprogram version mismatch: '+c.VERSION)"

echo "==> Running syntax checks"
node --check server.js
node --check public/app.js
node --check lib/sqlite-store.js
node --check miniprogram/pages/home/home.js
node --check miniprogram/pages/activities/activities.js
node --check miniprogram/pages/practice/practice.js
node --check miniprogram/pages/library/library.js
node --check miniprogram/pages/mine/mine.js

echo "==> Running DB migration and backup"
npm run db:migrate
npm run db:backup

echo "==> Preparing Git repository"
if [ ! -d ".git" ]; then
  git init
  git branch -M main
fi

if [ -n "$REMOTE_URL" ] && ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$REMOTE_URL"
fi

git add .
git commit -m "Release v$VERSION MVP upgrade" || echo "No git changes to commit"

if git remote get-url origin >/dev/null 2>&1; then
  git push -u origin main
else
  echo "No GitHub remote configured. Set GITHUB_REMOTE_URL and rerun, or run: git remote add origin <repo-url>"
fi

echo "==> Uploading WeChat Mini Program"
if [ ! -x "$WECHAT_CLI" ]; then
  echo "WeChat DevTools CLI not found: $WECHAT_CLI"
  exit 1
fi

"$WECHAT_CLI" upload \
  --project "$MINIPROGRAM_ROOT" \
  --version "$VERSION" \
  --desc "D Major Choir MVP v$VERSION: SQLite, member management, leave approval, video score playback"

echo "==> Release finished"
