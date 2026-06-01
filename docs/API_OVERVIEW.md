# API概览

启动后端后访问 `/docs` 查看完整 OpenAPI。

## 认证

- `POST /api/auth/login-mobile`
- `GET /api/auth/me`

开发版 token 就是 `user_id`。

## 合唱团与成员

- `POST /api/choirs`
- `GET /api/choirs/my`
- `GET /api/choirs/{choir_id}`
- `POST /api/choirs/{choir_id}/invite-code`
- `POST /api/choirs/join?invite_code=XXXX`
- `GET /api/choirs/{choir_id}/sections`
- `GET /api/choirs/{choir_id}/members`
- `PUT /api/choirs/{choir_id}/members/{member_id}`
- `POST /api/choirs/{choir_id}/members/{member_id}/approve`

## 活动与考勤

- `POST /api/choirs/{choir_id}/events`
- `GET /api/choirs/{choir_id}/events`
- `POST /api/choirs/{choir_id}/events/{event_id}/response`
- `POST /api/events/{event_id}/checkin-code`
- `POST /api/events/{event_id}/checkin`
- `GET /api/events/{event_id}/attendance`

## 请假

- `POST /api/events/{event_id}/leave`
- `GET /api/choirs/{choir_id}/leave-requests`
- `POST /api/leave-requests/{leave_id}/approve`

## 谱库

- `POST /api/choirs/{choir_id}/works`
- `GET /api/choirs/{choir_id}/works`
- `POST /api/works/{work_id}/resources`
- `GET /api/works/{work_id}/resources`

## 练习与点评

- `POST /api/choirs/{choir_id}/practice-tasks`
- `GET /api/choirs/{choir_id}/practice-tasks`
- `POST /api/practice-tasks/{task_id}/records`
- `GET /api/practice-tasks/{task_id}/records`
- `POST /api/practice-records/{record_id}/comments`
- `GET /api/practice-records/{record_id}/comments`

## 文件和看板

- `POST /api/files/upload`
- `GET /api/choirs/{choir_id}/dashboard`

## v0.6 新增试点体验接口

### 活动反馈统计

```http
GET /api/events/{event_id}/response-statistics
Authorization: Bearer <jwt>
```

返回活动参加反馈、签到、请假和缺勤统计。

### 签到二维码图片

```http
GET /api/events/{event_id}/checkin-qr.png
Authorization: Bearer <jwt>
```

返回 `image/png`，用于管理后台或投屏展示排练签到二维码。

### 声部长看板

```http
GET /api/choirs/{choir_id}/section-dashboard?section_id={section_id}
Authorization: Bearer <jwt>
```

返回某声部的成员、任务、打卡、待点评和出勤率指标。

### 成员导入模板

```http
GET /api/choirs/{choir_id}/members/import-template.csv
Authorization: Bearer <jwt>
```

返回 CSV 模板，便于团务批量导入成员。
