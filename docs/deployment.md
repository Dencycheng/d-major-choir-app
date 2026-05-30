# 正式环境部署文档

## 目标

- API：`https://api.dmajorchoir.com`
- 管理后台：`https://admin.dmajorchoir.com`
- 数据库：SQLite，数据库文件保存在 `data/dmajor.sqlite`
- 文件：当前 MVP 保存在服务器 `uploads/`，通过 API 鉴权访问；后续可迁移到私有对象存储

## 前置权限

部署执行人需要准备：

- Git 远程仓库地址和写入权限。
- `dmajorchoir.com` DNS 管理权限。
- 云服务器、容器平台或 PaaS 项目权限。
- 服务器防火墙/安全组开放 `80`、`443`。
- 微信小程序管理员或开发者权限。
- TLS 证书自动签发权限，建议使用平台托管证书或 Let's Encrypt。

## 1. Git 仓库

```bash
git init
git add .
git commit -m "Initial D Major Choir trial environment"
git branch -M main
git remote add origin <YOUR_GIT_REPOSITORY_URL>
git push -u origin main
```

## 2. 正式域名与 DNS

ICP备案已完成，正式环境使用域名访问。DNS 建议配置：

| 主机记录 | 类型 | 指向 |
| --- | --- | --- |
| `api` | `A` | `119.45.176.130` |
| `admin` | `A` | `119.45.176.130` |

## 3. 后端部署

推荐用容器或 Node 进程管理器部署：

```bash
cp .env.example .env
# 按服务器实际情况填写 .env，尤其是 ADMIN_ORIGIN、JWT_SECRET、FILE_SIGNING_SECRET
# 当前版本没有第三方依赖，可跳过安装；后续如新增依赖，使用 npm install --omit=dev
npm run db:backup || true
npm run db:migrate
npm run db:migrate-json
mkdir -p uploads/resources uploads/recordings uploads/avatars
NODE_ENV=production HOST=127.0.0.1 PORT=4173 ADMIN_ORIGIN=https://admin.dmajorchoir.com pm2 start server.js --name d-major-choir
pm2 save
```

反向代理：

```nginx
server {
  listen 443 ssl http2;
  server_name api.dmajorchoir.com;

  location / {
    proxy_pass http://127.0.0.1:4173;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}

server {
  listen 443 ssl http2;
  server_name admin.dmajorchoir.com;

  location / {
    proxy_pass http://127.0.0.1:4173;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

健康检查：

```bash
curl https://api.dmajorchoir.com/api/health
```

预期返回 `status: ok`。

## 4. Web 管理后台部署

生产前将配置文件替换为：

```bash
cp public/config.production.example.js public/config.js
```

当前正式 MVP 仍由同一个 Node 服务托管 `public/`，访问 `https://admin.dmajorchoir.com` 即可进入管理后台。`public/config.js` 必须指向 `https://api.dmajorchoir.com`。

## 5. 数据库 migration、seed 与备份

```bash
npm run db:backup
npm run db:migrate
npm run db:migrate-json
```

初始化内容：

- 四个声部：女高、女低、男高、男低。
- 角色：超级管理员、管理员、指挥、S/A/T/B 声部长、普通成员。
- 测试曲目《月光》。
- 总谱、四声部示范、伴奏音频的本地文件记录。
- 活动签到、练习打卡点评、谱库查看播放三条闭环所需数据。

## 6. 文件存储

当前正式 MVP 使用服务器本地 `uploads/` 保存谱子、头像、录音和音频文件。不要把 `uploads/` 配成 Nginx 静态公开目录，文件必须通过 API 鉴权读取。

推荐路径：

```text
uploads/resources/<file-id>-score.pdf
uploads/resources/<file-id>-alto-demo.mp3
uploads/recordings/<file-id>-practice.m4a
uploads/avatars/<file-id>-avatar.jpg
```

访问流程：

1. 前端请求 API：`GET /api/files/:fileId`。
2. API 校验登录、合唱团、声部和资料权限。
3. API 读取本地文件并返回。
4. 后续迁移到腾讯云 COS 时，再改为 API 返回 5-10 分钟有效的临时签名 URL。

## 7. 微信小程序体验版

见 [docs/wechat-miniprogram.md](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/docs/wechat-miniprogram.md)。

## 8. 冒烟测试

部署完成后执行：

```bash
API_BASE_URL=https://api.dmajorchoir.com npm run smoke
```

并填写 [docs/smoke-test-report.md](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/docs/smoke-test-report.md)。
