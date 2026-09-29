from datetime import datetime, timedelta, timezone
import time

from fastapi.testclient import TestClient
from sqlalchemy import select
from app.models.user import AuthSession, User


def test_login_session_logout_and_invalid_credentials(client):
    assert client.get('/api/session').status_code == 401
    assert client.post('/api/auth/login', json={'username':'manager','password':'wrong'}).status_code == 401
    response = client.post('/api/auth/login', json={'username':'cashier','password':'testing-password'})
    assert response.status_code == 200
    token = response.json()['token']
    headers = {'Authorization':f'Bearer {token}'}
    assert client.get('/api/session', headers=headers).json()['role'] == 'CASHIER'
    with client.app.state.session_factory() as db:
        assert db.scalar(select(AuthSession)).token_hash != token
        assert db.scalar(select(User).where(User.username == 'cashier')).password_hash != 'testing-password'
    assert client.post('/api/auth/logout', headers=headers).status_code == 200
    assert client.get('/api/session', headers=headers).status_code == 401


def test_roles_and_expired_session(client, login, legacy_server):
    assert client.get('/api/audit', headers=login('cashier')).status_code == 403
    assert client.get('/api/audit', headers=login('manager')).status_code == 200
    headers = login('server')
    assert client.post('/api/business-day/open', json={'opening_float_ngwee':50000}, headers=headers).status_code == 403
    with client.app.state.session_factory() as db:
        sessions = db.scalars(select(AuthSession)).all()
        for session in sessions:
            session.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()
    assert client.get('/api/session', headers=headers).status_code == 401


def test_cli_user_password_keeps_intentional_whitespace(client):
    from app.domains.identity.service import create_user
    password = '  intentional spaces  '
    with client.app.state.session_factory.begin() as db:
        create_user(db,username='space-password',name='Test User',role='CASHIER',password=password)
    response = client.post('/api/auth/login',json={'username':'space-password','password':password})
    assert response.status_code == 200


def rate_limited_app(tmp_path, *, requests=30, window_seconds=60, capacity=2048):
    from app.core.config import Settings
    from app.main import create_app

    return create_app(Settings(
        database_url=f"sqlite:///{tmp_path}/rate-limit.db",
        login_rate_requests=requests,
        login_rate_window_seconds=window_seconds,
        login_rate_capacity=capacity,
    ), initialize=True)


def invalid_login(client):
    return client.post('/api/auth/login', json={'username': 'unknown', 'password': 'wrong-password'})


def test_login_rate_limit_blocks_the_31st_request_and_isolates_clients(tmp_path):
    app = rate_limited_app(tmp_path)
    with TestClient(app, client=('192.168.1.21', 50000)) as first:
        for _ in range(30):
            assert invalid_login(first).status_code == 401
        blocked = invalid_login(first)
        assert blocked.status_code == 429
        assert blocked.json() == {'detail': 'Too many login attempts. Try again shortly.'}
    with TestClient(app, client=('192.168.1.22', 50000)) as second:
        assert invalid_login(second).status_code == 401
    app.state.engine.dispose()


def test_login_rate_limit_recovers_after_the_window(tmp_path):
    app = rate_limited_app(tmp_path, requests=1, window_seconds=1)
    with TestClient(app, client=('192.168.1.31', 50000)) as client:
        assert invalid_login(client).status_code == 401
        assert invalid_login(client).status_code == 429
        time.sleep(1.05)
        assert invalid_login(client).status_code == 401
    app.state.engine.dispose()


def test_login_rate_limit_evicts_the_oldest_client_at_capacity(tmp_path):
    app = rate_limited_app(tmp_path, requests=1, capacity=2)
    with TestClient(app, client=('192.168.1.41', 50000)) as first, \
         TestClient(app, client=('192.168.1.42', 50000)) as second, \
         TestClient(app, client=('192.168.1.43', 50000)) as third:
        assert invalid_login(first).status_code == 401
        assert invalid_login(first).status_code == 429
        assert invalid_login(second).status_code == 401
        assert invalid_login(third).status_code == 401
        assert invalid_login(first).status_code == 401
    app.state.engine.dispose()
