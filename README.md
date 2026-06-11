# D大调合唱团数字排练空间

面向 D大调合唱团的团务管理、线上练习、谱库资料、点评反馈和数据看板一体化系统（V2.1，正式登录体系）。

## 当前交付（V2.1）

- 正式登录体系：后台邮箱/手机号 + 密码（scrypt 哈希、失败锁定、首登强制改密、登录日志）；小程序 `wx.login` 静默登录。
- 邀请码入团：后台生成邀请码 → 小程序提交入团申请 → 审核通过自动建档绑定微信。
- RBAC 权限与数据隔离：全部接口 Bearer Token 鉴权；普通成员看不到他人录音/请假理由/手机号明文；声部长只管本声部；文件流鉴权访问；操作审计日志。
- Web 管理后台：谱库管理、练习任务、打卡点评、活动签到、成员/角色、邀请与入团审核、登录/操作日志、数据概览。
- 成员端小程序：今日待办、谱库查看/播放（视频 0.75x–1.5x 倍速）、练习录音打卡、活动参加/请假/签到、点评反馈、入团申请页。
- 数据库：SQLite（`node:sqlite`，零第三方依赖），migrations + seed + 备份/恢复脚本；生产环境数据与代码目录分离。

## 环境要求

- Node.js >= 22.5（使用内置 `node:sqlite`）
- 无任何第三方 npm 依赖

## 本地运行

```bash
cp .env.example .env                  # 配置 JWT_SECRET、ADMIN_EMAIL、ADMIN_PASSWORD 等
npm run migrate                       # 建表（含 V2.1 账号体系）
npm run seed                          # 可选：导入演示数据（声部/活动/曲目等）
npm run create-admin                  # 创建超级管理员（首登强制改密）
npm start                             # http://127.0.0.1:4173
```

打开 `http://127.0.0.1:4173`，使用 `.env` 中的管理员账号登录后台。

小程序：微信开发者工具导入 `miniprogram/`，本地联调将 `miniprogram/config/index.js` 的 `ENV` 改为 `development` 并勾选"不校验合法域名"；未配置 `WECHAT_APP_SECRET` 时开发模式自动使用模拟 openid，可直接走"邀请码 → 入团 → 审核"流程。

## 冒烟测试

```bash
# 服务启动后：
ADMIN_EMAIL=admin@dmajorchoir.com ADMIN_PASSWORD=<初始密码> npm run smoke
```

34 步覆盖：登录/改密/锁定 → 邀请码 → 入团审核 → 权限隔离（401/403/428）→ 谱库上传与文件流鉴权 → 活动响应/签到 → 打卡 → 点评 → 登出撤销。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run migrate` | 应用 `database/migrations/` 全部迁移 |
| `npm run seed` | 从 `data/db.json` 导入演示数据（已有数据时自动跳过） |
| `npm run create-admin` | 创建/重置超级管理员（`--reset-password` 重置密码） |
| `npm run smoke` | 全链路冒烟测试 |
| `npm run backup` / `npm run restore -- <dir>` | SQLite + uploads 备份/恢复（保留 30 份） |

## 文档

- 部署：`docs/deployment.md`（域名/Nginx/PM2/数据目录分离/微信配置）
- 验收清单：`docs/acceptance-v2.1.md`
- 回滚：`docs/rollback.md`
- 测试账号：`docs/test-accounts.md`
- 版本记录：`RELEASE_NOTES.md`

## MVP 真实闭环

### 谱库管理

1. 管理后台进入“谱库管理”。
2. 新增作品。
3. 上传资料，支持类型：总谱、分声部谱、歌词、伴奏、示范音频。
4. 成员端进入“谱库”，可查看 PDF 或播放音频。

### 练习任务与打卡点评

1. 管理后台进入“练习任务”，选择作品、声部、截止时间、打卡次数并创建任务。
2. 成员端进入“练习任务”，只会看到自己声部相关任务。
3. 成员上传录音，填写练习感受和音准/节奏/气息自评。
4. 管理后台进入“打卡点评”，播放录音并提交点评。
5. 成员端进入“我的反馈”查看点评。

### 活动与签到

1. 管理后台进入“活动签到”，创建排练活动。
2. 成员端进入“活动”，反馈参加或请假。
3. 成员点击签到后，后台活动统计和考勤明细同步更新。

## 主要 API

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/bootstrap` | 加载页面所需全部业务数据 |
| `POST` | `/api/works` | 新增作品 |
| `PUT` | `/api/works/:id` | 编辑作品 |
| `DELETE` | `/api/works/:id` | 删除作品 |
| `POST` | `/api/resources/upload` | 上传 PDF、音频或歌词资料 |
| `DELETE` | `/api/resources/:id` | 删除资料记录 |
| `GET` | `/api/files/:fileId` | 读取已上传文件 |
| `POST` | `/api/tasks` | 创建练习任务 |
| `PUT` | `/api/tasks/:id` | 编辑练习任务 |
| `DELETE` | `/api/tasks/:id` | 删除练习任务 |
| `POST` | `/api/practice/records` | 上传录音打卡 |
| `POST` | `/api/feedback` | 提交点评 |
| `POST` | `/api/events` | 创建活动 |
| `PUT` | `/api/events/:id` | 编辑活动 |
| `DELETE` | `/api/events/:id` | 删除活动 |
| `POST` | `/api/events/respond` | 成员反馈参加/请假 |
| `POST` | `/api/events/checkin` | 成员签到 |

## 正式部署地址

- API：`https://api.dmajorchoir.com`
- Web 管理后台：`https://admin.dmajorchoir.com`

`dmajorchoir.com` ICP 备案已完成，正式部署按 [docs/deployment.md](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/docs/deployment.md) 配置 DNS、TLS、数据库、文件存储和微信小程序合法域名。

## 重要安全原则

- 录音、总谱、分声部资料、伴奏音频必须通过 API 鉴权读取，当前保存在服务器 `uploads/`。
- 前端不得直接持有永久文件 URL。
- 文件访问必须先经过 API 鉴权；后续迁移对象存储时再返回短期临时签名 URL。
- 生产环境必须替换 `.env.example` 中所有 `CHANGE_ME`。

## 目录

```text
server.js                 API 与静态资源服务
public/                   Web 管理后台与成员端预览
miniprogram/              微信小程序成员端 MVP
data/db.json              旧版迁移来源
database/migrations/      SQLite migration
database/seeds/           SQLite 初始化权限数据
docs/                     部署、环境变量、回滚、测试与小程序说明
uploads/                  本地上传文件目录，保留 .gitkeep，实际文件不入库
scripts/                  migration/seed/smoke 执行脚本
```

## 微信小程序成员端

成员端小程序已生成在 [miniprogram](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/miniprogram)。配置和上传说明见 [docs/miniprogram-member-app.md](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/docs/miniprogram-member-app.md)。

## 2026-05-20 MVP 升级

已升级为 SQLite 持久化、团员管理、角色权限、成员资料、请假审批、视频谱倍速播放版本。完整说明见 [docs/mvp-upgrade-2026-05-20.md](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/docs/mvp-upgrade-2026-05-20.md)。

## 发布

当前版本：`1.2.0`。发布脚本和运行说明见 [docs/release-runbook.md](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/docs/release-runbook.md)。

## 测试账号

详见 [docs/test-accounts.md](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/docs/test-accounts.md)。首次正式使用前请在生产库执行 seed 后立即修改默认密码或改为验证码/微信登录。
