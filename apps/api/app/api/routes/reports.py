from fastapi import APIRouter,Depends
from app.api.deps import database,manager
from app.domains.reporting.service import report

router=APIRouter(prefix='/api/reports',dependencies=[Depends(manager)])


@router.get('/daily')
def daily(business_day_id: str | None=None,db=Depends(database)):
    return report(db,business_day_id)
