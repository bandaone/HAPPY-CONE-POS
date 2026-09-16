from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, StrictBool
from app.api.deps import database, current_user, manager, commit_result
from app.domains.catalog import service

router = APIRouter(prefix='/api/catalog')


class Availability(BaseModel):
    model_config = ConfigDict(extra='forbid')
    active: StrictBool


@router.get('')
def catalog(include_inactive: bool = False, user=Depends(current_user), db=Depends(database)):
    if include_inactive and user.role not in ('MANAGER', 'OWNER_ADMIN'):
        raise HTTPException(403, 'Only managers can view unavailable products')
    return service.catalog(db, include_inactive)


@router.patch('/products/{product_id}')
def availability(product_id: str, command: Availability, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.set_availability(db, user, product_id, command.active))
