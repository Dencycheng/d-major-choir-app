# 正式环境部署文档（V2.1）

## 目标

- API：`https://api.dmajorchoir.com`（Nginx 443 → 127.0.0.1:4173）
- 管理后台：`https://admin.dmajorchoir.com`（同一 Node 进程静态托管 `public/`）
- 服务器：腾讯云 Ubuntu 22.04（119.45.176.130），Node ≥ 22.5 + PM2 + Nginx + Certbot
- 数据与代码分离：
  - 代码：`/home/ubuntu/d_major_APP`
  - 数据库：`/home/ubuntu/d_major_runtime/data/dmajor.sqlite`
  - 上传文件：`/home/ubuntu/d_major_runtime/uploads`
  - 备份：`/home/ubuntu/d_major_runtime/backups`

## 1. DNS

| 主机记录 | 类型 | 指向 |
| --- | --- | --- |
| `api` | `A` | `119.45.176.130` |
| `admin` | `A` | `119.45.176.130` |

ICP 备案已完成，全部走域名 + HTTPS。

## 2. 首次部署 / 升级到 V2.1

```bash
ssh ubuntu@119.45.176.130

# 0) 升级前备份（老版本可用 npm run db:backup）
cd /home/ubuntu/d_major_APP && npm run backup || npm run db:backup || true

# 1) 拉取代码
git pull origin main

# 2) 准备运行时目录（首次）
mkdir -p /home/ubuntu/d_major_runtime/{data,uploads,backups}
# 如老库在代码目录内，迁移一次：
[ -f data/dmajor.sqlite ] && cp -n data/dmajor.sqlite /home/ubuntu/d_major_runtime/data/
[ -d uploads ] && cp -rn uploads/. /home/ubuntu/d_major_runtime/uploads/ || true

# 3) 配置环境变量
cp -n .env.example .env && vim .env
```

`.env` 生产关键项：

```ini
NODE_ENV=production
PORT=4173
ADMIN_ORIGIN=https://admin.dmajorchoir.com
JWT_SECRET=<openssl rand -hex 32>
FILE_SIGNING_SECRET=<openssl rand -hex 32>
SESSION_TTL_HOURS=336

SQLITE_DB_PATH=/home/ubuntu/d_major_runtime/data/dmajor.sqlite
UPLOAD_DIR=/home/ubuntu/d_major_runtime/uploads
BACKUP_DIR=/home/ubuntu/d_major_runtime/backups

# 小程序正式登录（微信公众平台获取）
WECHAT_APP_ID=wx开头的AppID
WECHAT_APP_SECRET=小程序密钥（只放服务器 .env，严禁进 Git/小程序代码）

# 首个管理员（create-admin 读取后即可从 .env 删除密码行）
ADMIN_EMAIL=admin@dmajorchoir.com
ADMIN_PASSWORD=一次性初始密码
```

```bash
# 4) 迁移 + 管理员
npm run migrate
npm run seed            # 首次部署导入演示数据，可跳过
npm run create-admin    # 首登强制改密

# 5) 启动 / 重启
pm2 start server.js --name dmajor-app || pm2 restart dmajor-app
pm2 save
```

## 3. Nginx + HTTPS

```nginx
server {
  listen 443 ssl http2;
  server_name api.dmajorchoir.com admin.dmajorchoir.com;
  ssl_certificate     /etc/letsencrypt/live/api.dmajorchoir.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.dmajorchoir.com/privkey.pem;
  client_max_body_size 220m;

  location / {
    proxy_pass http://127.0.0.1:4173;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
server {
  listen 80;
  server_name api.dmajorchoir.com admin.dmajorchoir.com;
  return 301 https://$host$request_uri;
}
```

```bash
sudo certbot --nginx -d api.dmajorchoir.com -d admin.dmajorchoir.com
sudo nginx -t && sudo systemctl reload nginx
```

## 4. 微信小程序

1. 公众平台 →「开发管理 → 开发设置 → 服务器域名」：request / uploadFile / downloadFile 合法域名均加入 `https://api.dmajorchoir.com`。
2. `miniprogram/config/index.js` 的 `ENV` 保持 `production`。
3. 开发者工具上传体验版；体验成员通过后台生成的邀请码入团。
4. 本地联调：`ENV` 改为 `development`（指向 `http://119.45.176.130:4173` 或本机），工具勾选"不校验合法域名"。未配置 `WECHAT_APP_SECRET` 时开发模式自动使用模拟 openid。

## 5. 备份与恢复

```bash
npm run backup                       # SQLite + uploads → backups/<时间戳>/，保留 30 份
npm run restore -- backups/<时间戳>   # 恢复（需输入 yes 确认），恢复后 pm2 restart dmajor-app
```

建议 crontab 每日备份：`0 3 * * * cd /home/ubuntu/d_major_APP && npm run backup >> /home/ubuntu/d_major_runtime/backup.log 2>&1`

## 6. 验证

```bash
curl -s https://api.dmajorchoir.com/api/health         # {"status":"ok","version":"2.1.0",...}
curl -s https://api.dmajorchoir.com/api/bootstrap      # 应返回 401（未登录）
API_BASE_URL=https://api.dmajorchoir.com ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/smoke-test.js
```

> 注意：冒烟测试会写入测试数据（曲目/任务/邀请码/成员），生产环境建议在首次上线验收后清理，或仅在预发环境跑全量冒烟。

## 7. 回滚

见 `docs/rollback.md`：`git checkout <上一版本 tag>` + `npm run restore -- backups/<升级前备份>` + `pm2 restart dmajor-app`。
