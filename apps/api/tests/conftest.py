import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import create_app
from app.core.config import Settings
from app.core.security import hash_password
from app.models.user import User
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


@pytest.fixture
def legacy_server(client):
    """Insert a historic role that new account commands no longer accept."""
    with client.app.state.session_factory.begin() as db:
        user = db.scalar(select(User).where(User.username == 'server'))
        if user is None:
            user = User(username='server', name='Tendai Zulu', role='SERVER', active=True,
                        password_hash=hash_password('testing-password'))
            db.add(user)
            db.flush()
        return user.id
