from sqlalchemy import select
from fastapi import HTTPException
from app.models.business_day import BusinessDay, CashMovement
from app.models.base import utcnow
from app.core.db import lock_branch
from app.domains.audit.service import record
from app.domains.reporting.service import daily_summary


def current(db, required=False):
    day = db.scalar(select(BusinessDay).where(BusinessDay.status=='OPEN'))
    if not day and required:
        raise HTTPException(409, 'Open a business day before continuing')
    return day


def day_dto(db,day):
    if not day:
        return None
    summary = day.close_snapshot if day.status=='CLOSED' else daily_summary(db,day)
    return dict(id=day.id,status=day.status,opened_at=day.opened_at,closed_at=day.closed_at,
                opening_float_ngwee=day.opening_float_ngwee,actual_cash_ngwee=day.actual_cash_ngwee,
                expected_cash_ngwee=summary['expected_cash_ngwee'],variance_ngwee=summary['variance_ngwee'],
                summary=day.close_snapshot)


def open_day(db,actor,opening_float):
    lock_branch(db)
    if current(db):
        raise HTTPException(409, 'A business day is already open')
    day = BusinessDay(opened_by=actor.id,opening_float_ngwee=opening_float)
    db.add(day)
    db.flush()
    record(db,actor,'DAY_OPENED','business_day',day.id,{'opening_float_ngwee':opening_float})
    return day_dto(db,day)


def close_day(db,actor,actual_cash):
    lock_branch(db)
    day = current(db,required=True)
    day.actual_cash_ngwee = actual_cash
    day.close_snapshot = daily_summary(db,day)
    day.status, day.closed_by, day.closed_at = 'CLOSED', actor.id, utcnow()
    record(db,actor,'DAY_CLOSED','business_day',day.id,day.close_snapshot)
    return day_dto(db,day)


def cash_movement(db,actor,command):
    lock_branch(db)
    day = current(db,required=True)
    if daily_summary(db,day)['expected_cash_ngwee'] + command.amount_ngwee < 0:
        raise HTTPException(409, 'Cash withdrawal exceeds expected cash')
    movement = CashMovement(business_day_id=day.id,amount_ngwee=command.amount_ngwee,reason=command.reason,actor_id=actor.id)
    db.add(movement)
    db.flush()
    record(db,actor,'CASH_MOVEMENT','cash_movement',movement.id,{'amount_ngwee':command.amount_ngwee,'reason':command.reason})
    return dict(id=movement.id,amount_ngwee=movement.amount_ngwee,reason=movement.reason)
