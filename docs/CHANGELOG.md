# Changelog

## v0.6.1

- 修复安全文件下载路径兼容问题。
- 复核后端端到端测试通过：`2 passed`。

# Changelog

## v0.6

- 新增签到二维码 PNG 接口与后台二维码展示。
- 新增活动反馈统计接口。
- 新增声部长看板接口和后台 Tab。
- 新增成员导入模板下载。
- 谱库资料和练习录音支持短期签名链接预览。
- 小程序谱库页支持作品详情、PDF 打开和音频播放。
- 管理后台增加基础表单校验与错误提示。


## v0.5

- 新增 `FileAsset` 文件资产模型。
- 默认关闭 `/uploads` 静态公开访问，改为鉴权下载。
- 新增文件签名下载链接接口。
- 小程序任务页接入真实录音、上传、打卡流程。
- 新增成员 CSV 批量导入接口。
- 新增考勤 CSV 导出接口。
- 新增练习打卡 CSV 导出接口。
- Docker Compose 增加管理后台服务。
- 新增 GitHub Actions CI：后端测试与后台构建。
- 测试覆盖安全文件下载、录音文件上传、导入导出。
- 已完成代码级语法编译检查；端到端 pytest 需在本地或 CI 环境继续确认。


## v0.4

- 管理后台新增成员审批与成员角色/声部/状态修改。
- 管理后台新增请假审批，可通过或驳回请假。
- 管理后台新增谱库文件上传与作品资料绑定。
- 管理后台新增合唱团维度打卡记录与人工点评。
- 小程序新增 API 请求封装 `miniapp/utils/api.js`。
- 小程序首页、活动、任务、谱库、我的页面接入真实 API 骨架。
- 后端新增 `/api/choirs/{choir_id}/practice-records`。
- 后端审批请假后向成员发送通知。
- 权限收紧：待审核成员不能访问合唱团内部数据。
- 测试增加待审核权限、文件上传、请假审批通知和全团打卡记录。
- 已完成代码级语法编译检查；端到端 pytest 需在本地或 CI 环境继续确认。

## v0.3

- 后端从单文件拆分为模块化 FastAPI 工程结构。
- 新增 `core/config.py` 环境配置。
- 新增 `core/database.py` 数据库连接管理。
- 新增 `core/security.py` JWT 生成与校验。
- 新增 `models.py`、`schemas.py`、`deps.py`。
- 新增业务路由：auth、choirs、events、works、practice、notifications、files。
- 新增 Alembic 迁移配置与初始迁移脚本。
- 自动化测试改为 JWT 流程。
- 管理后台版本文案更新为 v0.3。
- 已完成代码级语法编译检查；端到端 pytest 需在本地或 CI 环境继续确认。

## v0.2

- 修复 pytest 找不到 `app` 包的问题。
- 补齐完整业务流测试。
- 新增活动详情、考勤统计、任务统计、作品详情等接口。
- 管理后台增加多个联调页面。

## v0.1

- 初始 MVP 脚手架。

## v0.7 - Member Web Demo

- Added `member-web` browser-based member portal on port 8090.
- Member portal supports login, join by invite code, events, check-in, leave requests, practice tasks, audio upload practice record, comments, works/resources, and notifications.
- Added Docker Compose service for member web.
- Added CORS origins for member web.
- Patched choir creation foreign-key flush issue.
- Patched backend Dockerfile to copy tests into container.
- Added Vite client type declarations for admin web build compatibility.

## v0.8 - 小程序成员端 Demo

- 新增微信开发者工具可导入的小程序项目配置。
- 完善成员端「我的」页面：登录、邀请码申请、合唱团选择、接口地址配置。
- 完善活动页面：确认参加、签到码签到、请假。
- 完善练习任务页面：录音打卡、Demo 打卡、查看本人打卡与点评。
- 保留谱库 PDF 打开与音频播放能力。
- 新增 `docs/MINIAPP_DEMO_GUIDE.md` 小程序使用说明。

## v1.0 Activity Delete

- 后台活动考勤列表新增“删除”活动按钮。
- 后端新增 `DELETE /api/events/{event_id}`。
- 删除活动时会同步清理该活动关联的签到、反馈和请假记录，避免外键约束错误。
- 测试用例增加活动删除验证。
