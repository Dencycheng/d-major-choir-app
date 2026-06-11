# 回滚方案（V2.1 → V1.2）

## 触发条件

- 登录体系故障导致后台/小程序不可用且 30 分钟内无法修复；
- 数据迁移异常（成员/打卡数据缺失）。

## 步骤

```bash
ssh ubuntu@119.45.176.130
cd /home/ubuntu/d_major_APP

# 1) 停止服务
pm2 stop dmajor-app

# 2) 代码回退到升级前 tag/commit
git fetch --tags
git checkout v1.2.0    # 或升级前记录的 commit

# 3) 数据恢复（使用升级前 npm run backup 生成的快照）
npm run restore -- /home/ubuntu/d_major_runtime/backups/<升级前时间戳>
# 旧版读取代码目录内 data/dmajor.sqlite 时，将恢复出的库文件复制回 data/

# 4) 重启并验证
pm2 restart dmajor-app
curl -s https://api.dmajorchoir.com/api/health
```

## 注意

- V2.1 新表（users/auth_sessions/invite_codes/join_requests/login_logs/operation_logs）对 V1.2 无影响，可保留。
- 回滚后小程序体验版需同步回退（重新上传 V1.2 包），否则新包会因 401 无法使用。
- 回滚窗口内生成的邀请码与入团申请会随数据恢复丢失，需提前导出告知。
