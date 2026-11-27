import pytest
from pydantic import ValidationError

from app.core.config import DEV_JWT_SECRET, Settings


def test_development_accepts_the_example_secret() -> None:
    assert Settings(app_env="development", jwt_secret=DEV_JWT_SECRET).app_env == "development"


@pytest.mark.parametrize("secret", [DEV_JWT_SECRET, "too-short"], ids=["example secret", "short secret"])
def test_production_refuses_a_weak_secret(secret: str) -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        Settings(app_env="production", jwt_secret=secret)


def test_production_accepts_a_long_random_secret() -> None:
    assert Settings(app_env="production", jwt_secret="x" * 48).app_env == "production"
