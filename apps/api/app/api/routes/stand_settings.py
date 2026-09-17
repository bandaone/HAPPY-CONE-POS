from fastapi import APIRouter, Depends

from app.api.deps import commit_result, current_user, database, manager
from app.core.db import lock_branch
from app.domains.settings import service
from app.schemas.stand_settings import StandSettingsCommand

router = APIRouter(prefix='/api/stand-settings')


@router.get('')
def show(_user=Depends(current_user), db=Depends(database)):
    settings = service.get_settings(db)
    result = service.dto(settings)
    db.commit()
    return result


@router.put('')
def update(command: StandSettingsCommand, actor=Depends(manager), db=Depends(database)):
    lock_branch(db)
    return commit_result(db, service.update_settings(db, actor, command))

