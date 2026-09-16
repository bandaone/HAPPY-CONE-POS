from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.domains.identity.service import session_user

bearer = HTTPBearer(auto_error=False)


def database(request: Request):
    with request.app.state.session_factory() as db:
        try:
            yield db
        except BaseException:
            db.rollback()
            raise


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db=Depends(database)):
    if credentials is None:
        raise HTTPException(401, 'Authentication required')
    return session_user(db, credentials.credentials)


def roles(*allowed):
    def guard(user=Depends(current_user)):
        if user.role not in allowed:
            raise HTTPException(403, 'This role cannot perform this action')
        return user
    return guard


manager = roles('MANAGER', 'OWNER_ADMIN')
cashier = roles('CASHIER', 'MANAGER', 'OWNER_ADMIN')
server = roles('SERVER', 'MANAGER', 'OWNER_ADMIN')
owner = roles('OWNER_ADMIN')


def commit_result(db, result):
    """Commit before a success response can be serialized or sent."""
    db.commit()
    return result
