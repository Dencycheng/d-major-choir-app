# v0.3 后端工程结构说明

## 1. 目录

```text
backend/app
├── core
│   ├── config.py      # 环境变量与配置
│   ├── database.py    # SQLAlchemy engine / session / Base
│   ├── security.py    # JWT 生成与校验
│   └── utils.py       # ID、时间、字典转换等工具
├── routers
│   ├── auth.py
│   ├── choirs.py
│   ├── events.py
│   ├── files.py
│   ├── notifications.py
│   ├── practice.py
│   └── works.py
├── deps.py            # 当前用户、数据库会话、权限校验
├── main.py            # FastAPI app 工厂与路由挂载
├── models.py          # SQLAlchemy 模型
└── schemas.py         # Pydantic 模型
```

## 2. 认证与权限

v0.3 已将 v0.2 的 Demo Token 替换为 JWT。

当前权限仍采用轻量级 RBAC：

```python
ROLE_LEVEL = {
    "member": 1,
    "section_leader": 2,
    "conductor": 3,
    "admin": 4,
    "super_admin": 5,
}
```

核心权限方法：

- `current_user`
- `require_member`
- `require_role`

## 3. 数据库迁移

生产环境建议：

```bash
AUTO_CREATE_TABLES=false
alembic upgrade head
```

本地快速开发可以：

```bash
AUTO_CREATE_TABLES=true
uvicorn app.main:app --reload
```

## 4. 测试

运行：

```bash
./scripts/run_backend_tests.sh
```

测试当前覆盖两个层级：

1. 健康检查与 JWT 用户获取。
2. 完整 MVP 业务链路。
