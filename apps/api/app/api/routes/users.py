from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import commit_result, database, owner
from app.domains.identity import service
from app.schemas.auth import PasswordResetCommand, UserCommand, UserUpdateCommand

router = APIRouter(prefix='/api/users', dependencies=[Depends(owner)])


@router.get('')
def users(db=Depends(database)):
    return service.list_users(db)


@router.post('', status_code=201)
def create(command: UserCommand, actor=Depends(owner), db=Depends(database)):
    try:
        user = service.create_user(db, username=command.username, name=command.name,
                                   role=command.role, password=command.password,
                                   actor=actor, source='owner_workspace')
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    return commit_result(db, service.user_dto(user))


@router.patch('/{user_id}')
def update(user_id: str, command: UserUpdateCommand, actor=Depends(owner), db=Depends(database)):
    return commit_result(db, service.update_user(db, actor, user_id, command))


@router.post('/{user_id}/reset-password')
def password_reset(user_id: str, command: PasswordResetCommand,
                   actor=Depends(owner), db=Depends(database)):
    return commit_result(db, service.reset_password(db, actor, user_id, command.password))


@router.post('/{user_id}/revoke-sessions')
def sessions_revoke(user_id: str, actor=Depends(owner), db=Depends(database)):
    return commit_result(db, service.revoke_sessions(db, actor, user_id))
