# 备份与回滚方案

## 数据库备份

上线前、migration 前、seed 后各保留一次备份。

```bash
mkdir -p backups
pg_dump "$DATABASE_URL" --format=custom --file="backups/dmajor_$(date +%Y%m%d_%H%M%S).dump"
```

建议策略：

- 试用期：每日全量备份，保留 14 天。
- 重要操作前：手动备份。
- 生产库开启 PITR 或至少启用云数据库自动备份。

## 数据库恢复

```bash
pg_restore --clean --if-exists --dbname "$DATABASE_URL" backups/<backup-file>.dump
```

恢复前先暂停 API 写入流量，避免恢复过程中产生新数据。

## 应用回滚

```bash
git fetch origin
git checkout <LAST_GOOD_COMMIT>
npm ci --omit=dev
NODE_ENV=production npm start
```

如果使用容器，回滚到上一版镜像 tag。

## 对象存储回滚

- 私有桶开启版本控制。
- 谱库资源删除采用软删除：数据库标记 `archived`，对象不立即物理删除。
- 若谱子或音频误更新，恢复上一对象版本并更新 `resources.version`。

## 回滚验收

- `GET /api/health` 返回 `ok`。
- 管理后台可登录。
- 谱库私有文件仍通过临时签名访问。
- 最近一次活动、任务、点评数据一致。
