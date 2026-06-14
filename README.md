# 合唱团APP MVP v1.1 · D Major Choir 品牌体验版

本版本基于 D Major Choir Logo 完成视觉升级，并增强活动地点与周期排练体验。

生产部署、备份、恢复、Nginx 和内测验证码模式见：[docs/PRODUCTION_RUNBOOK.md](docs/PRODUCTION_RUNBOOK.md)。

- 管理后台：http://127.0.0.1:8080
- 成员端网页：http://127.0.0.1:8090
- 后端健康检查：http://127.0.0.1:8000/health

## 启动

```bash
cd ~/Downloads/choir_app_mvp
docker compose down
docker compose up --build
```

# 合唱团管理与练习 APP MVP v0.6.1

本版本在 v0.5 部署准备与真实录音能力的基础上，进入“试点体验打磨”阶段。核心目标是让真实排练更好用：后台可直接展示签到二维码，查看活动反馈统计和声部长看板；谱库资料与练习录音支持鉴权预览；小程序谱库支持 PDF 打开和音频播放。

## 目录结构

```text
backend/       FastAPI 后端服务
admin-web/     React + Vite 管理后台
miniapp/       微信小程序端骨架，已接入真实录音上传
docs/          技术说明文档
scripts/       本地测试脚本
.github/       GitHub Actions CI
```

## v0.6.1 重点变化

- 修复安全文件下载测试中相对路径重复拼接导致的 `Stored file not found` 问题。
- 后端端到端测试已复核通过：`2 passed`。

## v0.6 重点变化

- 新增签到二维码 PNG 接口：`GET /api/events/{event_id}/checkin-qr.png`。
- 新增活动反馈统计：`GET /api/events/{event_id}/response-statistics`。
- 新增声部长看板：`GET /api/choirs/{choir_id}/section-dashboard`。
- 新增成员导入模板下载：`GET /api/choirs/{choir_id}/members/import-template.csv`。
- 管理后台可展示签到二维码、活动统计和声部长看板。
- 管理后台谱库资料与练习录音支持短期签名链接预览。
- 小程序谱库页支持作品详情、PDF 打开和音频播放。
- 继续保留 v0.5 的安全文件下载、真实录音上传、CSV 导入导出、Docker Compose 和 CI。

## 一、启动后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

访问：

- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/health`

## 二、运行后端测试

```bash
./scripts/run_backend_tests.sh
```

当前后端测试脚本包含以下覆盖范围：

测试覆盖：

- 健康检查
- JWT 登录与 `/api/auth/me`
- 创建合唱团
- 邀请成员加入
- 待审核成员访问拦截
- 管理员审批成员
- 创建活动
- 生成签到码
- 成员签到与请假
- 管理员审批请假
- 安全文件上传
- 签名下载链接
- 谱库作品与资料绑定
- 练习任务
- 小程序录音打卡对应文件上传流程
- 管理员点评
- 考勤 CSV 导出
- 打卡 CSV 导出
- 成员 CSV 批量导入
- 成员通知

## 三、Docker Compose 一键启动

```bash
docker compose up --build
```

服务地址：

- 后端 API：`http://localhost:8000`
- API 文档：`http://localhost:8000/docs`
- 管理后台：`http://localhost:8080`
- PostgreSQL：`localhost:5432`

生产环境部署前必须修改：

```env
JWT_SECRET_KEY=change-me-in-production
```

## 四、启动管理后台

```bash
cd admin-web
npm install
npm run dev
```

默认后端地址：

```text
http://127.0.0.1:8000
```

如需修改，请创建 `admin-web/.env`：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

管理后台已包含：

1. 看板
2. 成员审批
3. 活动考勤
4. 请假审批
5. 谱库文件
6. 练习任务
7. 打卡点评
8. 声部长看板

## 五、微信小程序联调

小程序端 API 地址在：

```text
miniapp/app.js
```

默认：

```js
apiBaseUrl: 'http://127.0.0.1:8000'
```

小程序 v0.6 的任务页已经接入真实录音流程：

```text
开始录音 → 停止并上传 → 创建练习打卡记录
```

在微信开发者工具中联调时，可先关闭“校验合法域名”，或将后端部署到可访问的 HTTPS 域名后再配置合法域名。真实设备调试录音时，需要允许麦克风权限。

## 六、文件安全说明

v0.6 默认不再公开挂载 `/uploads`。文件访问方式：

1. 已登录用户携带 JWT 访问：

```http
GET /api/files/{asset_id}/download
Authorization: Bearer <jwt>
```

2. 后台或小程序先获取短期签名链接：

```http
GET /api/files/{asset_id}/signed-url
```

返回：

```json
{
  "signed_url": "/api/files/{asset_id}/download?token=...",
  "expires_in": 600
}
```

## 七、成员批量导入 CSV 格式

接口：

```http
POST /api/choirs/{choir_id}/members/import-csv
```

CSV 表头：

```csv
name,mobile,section_name,role,member_status
新成员,13700000001,Soprano / 一声部,member,active
```

## 八、认证说明

登录接口：

```http
POST /api/auth/login-mobile
```

请求示例：

```json
{
  "mobile": "13800000000",
  "code": "000000",
  "name": "Admin"
}
```

后续接口需携带：

```http
Authorization: Bearer <jwt>
```

## 九、下一阶段建议 v0.7

建议 v0.7 进入“权限与质量强化版”：

1. 后台列表增加分页、搜索和筛选。
2. 小程序扫码签到走真实二维码参数路径。
3. 文件访问增加审计日志。
4. 声部长点评增加快捷评语模板。
5. 成员端增加个人练习报告。
6. 对象存储适配腾讯云 COS 或阿里云 OSS。

## v0.7 成员端网页版 Demo

本版本新增浏览器可访问的成员端 Demo：

```text
http://127.0.0.1:8090
```

启动方式：

```bash
docker compose down
docker compose up --build
```

演示顺序建议：先在管理后台创建合唱团并获取邀请码，再在成员端用另一个手机号登录并申请加入。管理员审批后，成员端即可查看活动、任务、谱库并提交练习打卡。
