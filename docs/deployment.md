# 正式试用环境部署文档

## 目标

- API：`https://api.dmajorchoir.com`
- 管理后台：`https://admin.dmajorchoir.com`
- 数据库：生产 PostgreSQL
- 文件：私有对象存储桶，录音和谱子通过 API 鉴权后返回临时签名 URL

## 前置权限

部署执行人需要准备：

- Git 远程仓库地址和写入权限。
- `dmajorchoir.com` DNS 管理权限。
- 云服务器、容器平台或 PaaS 项目权限。
- 生产 PostgreSQL 管理权限。
- 对象存储私有桶和签名访问权限。
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

## 2. DNS

创建两条记录：

| 主机记录 | 类型 | 指向 |
| --- | --- | --- |
| `api` | `CNAME` 或 `A` | API 服务入口 |
| `admin` | `CNAME` 或 `A` | Web 静态站点入口 |

## 3. 后端部署

推荐用容器或 Node 进程管理器部署：

```bash
cp .env.example .env
# 填写生产变量
npm ci --omit=dev
npm run migrate
npm run seed
NODE_ENV=production npm start
```

反向代理：

```nginx
server {
  server_name api.dmajorchoir.com;

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

将 `public/` 作为静态站点部署到 `https://admin.dmajorchoir.com`。静态站点需要支持 fallback 到 `index.html`。

## 5. 数据库 migration 与 seed

```bash
psql "$DATABASE_URL" -f db/migrations/001_init.sql
psql "$DATABASE_URL" -f db/seeds/001_trial_seed.sql
```

初始化内容：

- 四个声部：女高、女低、男高、男低。
- 角色：超级管理员、管理员、指挥、S/A/T/B 声部长、普通成员。
- 测试曲目《月光》。
- 总谱、四声部示范、伴奏音频的私有对象 key。
- 活动签到、练习打卡点评、谱库查看播放三条闭环所需数据。

## 6. 对象存储

必须创建私有桶，禁止公开读。

推荐路径：

```text
works/moon/score-v3.pdf
works/moon/soprano-demo.mp3
works/moon/alto-demo.mp3
works/moon/tenor-demo.mp3
works/moon/bass-demo.mp3
works/moon/piano-accompaniment.m4a
practice-records/<task-id>/<member-id>/<record-id>.m4a
```

访问流程：

1. 前端请求 API：`GET /api/files/sign?resourceId=r-01`。
2. API 校验登录、合唱团、声部和资料权限。
3. API 返回 5-10 分钟有效的临时签名 URL。
4. 前端用临时 URL 预览 PDF 或播放音频。

## 7. 微信小程序体验版

见 [docs/wechat-miniprogram.md](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/docs/wechat-miniprogram.md)。

## 8. 冒烟测试

部署完成后执行：

```bash
API_BASE_URL=https://api.dmajorchoir.com npm run smoke
```

并填写 [docs/smoke-test-report.md](/Users/dc/Documents/Codex/2026-05-14/files-mentioned-by-the-user-d/docs/smoke-test-report.md)。
