from __future__ import annotations

import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from app.core.config import settings
from app.core.database import Base, engine
from app import models  # noqa: F401 - ensures SQLAlchemy models are registered
from app.routers import auth, choirs, events, files, notifications, practice, works


def wait_for_database(max_attempts: int = 30, delay_seconds: float = 1.0) -> None:
    """Wait until PostgreSQL is ready before creating tables / serving requests."""
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            with engine.connect() as conn:
                conn.exec_driver_sql("SELECT 1")
            return
        except OperationalError as exc:
            last_error = exc
            print(f"[startup] Database not ready ({attempt}/{max_attempts}); retrying...")
            time.sleep(delay_seconds)
    raise RuntimeError("Database did not become ready in time") from last_error


def create_app() -> FastAPI:
    wait_for_database()
    if settings.AUTO_CREATE_TABLES:
        Base.metadata.create_all(bind=engine)

    app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    settings.upload_path.mkdir(parents=True, exist_ok=True)
    # Authenticated file download is the default. Enable public uploads only for local debugging.
    if settings.ENABLE_PUBLIC_UPLOADS:
        from fastapi.staticfiles import StaticFiles
        app.mount("/uploads", StaticFiles(directory=settings.upload_path), name="uploads")

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "choir-app-backend", "version": settings.APP_VERSION}

    for router in [auth.router, choirs.router, events.router, works.router, practice.router, notifications.router, files.router]:
        app.include_router(router)

    return app


app = create_app()
