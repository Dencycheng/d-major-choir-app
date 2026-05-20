# D Major Choir 全员可用 MVP 升级说明

## 产品参考方向

本轮优化参考了 ChoirMate、Chorus Connection、Choir Genius、Choirhub 等合唱团管理产品的公开功能方向：乐谱/音频资料库、排练日历、出勤管理、成员名册、角色权限、练习曲目/分声部资料、消息通知和成员自助资料维护。

参考：

- https://www.choirmate.com/
- https://www.chorusconnection.com/features
- https://www.choirgenius.com/features/
- https://choirhub.app/

## 修改文件清单

### 后端与数据库

- `server.js`：改为 SQLite 数据源，新增团员、角色权限、资料变更、请假审批、视频谱等 API。
- `lib/sqlite-store.js`：SQLite 读写层、迁移执行、db.json 兼容数据映射。
- `database/migrations/001_init.sql`：SQLite 表结构。
- `database/seeds/001_roles_permissions.sql`：内置角色和权限。
- `scripts/db-migrate.js`：执行 migrations 和基础 seed。
- `scripts/migrate-db-json.js`：把现有 `data/db.json` 迁移到 `data/dmajor.sqlite`，已有真实数据时自动跳过。
- `scripts/db-backup.js`：SQLite 文件备份。
- `package.json`：新增 `db:migrate`、`db:migrate-json`、`db:backup`。
- `.gitignore`：忽略 SQLite 数据库、备份和 uploads 实际文件。

### Web 管理后台与成员端

- `public/app.js`：新增团员管理、角色权限、成员资料、请假审批、视频谱倍速播放。
- `public/styles.css`：新增头像、角色权限、视频播放器、资料页样式。

### 小程序

- `miniprogram/pages/activities/*`：温暖确认弹窗、请假理由输入、签到提示。
- `miniprogram/pages/library/*`：视频谱/排练视频播放，支持 0.75x、1x、1.25x、1.5x。
- `miniprogram/pages/mine/*`：我的资料、头像上传、昵称/手机/邮箱/声部申请。
- `miniprogram/utils/format.js`：视频资源识别。

## 数据库表结构

| 表 | 用途 |
| --- | --- |
| `schema_migrations` | migration 版本记录，避免重复执行 |
| `choir` | 合唱团基础信息 |
| `sections` | S/A/T/B 声部 |
| `roles` | 内置和自定义角色 |
| `permissions` | 权限字典 |
| `role_permissions` | 角色权限关系 |
| `members` | 团员资料：姓名、昵称、头像、手机号、邮箱、声部、角色、状态、备注 |
| `profile_change_requests` | 成员资料/声部变更审核 |
| `events` | 排练、演出、会议等活动 |
| `attendance` | 参加、请假、签到、缺勤记录 |
| `leave_requests` | 请假审批流 |
| `works` | 作品 |
| `resources` | 总谱、分声部谱、歌词、伴奏、分声部音频、视频谱、排练视频 |
| `file_assets` | uploads 文件元数据，数据库与文件分离 |
| `practice_tasks` | 练习任务 |
| `practice_records` | 录音打卡、自评、点评、AI 预留评分字段 |
| `notifications` | 后续通知消息预留 |

完整 SQL 见 `database/migrations/001_init.sql`。

## 迁移脚本

```bash
npm run db:migrate
npm run db:migrate-json
```

说明：

- `db:migrate` 只执行未执行过的 SQL migration。
- `db:migrate-json` 把现有 `data/db.json` 测试数据迁入 SQLite。
- 如果 SQLite 已有成员、作品或活动数据，迁移会跳过，避免覆盖真实数据。
- `uploads/` 与 SQLite 分离保存，数据库只记录文件元数据和相对路径。

## 备份机制

```bash
npm run db:backup
```

备份输出到：

```text
backups/dmajor-<timestamp>.sqlite
```

建议生产环境：

- 每日定时备份 SQLite。
- 每次部署前执行一次备份。
- `uploads/` 目录用对象存储或服务器快照单独备份。

## 本地启动方式

```bash
npm run db:migrate
npm run db:migrate-json
npm start
```

访问：

```text
http://127.0.0.1:4173
```

小程序开发：

1. 微信开发者工具打开 `miniprogram/`。
2. 本地调试时把 `miniprogram/config/index.js` 的 `ENV` 改为 `development`。
3. 临时试用版保持 `production`，API 使用 `http://119.45.176.130:4173`。

## 服务器部署步骤

```bash
git pull
npm ci --omit=dev
npm run db:backup
npm run db:migrate
npm run db:migrate-json
mkdir -p uploads/resources uploads/recordings uploads/avatars
NODE_ENV=production HOST=0.0.0.0 PORT=4173 npm start
```

Nginx/腾讯云反代：

- 当前临时环境直接使用 `http://119.45.176.130:4173`，管理后台与 API 暂共用同一个入口。
- 确保 `public/config.js` 指向 `http://119.45.176.130:4173`。
- 小程序当前也指向 `http://119.45.176.130:4173`。微信正式体验版通常要求 HTTPS 合法域名，备案完成后再统一切换。

## 测试账号

当前迁移保留原测试成员：

| 姓名 | 成员 ID | 声部 | 角色 |
| --- | --- | --- | --- |
| 林安 | `m-alto-01` | A 女低 | 成员 |
| 陈声 | `m-alto-02` | A 女低 | 声部长 |
| 周亦 | `m-sop-01` | S 女高 | 声部长 |
| 梁远 | `m-tenor-01` | T 男高 | 声部长 |
| 何宁 | `m-bass-01` | B 男低 | 声部长 |

当前 MVP 仍使用 `X-Member-Id` 模拟登录身份。小程序默认 `m-alto-01`，后续接微信登录后替换该来源。

## 功能验收清单

- 团员管理：新增、编辑、删除团员，字段完整写入 SQLite。
- 角色权限：可保存角色权限配置。
- 成员资料：成员可上传头像、修改昵称/手机号/邮箱。
- 声部申请：成员申请修改声部后进入待审核，管理员同意后声部变化。
- 活动：成员参加弹出“确认参加，期待一起唱歌。”。
- 请假：成员填写理由后进入待审批，后台可同意/不同意并备注。
- 签到：成员签到后提示“签到成功，快快开嗓一起唱吧。”，后台统计更新。
- 谱库：支持 PDF、图片、电子谱、伴奏、分声部音频、视频谱、排练视频。
- 视频谱：成员端可用 0.75x、1x、1.25x、1.5x 倍速播放。
- 练习：任务发布、成员录音打卡、自评、后台点评、成员查看反馈完整闭环。
- 数据：重启服务后 SQLite 数据不丢失，`uploads/` 文件与数据库分离保存。
