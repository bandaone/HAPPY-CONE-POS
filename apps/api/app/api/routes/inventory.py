from fastapi import APIRouter, Depends

from app.api.deps import commit_result, database, manager
from app.domains.inventory import service
from app.schemas.inventory import (
    ActivateInventoryCommand,
    ArchiveStockItemCommand,
    CountCommand,
    MovementCommand,
    StockItemCommand,
    StockItemUpdate,
)

router = APIRouter(prefix="/api/inventory", dependencies=[Depends(manager)])


@router.get("")
def inventory(include_inactive: bool = False, db=Depends(database)):
    return service.inventory(db, include_inactive)


@router.post("/items", status_code=201)
def create_item(command: StockItemCommand, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.create_item(db, user, command))


@router.put("/items/{item_id}")
def update_item(
    item_id: str, command: StockItemUpdate, user=Depends(manager), db=Depends(database)
):
    return commit_result(db, service.update_item(db, user, item_id, command))


@router.patch("/items/{item_id}/archive")
def archive_item(
    item_id: str,
    command: ArchiveStockItemCommand,
    user=Depends(manager),
    db=Depends(database),
):
    return commit_result(db, service.set_item_active(db, user, item_id, command.active))


@router.post("/activate")
def activate(
    command: ActivateInventoryCommand, user=Depends(manager), db=Depends(database)
):
    return commit_result(db, service.activate_inventory(db, user, command))


@router.get("/movements")
def movements(item_id: str | None = None, db=Depends(database)):
    return service.movements(db, item_id)


@router.post("/movements", status_code=201)
def movement(command: MovementCommand, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.manual_movement(db, user, command))


@router.get("/counts")
def counts(db=Depends(database)):
    return service.counts(db)


@router.post("/counts", status_code=201)
def count(command: CountCommand, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.record_count(db, user, command))
