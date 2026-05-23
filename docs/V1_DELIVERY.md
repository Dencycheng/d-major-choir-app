# D Major Choir App V1 真实试用版交付说明

## 修改文件清单

- `.gitignore`
- `server.js`
- `lib/sqlite-store.js`
- `package.json`
- `scripts/db-backup.js`
- `scripts/db-restore.js`
- `miniprogram/config/index.js`
- `uploads/.gitkeep`

## 数据库表结构

当前 V1 使用 SQLite，迁移文件位于 `database/migrations/001_init.sql`，运行时通过 `lib/sqlite-store.js` 自动执行。

核心表：

- `choir`: 合唱团基础资料。
- `sections`: 女高、女中、男高、男低等声部。
- `roles`: 团长、指挥、钢琴伴奏、声部长、声部首席、普通成员等角色。
- `permissions`: 成员管理、活动管理、请假审批、签到管理、任务发布、点评、谱库、看板等权限。
- `role_permissions`: 角色与权限绑定。
- `members`: 团员姓名、昵称、头像、手机号、邮箱、声部、角色、状态、备注。
- `profile_change_requests`: 成员资料变更审核，含声部调整申请。
- `events`: 排练、演出、会议等活动。
- `attendance`: 参加、请假待审批、请假、已签到、缺勤等考勤记录。
- `leave_requests`: 请假申请、审批结果和审批备注。
- `works`: 作品资料。
- `resources`: 总谱、分声部谱、歌词、伴奏、分声部音频、视频谱、排练视频、图片谱、电子谱、其他资料。
- `practice_tasks`: 练习任务。
- `practice_records`: 练习打卡、录音、自评、点评和 AI 评分预留字段。
- `file_assets`: 上传文件元数据。
- `notifications`: 通知预留表。

## 迁移脚本说明

```bash
npm run db:migrate
npm run db:migrate-json
```

- `db:migrate`: 执行 SQLite schema migrations。
- `db:migrate-json`: 从 `data/db.json` 导入旧数据；如果 SQLite 已有真实业务数据，会自动跳过，避免覆盖。

生产默认路径：

```bash
SQLITE_PATH=/home/ubuntu/d_major_data/dmajor.sqlite
UPLOAD_DIR=/home/ubuntu/d_major_uploads
```

## 本地启动方式

```bash
npm install
npm run db:migrate
npm run db:migrate-json
npm start
```

打开：

```bash
http://127.0.0.1:4173
```

## 服务器部署步骤

```bash
mkdir -p /home/ubuntu/d_major_data /home/ubuntu/d_major_uploads /home/ubuntu/d_major_backups
export NODE_ENV=production
export HOST=0.0.0.0
export PORT=4173
export SQLITE_PATH=/home/ubuntu/d_major_data/dmajor.sqlite
export UPLOAD_DIR=/home/ubuntu/d_major_uploads
export BACKUP_DIR=/home/ubuntu/d_major_backups
npm install --omit=dev
npm run db:migrate
npm run db:migrate-json
npm start
```

备案通过前 development 环境继续使用：

```bash
http://119.45.176.130:4173
```

生产域名保留：

```bash
https://api.dmajorchoir.com
```

## 备份与恢复

备份 SQLite 和 uploads：

```bash
npm run db:backup
```

恢复：

```bash
npm run db:restore -- /home/ubuntu/d_major_backups/dmajor-YYYYMMDDTHHMMSS.sqlite /home/ubuntu/d_major_backups/uploads-YYYYMMDDTHHMMSS
```

## 小程序测试步骤

1. 用微信开发者工具打开 `miniprogram`。
2. 确认 `miniprogram/config/index.js` 中 `ENV = "development"`。
3. development API 为 `http://119.45.176.130:4173`。
4. 首页检查最近排练、本周任务、最新点评、谱库入口。
5. 活动页测试参加确认、请假理由、签到提示。
6. 练习页测试任务查看、打卡、自评、上传录音。
7. 谱库页测试 PDF、音频、视频谱查看和播放。
8. 我的页测试资料查看、头像/昵称修改和声部申请审核。

## 测试账号

当前 Demo 数据以 `data/db.json` 和 seed 为准：

- 当前成员默认 ID：`m-alto-01`
- 后台入口：同一 Web 页面切换到“管理后台”
- 成员端入口：同一 Web 页面切换到“成员端”

## 功能验收清单

- 团员可新增、查看、编辑、删除。
- 团员可按声部、角色、状态和资料字段检索筛选。
- 角色权限可配置。
- 成员可查看我的资料、上传头像、修改昵称。
- 成员申请调整声部后进入待审核。
- 活动参加弹出“确认参加，期待一起唱歌。”
- 请假需要填写理由，后台可同意/不同意并备注。
- 签到成功提示“签到成功，快快开嗓一起唱吧。”
- 后台活动详情显示参加、请假、待审批、签到、缺勤统计。
- 谱库支持 PDF、图片谱、电子谱、音频、视频谱。
- 视频谱支持 0.75x、1x、1.25x、1.5x。
- AI 音准、节奏评分字段已在练习记录中预留。
- 真实数据库和 uploads 不进入 Git。

## 已知未完成事项

- 当前权限配置以 UI 和数据表为主，部分接口仍需继续补强细粒度鉴权。
- 正式微信登录、短信验证码和多管理员账号体系仍待接入。
- AI 音准/节奏评分尚未接入真实评分服务。
- ICP 备案完成前，小程序真机发布仍需按微信合法域名要求处理。
