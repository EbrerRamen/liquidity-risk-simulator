import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.integration


def test_readiness_with_the_test_database(client: TestClient) -> None:
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 200, "Test database unreachable. Start it with `docker compose up -d db` from the repository root."
    assert response.json() == {"status": "ok", "database": "ok"}
