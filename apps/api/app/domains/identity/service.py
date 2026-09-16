import hmac
from datetime import timedelta, timezone
from sqlalchemy import delete, func, select
from fastapi import HTTPException
from app.core.security import hash_password, verify_password, token_digest, new_token
from app.core.db import lock_branch
from app.models.user import User, AuthSession
from app.models.base import utcnow
from app.domains.audit.service import record

DUMMY_HASH = hash_password('not-a-real-account-password')


def user_dto(user):
    return dict(id=user.id, username=user.username, name=user.name, role=user.role, active=user.active)


def authenticate(db, command, settings):
    user = db.scalar(select(User).where(User.username == command.username))
    valid = verify_password(command.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid or not user.active:
        raise HTTPException(401, 'Invalid username or password')
    token = new_token()
    db.add(AuthSession(token_hash=token_digest(token), user_id=user.id,
                       expires_at=utcnow() + timedelta(hours=settings.session_hours)))
    record(db, user, 'LOGIN', 'user', user.id)
    return dict(token=token, user=user_dto(user))


def session_user(db, token):
    session = db.get(AuthSession, token_digest(token))
    if session is None or session.expires_at.replace(tzinfo=timezone.utc) <= utcnow():
        raise HTTPException(401, 'Session expired or invalid')
    user = db.get(User, session.user_id)
    if not user or not user.active:
        raise HTTPException(401, 'Account unavailable')
    return user


def create_user(db, *, username, name, role, password, actor=None, source='administrator_cli'):
    """Local administrator bootstrap; never installs demo data."""
    from app.schemas.auth import UserCommand
    command = UserCommand(username=username, name=name, role=role, password=password)
    if db.scalar(select(User).where(User.username == command.username)):
        raise ValueError('Username already exists')
    user = User(username=command.username, name=command.name, role=command.role,
                password_hash=hash_password(command.password))
    db.add(user)
    db.flush()
    record(db, actor, 'USER_CREATED', 'user', user.id,
           {'username': user.username, 'role': user.role, 'source': source})
    return user


def list_users(db):
    return [user_dto(user) for user in db.scalars(select(User).order_by(User.name, User.username)).all()]


def get_user(db, user_id):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, 'Staff account not found')
    return user


def _protect_last_owner(db, user, *, next_role=None, next_active=None):
    remains_owner = (next_role if next_role is not None else user.role) == 'OWNER_ADMIN'
    remains_active = next_active if next_active is not None else user.active
    if user.role == 'OWNER_ADMIN' and user.active and not (remains_owner and remains_active):
        owners = db.scalar(select(func.count()).select_from(User).where(
            User.role == 'OWNER_ADMIN', User.active.is_(True)
        ))
        if owners <= 1:
            raise HTTPException(409, 'Keep at least one active owner administrator')


def update_user(db, actor, user_id, command):
    lock_branch(db)
    user = get_user(db, user_id)
    _protect_last_owner(db, user, next_role=command.role, next_active=command.active)
    before = user_dto(user)
    if command.name is not None:
        user.name = command.name
    if command.role is not None:
        user.role = command.role
    if command.active is not None:
        user.active = command.active
    after = user_dto(user)
    if before != after:
        if before['role'] != after['role'] or before['active'] != after['active']:
            db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
        record(db, actor, 'USER_UPDATED', 'user', user.id, {'before': before, 'after': after})
    return after


def reset_password(db, actor, user_id, password):
    user = get_user(db, user_id)
    user.password_hash = hash_password(password)
    result = db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    record(db, actor, 'USER_PASSWORD_RESET', 'user', user.id,
           {'username': user.username, 'sessions_revoked': result.rowcount})
    return {'ok': True, 'sessions_revoked': result.rowcount}


def revoke_sessions(db, actor, user_id):
    user = get_user(db, user_id)
    result = db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    record(db, actor, 'USER_SESSIONS_REVOKED', 'user', user.id,
           {'username': user.username, 'sessions_revoked': result.rowcount})
    return {'revoked': result.rowcount}


def change_password(db, user, current_password, new_password, current_token):
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(400, 'Current password is incorrect')
    if hmac.compare_digest(current_password, new_password):
        raise HTTPException(400, 'Choose a new password')
    user.password_hash = hash_password(new_password)
    current_digest = token_digest(current_token)
    result = db.execute(delete(AuthSession).where(
        AuthSession.user_id == user.id, AuthSession.token_hash != current_digest
    ))
    record(db, user, 'PASSWORD_CHANGED', 'user', user.id,
           {'other_sessions_revoked': result.rowcount})
    return {'ok': True, 'other_sessions_revoked': result.rowcount}
