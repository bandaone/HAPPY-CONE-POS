from fastapi import APIRouter, Depends, Request
from app.api.deps import database, current_user, bearer, manager, commit_result
from app.schemas.auth import LoginCommand, PasswordChangeCommand
from app.domains.identity.service import authenticate, change_password, user_dto
from app.domains.audit.service import history, record
from app.core.security import token_digest
from app.models.user import AuthSession

router = APIRouter(prefix='/api')


@router.post('/auth/login')
def login(command: LoginCommand, request: Request, db=Depends(database)):
    return commit_result(db, authenticate(db, command, request.app.state.settings))


@router.get('/session')
def session(user=Depends(current_user)):
    return user_dto(user)


@router.post('/auth/logout')
def logout(user=Depends(current_user), credentials=Depends(bearer), db=Depends(database)):
    db.delete(db.get(AuthSession, token_digest(credentials.credentials)))
    record(db, user, 'LOGOUT', 'user', user.id)
    return commit_result(db, {'ok': True})


@router.post('/auth/change-password')
def password_change(command: PasswordChangeCommand, user=Depends(current_user),
                    credentials=Depends(bearer), db=Depends(database)):
    result = change_password(db, user, command.current_password, command.new_password,
                             credentials.credentials)
    return commit_result(db, result)


@router.get('/audit')
def audit(user=Depends(manager), db=Depends(database)):
    return history(db)
