import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_production_rejects_local_database_and_hosts():
    with pytest.raises(ValidationError):
        Settings(app_env="production", database_url="sqlite:///./happycone.db", allowed_hosts=["localhost"])


def test_production_rejects_local_cors_origins():
    with pytest.raises(ValidationError):
        Settings(
            app_env="production",
            database_url="postgresql+psycopg://user:pass@db/happycone",
            allowed_hosts=["pos.happycone.example"],
            cors_origins=["http://localhost:5173"],
        )


def test_production_disables_interactive_api_documentation():
    app = create_app(Settings(
        app_env="production",
        database_url="postgresql+psycopg://user:pass@db/happycone",
        allowed_hosts=["pos.happycone.example"],
        cors_origins=[],
    ))
    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url is None
    app.state.engine.dispose()


def test_readiness_checks_database_and_requests_have_correlation_ids(tmp_path):
    app = create_app(Settings(database_url=f"sqlite:///{tmp_path}/ready.db"), initialize=True)
    with TestClient(app) as client:
        ready = client.get("/ready")
        assert ready.status_code == 200
        assert ready.json() == {"status": "ready", "database": "ok"}
        assert ready.headers["x-request-id"]

        correlated = client.get("/health", headers={"X-Request-ID": "counter-check-123"})
        assert correlated.status_code == 200
        assert correlated.headers["x-request-id"] == "counter-check-123"
    app.state.engine.dispose()
