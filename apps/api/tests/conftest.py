import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.core.config import Settings
from app.seed import seed_demo


@pytest.fixture
def client(tmp_path):
    app = create_app(Settings(database_url=f"sqlite:///{tmp_path}/test.db"), initialize=True)
    with app.state.session_factory() as db:
        seed_demo(db, "testing-password")
        db.commit()
    with TestClient(app) as client:
        yield client
    app.state.engine.dispose()


@pytest.fixture
def login(client):
    def login_as(username="manager"):
        response = client.post("/api/auth/login", json={"username": username, "password": "testing-password"})
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['token']}"}
    return login_as
