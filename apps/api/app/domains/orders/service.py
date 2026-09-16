import hashlib
import json
from sqlalchemy import select
from fastapi import HTTPException
from app.models.order import Order, OrderLine
from app.models.payment import Payment, Refund
from app.models.base import new_id
from app.core.db import lock_branch
from app.domains.business_day.service import current
from app.domains.catalog.service import price_lines
from app.domains.inventory import service as inventory
from app.domains.payments.service import record_payment, payment_dto
from app.domains.audit.service import record


def get_order(db,order_id):
    order=db.get(Order,order_id)
    if not order:
        raise HTTPException(404,'Order not found')
    return order


def line_dto(line):
    return {key:getattr(line,key) for key in ('variant_id','name','quantity','unit_price_ngwee','total_ngwee','modifier_names','notes')}


def order_dto(db,order):
    payment=db.scalar(select(Payment).where(Payment.order_id==order.id))
    refund=db.scalar(select(Refund).where(Refund.order_id==order.id))
    lines=db.scalars(select(OrderLine).where(OrderLine.order_id==order.id).order_by(OrderLine.position))
    return dict(id=order.id,number=order.number,business_day_id=order.business_day_id,status=order.status,
                created_at=order.created_at,lines=[line_dto(line) for line in lines],total_ngwee=order.total_ngwee,
                payment=payment_dto(payment),refunded=refund is not None,refund_reason=refund.reason if refund else None,offline=order.offline)


def checkout(db,actor,command):
    lock_branch(db)
    payload=command.model_dump(mode='json')
    digest=hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    existing=db.scalar(select(Order).where(Order.idempotency_key==command.idempotency_key))
    if existing:
        if existing.payload_hash!=digest or existing.actor_id!=actor.id:
            raise HTTPException(409,'Idempotency key is already used for a different checkout')
        return order_dto(db,existing)
    day=current(db,required=True)
    if day.id!=command.business_day_id:
        raise HTTPException(409,'This sale belongs to a different or closed business day; manager review is required')
    quote,consumption=price_lines(db,command.lines)
    if quote['total_ngwee'] > 2_000_000_000:
        raise HTTPException(422,'Order exceeds the supported amount')
    for item_id,quantity in consumption.items():
        if inventory.expected_on_hand(db,item_id)<quantity:
            raise HTTPException(409,'Insufficient stock for this order')
    order=Order(id=new_id(),number=f'A{day.next_order_number:03d}',business_day_id=day.id,actor_id=actor.id,
                total_ngwee=quote['total_ngwee'],idempotency_key=command.idempotency_key,payload_hash=digest,offline=command.offline)
    day.next_order_number+=1
    db.add(order)
    db.flush()
    db.add_all([OrderLine(order_id=order.id,position=position,**line) for position,line in enumerate(quote['lines'])])
    record_payment(db,actor,order,command.payment)
    for item_id,quantity in consumption.items():
        inventory.record_movement(db,actor,item_id,'SALE_CONSUMPTION',-quantity,'Recipe consumption',reference=order.id,correlation_id=order.id)
    record(db,actor,'ORDER_CREATED','order',order.id,{'total_ngwee':order.total_ngwee,'number':order.number,'offline':order.offline},order.id)
    return order_dto(db,order)


def list_orders(db,active=False):
    query=select(Order)
    if active:
        query=query.where(Order.status!='SERVED',~select(Refund.id).where(Refund.order_id==Order.id).exists()).order_by(Order.created_at)
    else:
        query=query.order_by(Order.created_at.desc()).limit(200)
    return [order_dto(db,order) for order in db.scalars(query)]
