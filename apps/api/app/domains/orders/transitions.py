from sqlalchemy import select
from fastapi import HTTPException
from app.core.db import lock_branch
from app.models.payment import Refund
from app.domains.orders.service import get_order,order_dto
from app.domains.audit.service import record

NEXT_STATUS={'NEW':'PREPARING','PREPARING':'READY','READY':'SERVED'}


def transition(db,actor,order_id,command):
    lock_branch(db)
    order=get_order(db,order_id)
    if db.scalar(select(Refund).where(Refund.order_id==order_id)):
        raise HTTPException(409,'Refunded orders cannot be prepared')
    if order.status!=command.expected_status:
        raise HTTPException(409,'Order changed; refresh the queue before retrying')
    if NEXT_STATUS.get(order.status)!=command.status:
        raise HTTPException(409,'Invalid preparation status transition')
    previous=order.status
    order.status=command.status
    record(db,actor,'ORDER_STATUS_CHANGED','order',order.id,{'before':previous,'after':order.status},order.id)
    return order_dto(db,order)
