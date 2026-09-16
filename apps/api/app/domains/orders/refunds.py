from sqlalchemy import select
from fastapi import HTTPException
from app.core.db import lock_branch
from app.models.payment import Payment,Refund
from app.models.business_day import BusinessDay
from app.domains.orders.service import get_order,order_dto
from app.domains.audit.service import record
from app.domains.reporting.service import daily_summary


def refund_order(db,actor,order_id,reason):
    lock_branch(db)
    order=get_order(db,order_id)
    day=db.get(BusinessDay,order.business_day_id)
    if day.status!='OPEN':
        raise HTTPException(409,'Refunds for a closed business day require administrative reconciliation')
    if db.scalar(select(Refund).where(Refund.order_id==order.id)):
        raise HTTPException(409,'This order is already refunded')
    payment=db.scalar(select(Payment).where(Payment.order_id==order.id))
    if payment.method=='CASH' and daily_summary(db,day)['expected_cash_ngwee']<payment.amount_ngwee:
        raise HTTPException(409,'Insufficient expected cash for refund')
    reversal=Refund(order_id=order.id,payment_id=payment.id,business_day_id=day.id,
                    amount_ngwee=payment.amount_ngwee,reason=reason,approved_by=actor.id)
    db.add(reversal)
    payment.status='REFUNDED'
    db.flush()
    record(db,actor,'ORDER_REFUNDED','order',order.id,{'reason':reason,'amount_ngwee':reversal.amount_ngwee,
           'refund_id':reversal.id,'method':payment.method,'stock_returned':False},order.id)
    return order_dto(db,order)
