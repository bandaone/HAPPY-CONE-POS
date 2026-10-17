from collections import defaultdict
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select

from app.models.business_day import BusinessDay, CashMovement
from app.models.correction import SaleCorrection
from app.models.inventory import InventoryItem, StockMovement
from app.models.order import Order, OrderLine
from app.models.payment import Payment, Refund
from app.models.user import User

METHODS = ('CASH', 'MOBILE_MONEY_MANUAL', 'CARD_MANUAL')


def _iso(value):
    return value.isoformat() if value else None


def _staff_name(db, user_id):
    user = db.get(User, user_id) if user_id else None
    return user.name if user else None


def _base_summary(day):
    return dict(
        business_day_id=day.id if day else None,
        order_count=0,
        completed_sale_count=0,
        units_sold=0,
        gross_sales_ngwee=0,
        refunds_ngwee=0,
        corrections_ngwee=0,
        net_sales_ngwee=0,
        average_order_ngwee=0,
        payment_totals={method: 0 for method in METHODS},
        opening_float_ngwee=day.opening_float_ngwee if day else 0,
        cash_movements_ngwee=0,
        expected_cash_ngwee=day.opening_float_ngwee if day else 0,
        actual_cash_ngwee=day.actual_cash_ngwee if day else None,
        variance_ngwee=None,
        opened_at=_iso(day.opened_at) if day else None,
        closed_at=_iso(day.closed_at) if day else None,
        opened_by_name=None,
        closed_by_name=None,
        products=[], sales=[], cash_activity=[], cash_movements=[],
        hourly_sales=[], stock_usage=[], waste=[],
        cash_reconciliation={
            'opening_float_ngwee': day.opening_float_ngwee if day else 0,
            'cash_sales_ngwee': 0,
            'cash_reversals_ngwee': 0,
            'cash_movements_ngwee': 0,
            'expected_cash_ngwee': day.opening_float_ngwee if day else 0,
        },
    )


def daily_summary(db, day):
    summary = _base_summary(day)
    if not day:
        return summary
    summary['opened_by_name'] = _staff_name(db, day.opened_by)
    summary['closed_by_name'] = _staff_name(db, day.closed_by)

    rows = db.execute(
        select(Order, Payment, Refund)
        .join(Payment, Payment.order_id == Order.id)
        .outerjoin(Refund, Refund.order_id == Order.id)
        .where(Order.business_day_id == day.id)
        .order_by(Order.created_at, Order.number)
    ).all()
    corrections = db.scalars(select(SaleCorrection).where(
        SaleCorrection.business_day_id == day.id)).all()
    correction_by_original = {item.original_order_id: item for item in corrections}
    correction_by_replacement = {
        item.replacement_order_id: item for item in corrections if item.replacement_order_id
    }
    order_numbers = {order.id: order.number for order, _, _ in rows}

    product_totals = defaultdict(lambda: [0, 0])
    hourly = defaultdict(lambda: [0, 0])
    cash_activity = [dict(
        kind='OPENING_FLOAT', created_at=_iso(day.opened_at),
        receipt_number=None, amount_ngwee=day.opening_float_ngwee,
        reason='Opening float', actor_name=summary['opened_by_name'],
    )]
    cash_sales = 0
    cash_reversals = 0

    for order, payment, refund in rows:
        reversal = refund.amount_ngwee if refund else 0
        net = order.total_ngwee - reversal
        summary['gross_sales_ngwee'] += order.total_ngwee
        summary['refunds_ngwee'] += reversal
        if refund and refund.kind == 'CORRECTION':
            summary['corrections_ngwee'] += reversal
        summary['payment_totals'][payment.method] += payment.amount_ngwee - reversal
        correction = correction_by_original.get(order.id) or correction_by_replacement.get(order.id)
        original = correction_by_replacement.get(order.id)
        summary['sales'].append(dict(
            order_id=order.id, receipt_number=order.number,
            created_at=_iso(order.created_at), cashier_name=order.cashier_name,
            payment_method=payment.method, gross_ngwee=order.total_ngwee,
            reversal_ngwee=reversal, net_ngwee=net,
            correction_status=correction.status if correction else None,
            corrects_receipt_number=(order_numbers.get(original.original_order_id)
                                     if original else None),
            reason=refund.reason if refund else None,
        ))
        if payment.method == 'CASH':
            cash_sales += payment.amount_ngwee
            cash_activity.append(dict(
                kind='SALE', created_at=_iso(payment.created_at),
                receipt_number=order.number, amount_ngwee=payment.amount_ngwee,
                reason='Cash sale', actor_name=order.cashier_name,
            ))
            if refund:
                cash_reversals -= refund.amount_ngwee
                cash_activity.append(dict(
                    kind=refund.kind, created_at=_iso(refund.created_at),
                    receipt_number=order.number, amount_ngwee=-refund.amount_ngwee,
                    reason=refund.reason, actor_name=_staff_name(db, refund.approved_by),
                ))
        if not refund:
            lines = db.scalars(select(OrderLine).where(OrderLine.order_id == order.id)).all()
            for line in lines:
                product_totals[line.name][0] += line.quantity
                product_totals[line.name][1] += line.total_ngwee
                summary['units_sold'] += line.quantity
            hour = order.created_at.strftime('%H:00')
            hourly[hour][0] += 1
            hourly[hour][1] += order.total_ngwee

    summary['order_count'] = len(rows)
    summary['completed_sale_count'] = sum(1 for _, _, refund in rows if refund is None)
    summary['net_sales_ngwee'] = summary['gross_sales_ngwee'] - summary['refunds_ngwee']
    if summary['completed_sale_count']:
        summary['average_order_ngwee'] = summary['net_sales_ngwee'] // summary['completed_sale_count']
    summary['products'] = [
        dict(name=name, quantity=values[0], total_ngwee=values[1])
        for name, values in sorted(product_totals.items(), key=lambda item: (-item[1][1], item[0]))
    ]
    summary['hourly_sales'] = [
        dict(hour=hour, order_count=values[0], net_sales_ngwee=values[1])
        for hour, values in sorted(hourly.items())
    ]

    movements = db.scalars(select(CashMovement).where(
        CashMovement.business_day_id == day.id).order_by(CashMovement.created_at, CashMovement.id)).all()
    summary['cash_movements'] = [dict(
        id=item.id, created_at=_iso(item.created_at), amount_ngwee=item.amount_ngwee,
        reason=item.reason, actor_name=_staff_name(db, item.actor_id),
    ) for item in movements]
    for item in movements:
        cash_activity.append(dict(
            kind='CASH_MOVEMENT', created_at=_iso(item.created_at),
            receipt_number=None, amount_ngwee=item.amount_ngwee,
            reason=item.reason, actor_name=_staff_name(db, item.actor_id),
        ))
    summary['cash_movements_ngwee'] = sum(item.amount_ngwee for item in movements)
    summary['cash_activity'] = sorted(cash_activity, key=lambda item: item['created_at'])
    expected = (day.opening_float_ngwee + cash_sales + cash_reversals
                + summary['cash_movements_ngwee'])
    summary['expected_cash_ngwee'] = expected
    summary['cash_reconciliation'] = dict(
        opening_float_ngwee=day.opening_float_ngwee,
        cash_sales_ngwee=cash_sales,
        cash_reversals_ngwee=cash_reversals,
        cash_movements_ngwee=summary['cash_movements_ngwee'],
        expected_cash_ngwee=expected,
    )
    if day.actual_cash_ngwee is not None:
        summary['variance_ngwee'] = day.actual_cash_ngwee - expected

    stock_rows = db.execute(
        select(StockMovement.item_id, func.sum(StockMovement.quantity))
        .where(
            StockMovement.reference.in_(list(order_numbers) or ['']),
            StockMovement.type.in_(('SALE_CONSUMPTION', 'SALE_CORRECTION_RETURN')),
        )
        .group_by(StockMovement.item_id)
    ).all()
    for item_id, signed_quantity in stock_rows:
        used = -Decimal(signed_quantity)
        if used <= 0:
            continue
        item = db.get(InventoryItem, item_id)
        summary['stock_usage'].append(dict(
            item_id=item_id, name=item.name if item else item_id,
            quantity=format(used, '.3f'), unit=item.unit if item else '',
        ))
    summary['stock_usage'].sort(key=lambda item: item['name'])
    return summary


def report(db, business_day_id=None):
    day = (db.get(BusinessDay, business_day_id) if business_day_id else
           db.scalar(select(BusinessDay).order_by(BusinessDay.opened_at.desc()).limit(1)))
    if business_day_id and not day:
        raise HTTPException(404, 'Business day not found')
    return day.close_snapshot if day and day.status == 'CLOSED' else daily_summary(db, day)
