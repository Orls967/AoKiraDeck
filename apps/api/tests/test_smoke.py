from fastapi.testclient import TestClient

from app.main import app


def test_health_smoke() -> None:
    client = TestClient(app)
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "aokira-api"
    assert body["apiVersion"] == "1.0.0"
