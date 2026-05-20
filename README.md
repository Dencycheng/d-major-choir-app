# D大调合唱团数字排练空间

面向 D大调合唱团的团务管理、线上练习、谱库资料、点评反馈和数据看板一体化试用系统。

## 当前交付

- Web 管理后台：谱库管理、练习任务、打卡点评、活动签到、数据概览。
- 成员端：今日待办、谱库查看/播放、练习录音上传、活动参加/请假/签到、点评反馈。
- 后端 API：作品 CRUD、资料上传、任务 CRUD、录音上传、点评、活动 CRUD、团员管理、角色权限、考勤写入、文件读取。
- 初始化数据：四个声部、核心角色、测试成员、测试活动、测试曲目、谱库资料与练习任务。
- 本地数据库：业务数据写入 `data/dmajor.sqlite`；`data/db.json` 仅作为旧版迁移来源。
- 本地文件：上传的谱子、音频、视频、录音、头像写入 `uploads/`，并通过 `/api/files/:fileId` 读取。

## 本地运行

```bash
npm start
```

打开 `http://127.0.0.1:4173`。

如果直接打开 `public/index.html`，前端会默认连接 `http://127.0.0.1:4173`，因此仍需要先启动 API 服务。

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

## 生产目标域名

- API：`https://api.dmajorchoir.com`
- Web 管理后台：`https://admin.dmajorchoir.com`

正式部署前，需要按 [docs/deployment.md](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/docs/deployment.md) 配置 DNS、TLS、数据库、对象存储和微信小程序后台。

## 重要安全原则

- 录音、总谱、分声部资料、伴奏音频全部放在私有对象存储桶。
- 前端不得直接持有永久文件 URL。
- 文件访问必须先经过 API 鉴权，再返回短期临时签名 URL。
- 生产环境必须替换 `.env.example` 中所有 `CHANGE_ME`。

## 目录

```text
server.js                 API 与静态资源服务
public/                   Web 管理后台与成员端预览
miniprogram/              微信小程序成员端 MVP
data/db.json              本地试用种子数据
db/migrations/            生产库建表 SQL
db/seeds/                 生产库初始化 SQL
docs/                     部署、环境变量、回滚、测试与小程序说明
uploads/                  本地上传文件目录，保留 .gitkeep，实际文件不入库
scripts/                  migration/seed/smoke 执行脚本
```

## 微信小程序成员端

成员端小程序已生成在 [miniprogram](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/miniprogram)。配置和上传说明见 [docs/miniprogram-member-app.md](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/docs/miniprogram-member-app.md)。

## 2026-05-20 MVP 升级

已升级为 SQLite 持久化、团员管理、角色权限、成员资料、请假审批、视频谱倍速播放版本。完整说明见 [docs/mvp-upgrade-2026-05-20.md](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/docs/mvp-upgrade-2026-05-20.md)。

## 发布

当前版本：`1.1.0`。发布脚本和运行说明见 [docs/release-runbook.md](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/docs/release-runbook.md)。

## 测试账号

详见 [docs/test-accounts.md](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/docs/test-accounts.md)。首次试用前请在生产库执行 seed 后立即修改默认密码或改为验证码/微信登录。
