from fastapi import HTTPException
from sqlalchemy import select

from app.core.db import lock_branch
from app.domains.audit.service import record
from app.domains.business_day.service import current
from app.domains.inventory import service as inventory
from app.domains.reporting.service import daily_summary
from app.models.correction import SaleCorrection
from app.models.inventory import StockMovement
from app.models.order import Order
from app.models.payment import Payment, Refund


def latest_order_id(db, business_day_id):
    return db.scalar(select(Order.id).where(Order.business_day_id == business_day_id)
                     .order_by(Order.created_at.desc(), Order.number.desc()).limit(1))


def start_correction(db, actor, order_id, reason):
    from app.domains.orders.service import get_order, order_dto

    lock_branch(db)
    order = get_order(db, order_id)
    day = current(db, required=True)
    if order.business_day_id != day.id:
        raise HTTPException(409, 'Only a sale from the open business day can be corrected')
    if latest_order_id(db, day.id) != order.id:
        raise HTTPException(409, 'Only the latest completed sale can be corrected')
    if db.scalar(select(Refund).where(Refund.order_id == order.id)):
        raise HTTPException(409, 'This sale is already refunded or corrected')

    payment = db.scalar(select(Payment).where(Payment.order_id == order.id))
    if payment.method == 'CASH' and daily_summary(db, day)['expected_cash_ngwee'] < payment.amount_ngwee:
        raise HTTPException(409, 'Insufficient expected cash to reverse this sale')

    refund = Refund(order_id=order.id, payment_id=payment.id, business_day_id=day.id,
                    amount_ngwee=payment.amount_ngwee, reason=reason,
                    approved_by=actor.id, kind='CORRECTION')
    correction = SaleCorrection(original_order_id=order.id, business_day_id=day.id,
                                reason=reason, actor_id=actor.id, status='PENDING')
    db.add_all([refund, correction])
    payment.status = 'REFUNDED'
    db.flush()

    consumed = db.scalars(select(StockMovement).where(
        StockMovement.reference == order.id,
        StockMovement.type == 'SALE_CONSUMPTION',
    ).order_by(StockMovement.created_at, StockMovement.id)).all()
    for movement in consumed:
        inventory.record_movement(
            db, actor, movement.item_id, 'SALE_CORRECTION_RETURN', -movement.quantity,
            f'Correction of receipt {order.number}', reference=order.id,
            correlation_id=correction.id,
        )

    record(db, actor, 'ORDER_CORRECTION_STARTED', 'order', order.id, {
        'reason': reason, 'amount_ngwee': refund.amount_ngwee,
        'correction_id': correction.id,
    }, correction.id)
    return order_dto(db, order)
