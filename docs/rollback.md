# 备份与回滚方案

## 数据库备份

上线前、migration 前、seed 后各保留一次备份。

```bash
mkdir -p backups
npm run db:backup
```

建议策略：

- 正式试运行期：每日全量备份，保留 14 天。
- 重要操作前：手动备份。
- 将 `backups/` 定期复制到云硬盘快照或对象存储。

## 数据库恢复

```bash
pm2 stop d-major-choir
cp backups/<backup-file>.sqlite data/dmajor.sqlite
pm2 start d-major-choir
```

恢复前先暂停 API 写入流量，避免恢复过程中产生新数据。

## 应用回滚

```bash
git fetch origin
git checkout <LAST_GOOD_COMMIT>
# 当前版本没有第三方依赖，可跳过安装；后续如新增依赖，使用 npm install --omit=dev
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
