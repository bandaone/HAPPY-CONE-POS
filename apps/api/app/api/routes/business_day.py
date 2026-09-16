from fastapi import APIRouter, Depends
from sqlalchemy import select
from pydantic import StrictInt, Field, field_validator
from app.api.deps import database, cashier, manager, commit_result
from app.schemas.common import Command, Money, Reason
from app.domains.business_day import service
from app.models.business_day import BusinessDay

router = APIRouter(prefix='/api/business-day')


class OpenDay(Command):
    opening_float_ngwee: Money


class CloseDay(Command):
    actual_cash_ngwee: Money


class CashCommand(Command):
    amount_ngwee: StrictInt = Field(ge=-2_000_000_000,le=2_000_000_000)
    reason: Reason

    @field_validator('amount_ngwee')
    @classmethod
    def nonzero(cls,value):
        if value == 0:
            raise ValueError('Amount must be nonzero')
        return value


@router.get('/current')
def current(user=Depends(cashier),db=Depends(database)):
    return service.day_dto(db,service.current(db))


@router.get('')
def list_days(user=Depends(cashier),db=Depends(database)):
    return [service.day_dto(db,day) for day in db.scalars(select(BusinessDay).order_by(BusinessDay.opened_at.desc()).limit(60))]


@router.post('/open',status_code=201)
def open_day(command: OpenDay,user=Depends(cashier),db=Depends(database)):
    return commit_result(db, service.open_day(db,user,command.opening_float_ngwee))


@router.post('/close')
def close_day(command: CloseDay,user=Depends(manager),db=Depends(database)):
    return commit_result(db, service.close_day(db,user,command.actual_cash_ngwee))


@router.post('/cash-movements',status_code=201)
def cash_movement(command: CashCommand,user=Depends(manager),db=Depends(database)):
    return commit_result(db, service.cash_movement(db,user,command))
