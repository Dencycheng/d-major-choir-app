from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "Choir Management App MVP"
    APP_VERSION: str = "0.6.0"
    DATABASE_URL: str = "sqlite:///./choir_app.db"
    UPLOAD_DIR: str = "./uploads"
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"
    JWT_SECRET_KEY: str = "dev-change-me-please"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    AUTO_CREATE_TABLES: bool = True
    ALLOW_DEMO_LOGIN_CODE: bool = True
    AUTH_ALLOW_OPEN_REGISTRATION: bool = True
    AUTH_ALLOW_FIRST_USER_BOOTSTRAP: bool = True
    SMS_PROVIDER: str = "mock"
    INTERNAL_LOGIN_CODE: str = ""
    SMS_CODE_EXPIRE_SECONDS: int = 300
    SMS_RESEND_INTERVAL_SECONDS: int = 60
    SMS_MAX_VERIFY_ATTEMPTS: int = 5
    TENCENTCLOUD_SECRET_ID: str = ""
    TENCENTCLOUD_SECRET_KEY: str = ""
    TENCENT_SMS_REGION: str = "ap-guangzhou"
    TENCENT_SMS_SDK_APP_ID: str = ""
    TENCENT_SMS_SIGN_NAME: str = ""
    TENCENT_SMS_TEMPLATE_ID: str = ""
    COS_BUCKET: str = ""
    COS_REGION: str = "ap-guangzhou"
    COS_PREFIX: str = ""
    COS_PUBLIC_BASE: str = ""
    COS_SECRET_ID: str = ""
    COS_SECRET_KEY: str = ""
    COS_SYNC_WORK_TITLE: str = "COS谱库同步"
    ALLOW_LEGACY_USER_ID_TOKEN: bool = False
    ENABLE_PUBLIC_UPLOADS: bool = False
    FILE_SIGNED_URL_EXPIRE_SECONDS: int = 60 * 10

    @property
    def cors_origin_list(self) -> List[str]:
        return [x.strip() for x in self.CORS_ORIGINS.split(",") if x.strip()]

    @property
    def upload_path(self) -> Path:
        return Path(self.UPLOAD_DIR)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
