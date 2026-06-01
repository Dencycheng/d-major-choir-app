# v0.5 架构说明

## 目标

v0.5 的目标是让 MVP 从“功能联调”进入“可部署试点”阶段。重点不是扩大业务范围，而是补齐真实使用所必需的安全、部署、导入导出和录音能力。

## 核心变化

### 1. 文件资产化

新增 `file_assets` 表，所有上传文件记录以下信息：

- `asset_id`
- `choir_id`
- `owner_user_id`
- `original_filename`
- `stored_filename`
- `storage_path`
- `content_type`
- `size_bytes`
- `purpose`
- `is_public`

### 2. 鉴权下载

默认不再公开 `/uploads` 静态目录。文件访问统一经过：

```http
GET /api/files/{asset_id}/download
```

支持两种模式：

1. JWT 鉴权访问。
2. 短期签名 URL 访问。

### 3. 小程序真实录音

任务页使用：

```js
wx.getRecorderManager()
wx.uploadFile()
```

完成：

```text
录音 → 上传文件 → 创建 practice_record
```

### 4. 导入导出

新增 CSV 导入导出，先满足试点运营的最小需求：

- 成员 CSV 批量导入。
- 考勤 CSV 导出。
- 练习打卡 CSV 导出。

### 5. 部署与 CI

新增：

- `admin-web/Dockerfile`
- 完整 `docker-compose.yml`
- `.github/workflows/ci.yml`

CI 包含：

- 后端 pytest。
- 管理后台 Vite build。

## 生产化注意事项

1. `JWT_SECRET_KEY` 必须替换为强随机字符串。
2. 生产环境建议关闭 `ALLOW_DEMO_LOGIN_CODE`。
3. 生产文件存储建议接入 S3 / OSS / COS。
4. 签名文件 URL 有效期应保持较短。
5. 录音文件可能涉及隐私，应保留删除和授权策略。
6. 小程序正式发布需要 HTTPS 域名和合法域名配置。
