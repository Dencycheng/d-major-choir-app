# 环境变量说明

| 变量 | 示例 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `production` | 运行环境。 |
| `HOST` | `127.0.0.1` | 正式环境由 Nginx/HTTPS 反向代理转发到本地 Node 服务。 |
| `PORT` | `4173` | API 服务端口。 |
| `API_ORIGIN` | `https://api.dmajorchoir.com` | 正式 API 地址。 |
| `ADMIN_ORIGIN` | `https://admin.dmajorchoir.com` | 管理后台公网域名，用于 CORS 白名单。 |
| `SQLITE_DB_PATH` | `data/dmajor.sqlite` | SQLite 数据库文件路径。 |
| `JWT_SECRET` | `...` | 登录令牌签名密钥，至少 32 位。 |
| `WECHAT_APP_ID` | `wx...` | 微信小程序 AppID。 |
| `WECHAT_APP_SECRET` | `...` | 微信小程序密钥。 |
| `OBJECT_STORAGE_PROVIDER` | `local` | 当前 MVP 使用本地 `uploads/`；后续可映射 S3、COS、OSS。 |
| `OBJECT_STORAGE_BUCKET` | `dmajor-choir-private-prod` | 私有桶名称。 |
| `OBJECT_STORAGE_PRIVATE_BASE_URL` | `https://...` | 私有桶签名访问基地址。 |
| `OBJECT_STORAGE_ACCESS_KEY_ID` | `...` | 对象存储访问 key。 |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | `...` | 对象存储访问 secret。 |
| `FILE_SIGNING_SECRET` | `...` | 文件临时签名密钥，至少 32 位。 |
| `SIGNED_URL_TTL_SECONDS` | `600` | 临时链接有效期，建议 5-10 分钟。 |

生产环境不允许提交 `.env` 到 Git。密钥应保存在云平台 Secret Manager、CI Secret 或服务器只读环境配置中。
