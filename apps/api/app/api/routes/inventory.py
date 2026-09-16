from fastapi import APIRouter, Depends
from app.api.deps import database, manager, commit_result
from app.schemas.inventory import MovementCommand, CountCommand
from app.domains.inventory import service

router = APIRouter(prefix='/api/inventory', dependencies=[Depends(manager)])


@router.get('')
def inventory(db=Depends(database)):
    return service.inventory(db)


@router.get('/movements')
def movements(item_id: str | None = None, db=Depends(database)):
    return service.movements(db,item_id)


@router.post('/movements',status_code=201)
def movement(command: MovementCommand,user=Depends(manager),db=Depends(database)):
    return commit_result(db, service.manual_movement(db,user,command))


@router.get('/counts')
def counts(db=Depends(database)):
    return service.counts(db)


@router.post('/counts',status_code=201)
def count(command: CountCommand,user=Depends(manager),db=Depends(database)):
    return commit_result(db, service.record_count(db,user,command))
