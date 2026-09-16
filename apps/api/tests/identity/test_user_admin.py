from sqlalchemy import select

from app.models.user import AuthSession, User


def test_only_owner_can_list_and_create_staff(client, login):
    assert client.get('/api/users', headers=login('cashier')).status_code == 403
    assert client.get('/api/users', headers=login('manager')).status_code == 403

    owner = login('owner')
    response = client.get('/api/users', headers=owner)
    assert response.status_code == 200
    assert {entry['username'] for entry in response.json()} == {'owner', 'manager', 'cashier', 'server'}
    assert all('password_hash' not in entry for entry in response.json())

    created = client.post('/api/users', headers=owner, json={
        'username': 'counter-two',
        'name': 'Counter Two',
        'role': 'CASHIER',
        'password': 'temporary-password-2026',
    })
    assert created.status_code == 201
    assert created.json() == {
        'id': created.json()['id'],
        'username': 'counter-two',
        'name': 'Counter Two',
        'role': 'CASHIER',
        'active': True,
    }
    assert client.post('/api/auth/login', json={
        'username': 'counter-two', 'password': 'temporary-password-2026'
    }).status_code == 200
    assert client.post('/api/users', headers=owner, json={
        'username': 'counter-two',
        'name': 'Duplicate',
        'role': 'CASHIER',
        'password': 'temporary-password-2026',
    }).status_code == 409


def test_owner_updates_staff_and_revokes_existing_sessions(client, login):
    owner = login('owner')
    cashier_session = login('cashier')
    users = client.get('/api/users', headers=owner).json()
    cashier = next(user for user in users if user['username'] == 'cashier')

    updated = client.patch(f"/api/users/{cashier['id']}", headers=owner, json={
        'name': 'Chipo Tembo', 'role': 'SERVER', 'active': False
    })
    assert updated.status_code == 200
    assert updated.json()['name'] == 'Chipo Tembo'
    assert updated.json()['role'] == 'SERVER'
    assert updated.json()['active'] is False
    assert client.get('/api/session', headers=cashier_session).status_code == 401
    assert client.post('/api/auth/login', json={
        'username': 'cashier', 'password': 'testing-password'
    }).status_code == 401

    audit = client.get('/api/audit', headers=owner).json()
    assert 'USER_UPDATED' in {event['action'] for event in audit}


def test_owner_cannot_remove_last_active_owner_or_deactivate_self(client, login):
    owner = login('owner')
    owner_user = next(user for user in client.get('/api/users', headers=owner).json() if user['username'] == 'owner')

    assert client.patch(
        f"/api/users/{owner_user['id']}", headers=owner, json={'active': False}
    ).status_code == 409
    assert client.patch(
        f"/api/users/{owner_user['id']}", headers=owner, json={'role': 'MANAGER'}
    ).status_code == 409


def test_owner_resets_password_and_can_revoke_staff_sessions(client, login):
    owner = login('owner')
    cashier_session = login('cashier')
    cashier = next(user for user in client.get('/api/users', headers=owner).json() if user['username'] == 'cashier')

    reset = client.post(f"/api/users/{cashier['id']}/reset-password", headers=owner, json={
        'password': 'replacement-password-2026'
    })
    assert reset.status_code == 200
    assert client.get('/api/session', headers=cashier_session).status_code == 401
    assert client.post('/api/auth/login', json={
        'username': 'cashier', 'password': 'testing-password'
    }).status_code == 401
    assert client.post('/api/auth/login', json={
        'username': 'cashier', 'password': 'replacement-password-2026'
    }).status_code == 200

    active_session = login('server')
    server = next(user for user in client.get('/api/users', headers=owner).json() if user['username'] == 'server')
    revoked = client.post(f"/api/users/{server['id']}/revoke-sessions", headers=owner)
    assert revoked.status_code == 200
    assert revoked.json()['revoked'] >= 1
    assert client.get('/api/session', headers=active_session).status_code == 401


def test_staff_member_changes_own_password_and_keeps_current_session(client, login):
    headers = login('cashier')
    response = client.post('/api/auth/change-password', headers=headers, json={
        'current_password': 'testing-password',
        'new_password': 'a-new-secure-password-2026',
    })
    assert response.status_code == 200
    assert client.get('/api/session', headers=headers).status_code == 200
    assert client.post('/api/auth/login', json={
        'username': 'cashier', 'password': 'testing-password'
    }).status_code == 401
    assert client.post('/api/auth/login', json={
        'username': 'cashier', 'password': 'a-new-secure-password-2026'
    }).status_code == 200
    assert client.post('/api/auth/change-password', headers=headers, json={
        'current_password': 'wrong-password',
        'new_password': 'another-secure-password-2026',
    }).status_code == 400

    with client.app.state.session_factory() as db:
        user = db.scalar(select(User).where(User.username == 'cashier'))
        sessions = db.scalars(select(AuthSession).where(AuthSession.user_id == user.id)).all()
        assert sessions
