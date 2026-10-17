from fastapi import APIRouter, Depends, Request

from app.api.deps import commit_result, database, manager
from app.domains.sync.worker import status

router = APIRouter(prefix="/api/sync")


@router.get("/status")
def sync_status(request: Request, user=Depends(manager), db=Depends(database)):
    return commit_result(db, status(db, request.app.state.settings))
