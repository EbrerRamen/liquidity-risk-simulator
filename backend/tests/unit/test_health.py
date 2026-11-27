from collections.abc import Callable
from contextlib import AbstractContextManager

from fastapi.testclient import TestClient

ClientFactory = Callable[..., AbstractContextManager[TestClient]]

#: Nothing listens on port 1, so connecting fails at once.
UNREACHABLE_DB = "postgresql+psycopg://lrs:lrs@127.0.0.1:1/none"


def test_liveness_needs_no_database(app_client: ClientFactory) -> None:
    with app_client(database_url=UNREACHABLE_DB) as client:
        response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_reports_an_unreachable_database(app_client: ClientFactory) -> None:
    with app_client(database_url=UNREACHABLE_DB) as client:
        response = client.get("/api/v1/health/ready")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "database": "unreachable"}


def test_openapi_is_served_under_api(app_client: ClientFactory) -> None:
    with app_client(database_url=UNREACHABLE_DB) as client:
        response = client.get("/api/openapi.json")
    assert response.status_code == 200
    assert "/api/v1/health/ready" in response.json()["paths"]
