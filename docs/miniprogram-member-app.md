# D大调合唱团成员端微信小程序

小程序项目目录：

```text
miniprogram/
```

## 技术栈

- 微信小程序原生框架。
- API 请求统一封装在 `miniprogram/utils/request.js`。
- 正式 API：`https://api.dmajorchoir.com`。
- 支持 `wx.request`、`wx.uploadFile`、`wx.downloadFile`。

## 页面

| 页面 | 文件 | 功能 |
| --- | --- | --- |
| 首页 | `pages/home/home` | 最近排练、本周任务、待打卡、最新点评 |
| 活动 | `pages/activities/activities` | 查看活动、反馈参加/请假、签到 |
| 练习 | `pages/practice/practice` | 查看任务、录音或选择音频、上传打卡、自评 |
| 谱库 | `pages/library/library` | 查看作品、打开 PDF、播放伴奏和分声部音频 |
| 我的 | `pages/mine/mine` | 个人出勤、打卡、点评记录 |

## API 配置

配置文件：

```js
// miniprogram/config/index.js
const ENV = "production";
```

生产环境默认：

```js
API_BASE_URL: "https://api.dmajorchoir.com"
```

本地调试可临时改为：

```js
const ENV = "development";
```

并启动本地 API：

```bash
npm start
```

## 试用成员身份

当前后端 MVP 尚未接微信登录，成员身份通过请求头 `X-Member-Id` 传递。

默认成员：

```js
DEFAULT_MEMBER_ID: "m-alto-01"
```

如需在开发者工具里切换成员，可在 Console 执行：

```js
wx.setStorageSync("memberId", "m-sop-01")
```

然后重新进入页面。

## 微信公众平台合法域名

需要在小程序后台配置：

ICP备案已完成，微信小程序后台需要配置以下 HTTPS 合法域名：

```text
request 合法域名: https://api.dmajorchoir.com
uploadFile 合法域名: https://api.dmajorchoir.com
downloadFile 合法域名: https://api.dmajorchoir.com
```

PDF 和音频目前通过 API 的 `/api/files/:fileId` 读取，因此不需要额外配置 COS 域名。后续迁移腾讯云 COS 后，如果前端直接访问 COS 临时签名 URL，需要把 COS 下载域名加入 `downloadFile` 合法域名。

## 上传体验版

1. 微信开发者工具打开 `miniprogram/`。
2. 将 `miniprogram/project.config.json` 的 `appid` 替换为真实小程序 AppID。
3. 确认 `miniprogram/config/index.js` 使用 `production`。
4. 确认腾讯云后端 `https://api.dmajorchoir.com/api/health` 返回 `ok`。
5. 真机预览测试：首页、活动、练习、谱库、我的。
6. 上传版本，例如 `0.1.0-member-trial`。
7. 在微信公众平台设置体验成员并生成体验二维码。

## 真实闭环验收

- 首页能加载最近排练、本周任务、最新点评。
- 活动页点击“反馈参加/提交请假/签到”后，Web 后台活动统计变化。
- 练习页录音或选择音频并上传后，Web 后台“打卡点评”出现记录。
- Web 后台提交点评后，小程序“我的”能看到点评。
- 谱库页可打开 PDF 乐谱，可播放伴奏和分声部音频。
