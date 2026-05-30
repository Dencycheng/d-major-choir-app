# 微信小程序生产 API 与体验版上传

## 生产 API 配置

小程序环境配置：

```js
export const API_BASE_URL = "https://api.dmajorchoir.com";
```

微信公众平台需要配置 request/download/upload 合法域名：

```text
request 合法域名: https://api.dmajorchoir.com
uploadFile 合法域名: https://api.dmajorchoir.com
downloadFile 合法域名: https://api.dmajorchoir.com
```

如果对象存储临时签名 URL 使用独立域名，也需要加入 downloadFile 合法域名。更推荐通过 API 中转或绑定同源下载域名。

## 上传体验版

1. 使用微信开发者工具打开小程序项目。
2. 确认环境为 `production`。
3. 确认 `API_BASE_URL=https://api.dmajorchoir.com`。
4. 执行上传，版本号建议 `0.1.0-trial`。
5. 在微信公众平台设置体验成员。
6. 下载体验二维码并保存到 `docs/assets/wechat-trial-qrcode.png`。

## 验收

- 微信登录成功。
- 加入 D大调合唱团成功。
- 活动签到、请假、练习打卡、谱库播放请求都打到生产 API。
- 录音上传后在后台待点评列表可见。
