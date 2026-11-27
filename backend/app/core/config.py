"""Settings from environment variables and `.env` (TECHNICAL_PLAN §1.4)."""

from functools import lru_cache
from typing import Literal, Self

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

#: The `.env.example` value. Fine for development, refused in production.
DEV_JWT_SECRET = "dev-only-change-me"
MIN_PRODUCTION_SECRET_LENGTH = 32


class Settings(BaseSettings):
    # The repository-root `.env` serves both `docker compose` and the backend;
    # a `backend/.env` overrides it when the app runs from `backend/`.
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+psycopg://lrs:lrs@localhost:5432/lrs"
    jwt_secret: SecretStr = SecretStr(DEV_JWT_SECRET)

    @model_validator(mode="after")
    def _require_real_secret_in_production(self) -> Self:
        secret = self.jwt_secret.get_secret_value()
        if self.app_env == "production" and (secret == DEV_JWT_SECRET or len(secret) < MIN_PRODUCTION_SECRET_LENGTH):
            raise ValueError(f"JWT_SECRET must be set to at least {MIN_PRODUCTION_SECRET_LENGTH} random characters in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
