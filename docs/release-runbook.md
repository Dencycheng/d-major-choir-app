# 发布运行手册

当前版本：

```text
1.1.3
```

## 已更新文件

- `package.json`：`version = 1.1.3`
- `miniprogram/config/index.js`：`VERSION = 1.1.3`
- `miniprogram/project.config.json`：描述更新为 `v1.1.3`
- `RELEASE_NOTES.md`：新增 v1.1.3 变更说明

## 一键发布脚本

```bash
chmod +x scripts/release.sh
GITHUB_REMOTE_URL="git@github.com:<owner>/<repo>.git" ./scripts/release.sh 1.1.3
```

如果已经配置过 Git remote，可直接：

```bash
./scripts/release.sh 1.1.3
```

## 微信开发者工具要求

脚本默认使用：

```text
/Applications/wechatwebdevtools.app/Contents/MacOS/cli
```

如路径不同：

```bash
WECHAT_DEVTOOLS_CLI="/path/to/cli" ./scripts/release.sh 1.1.3
```

## 上传前必须确认

1. `miniprogram/project.config.json` 里的 `appid` 已替换为真实小程序 AppID。
2. 微信开发者工具已登录对应小程序开发者账号。
3. 微信开发者工具已开启命令行/服务端口能力。
4. 小程序后台已配置合法域名：

```text
当前临时调试地址: http://119.45.176.130:4173
微信正式体验版通常要求 HTTPS 合法域名；备案完成后再统一切换。
```

## 本次环境限制记录

当前 Codex 沙箱禁止：

- 在项目目录创建 `.git`
- 微信开发者工具 CLI 监听 `127.0.0.1:3799`

所以我已完成版本文件更新和发布脚本生成，但 GitHub push 与微信上传需要在普通本机终端中执行上面的脚本。
