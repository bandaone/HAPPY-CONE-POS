from datetime import datetime, timedelta, timezone
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


def test_roles_and_expired_session(client, login):
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
