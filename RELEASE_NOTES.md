# Release Notes

## v2.1.0 - 2026-06-11

正式登录体系与权限隔离版本（可正式测试）。

### 登录与账号
- 管理后台改为邮箱/手机号 + 密码登录；密码使用 scrypt（内存困难型 KDF，`node:crypto` 内置）加盐哈希存储，明文绝不落库。
- 会话采用 256-bit 随机 Token（服务端仅存 HMAC-SHA256 哈希，登出即撤销），默认有效期 14 天（`SESSION_TTL_HOURS` 可配）。
- 登录失败 10 分钟内 5 次即锁定账号 10 分钟；登录成功/失败均写入 `login_logs`。
- 管理员通过 `npm run create-admin` 创建，首次登录强制修改初始密码（未改密前业务接口返回 428）。
- 小程序端使用 `wx.login` 静默登录（`/api/auth/wechat`），彻底移除 `DEFAULT_MEMBER_ID` 与 `X-Member-Id` 演示机制。

### 邀请码与入团
- 后台可生成邀请码（支持目标声部、有效期、可用次数、停用）。
- 新用户在小程序凭邀请码提交入团申请（新增 `pages/join` 页面），管理员/团长审核通过后自动建档并绑定登录账号。

### 权限与数据隔离（RBAC）
- 全部业务接口要求 Bearer Token；按角色权限点强制校验（任务发布、点评、请假审批、谱库/成员/活动管理、看板、邀请管理等）。
- 普通成员看不到他人录音、他人请假理由、他人手机号明文（脱敏）；声部长仅能管理/点评本声部。
- 文件流鉴权：谱库资料按可见范围、录音仅本人/点评者/管理员可访问；`<audio>/<image>` 标签通过 `?token=` 携带凭证。
- 新增 `operation_logs` 操作审计与后台查询接口。

### 数据与运维
- 新增迁移 `002_auth_accounts.sql`（users / auth_sessions / login_logs / invite_codes / join_requests / operation_logs）。
- 新增 `scripts/backup.sh` / `scripts/restore.sh`（SQLite + uploads 打包，保留最近 30 份）。
- 支持生产环境数据与代码目录分离：`SQLITE_DB_PATH`、`UPLOAD_DIR`、`BACKUP_DIR`。
- 冒烟测试重写为 34 步全链路（登录→改密→邀请→入团→审核→权限隔离→谱库→活动→打卡→点评→登出）。


## v1.2.0 - 2026-05-30

- Switched production API to `https://api.dmajorchoir.com`.
- Switched production admin entry to `https://admin.dmajorchoir.com`.
- Updated Mini Program, Web config, backend CORS defaults, environment examples, release docs, and deployment docs for the ICP-approved domain deployment.

## v1.1.3 - 2026-05-20

- Migrated the temporary trial endpoint to the new Tencent Cloud server.
- Updated Web, Mini Program, backend CORS defaults, environment examples, and deployment docs for the new server.
- Kept the project on temporary IP access while ICP filing was pending.

## v1.1.2 - 2026-05-20

- Switched temporary trial API base URL before ICP filing is complete.
- Updated Web and Mini Program configuration for the temporary Tencent Cloud IP endpoint.

## v1.1.1 - 2026-05-20

- Added `GET` and `PUT` compatibility for `/api/profile`.
- Improved Mini Program request retry and diagnostics for `ERR_CONNECTION_RESET`.
- Added loading state for member profile save.

## v1.1.0 - 2026-05-20

- Replaced `db.json` runtime storage with SQLite (`data/dmajor.sqlite`).
- Added migrations, seed, JSON migration, and backup scripts.
- Added member management, role permission configuration, profile editing, avatar upload, section-change review, and leave approval.
- Expanded library resource types to include video score and rehearsal video.
- Added video playback speed controls: 0.75x, 1x, 1.25x, 1.5x.
- Updated WeChat Mini Program member flows for warm attendance confirmation, leave reason input, profile editing, avatar upload, and video playback.
