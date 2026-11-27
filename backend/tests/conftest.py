from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager

import pytest
from fastapi.testclient import TestClient
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config import Settings
from app.main import create_app


class _TestEnv(BaseSettings):
    """Where the integration tests' database lives. Read from the environment or `.env`, like the app."""

    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")
    test_database_url: str = "postgresql+psycopg://lrs:lrs@localhost:5432/lrs_test"


@pytest.fixture(scope="session")
def test_database_url() -> str:
    return _TestEnv().test_database_url


@pytest.fixture
def app_client() -> Callable[..., AbstractContextManager[TestClient]]:
    """Build a client for an app with the given settings overrides."""

    @contextmanager
    def build(**overrides: object) -> Iterator[TestClient]:
        settings = Settings.model_validate({"app_env": "test", **overrides})
        with TestClient(create_app(settings)) as client:
            yield client

    return build


@pytest.fixture
def client(app_client: Callable[..., AbstractContextManager[TestClient]], test_database_url: str) -> Iterator[TestClient]:
    """A client for an app connected to the test database."""
    with app_client(database_url=test_database_url) as c:
        yield c
