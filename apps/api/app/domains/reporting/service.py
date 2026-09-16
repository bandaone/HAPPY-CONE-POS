from sqlalchemy import select, func
from app.models.business_day import CashMovement, BusinessDay
from app.models.order import Order, OrderLine
from app.models.payment import Payment, Refund

METHODS = ('CASH','MOBILE_MONEY_MANUAL','CARD_MANUAL')


def daily_summary(db,day):
    summary = dict(business_day_id=day.id if day else None,order_count=0,gross_sales_ngwee=0,refunds_ngwee=0,
                   net_sales_ngwee=0,average_order_ngwee=0,payment_totals={method:0 for method in METHODS},
                   opening_float_ngwee=day.opening_float_ngwee if day else 0,cash_movements_ngwee=0,
                   expected_cash_ngwee=day.opening_float_ngwee if day else 0,
                   actual_cash_ngwee=day.actual_cash_ngwee if day else None,variance_ngwee=None,products=[])
    if not day:
        return summary
    rows=db.execute(select(Order,Payment,Refund).join(Payment,Payment.order_id==Order.id)
                    .outerjoin(Refund,Refund.order_id==Order.id).where(Order.business_day_id==day.id)).all()
    summary['order_count']=len(rows)
    for order,payment,refund in rows:
        summary['gross_sales_ngwee']+=order.total_ngwee
        reversal=refund.amount_ngwee if refund else 0
        summary['refunds_ngwee']+=reversal
        summary['payment_totals'][payment.method]+=payment.amount_ngwee-reversal
    summary['net_sales_ngwee']=summary['gross_sales_ngwee']-summary['refunds_ngwee']
    summary['average_order_ngwee']=summary['net_sales_ngwee']//len(rows) if rows else 0
    products=db.execute(select(OrderLine.name,func.sum(OrderLine.quantity),func.sum(OrderLine.total_ngwee))
                        .join(Order,Order.id==OrderLine.order_id).where(Order.business_day_id==day.id)
                        .group_by(OrderLine.name).order_by(func.sum(OrderLine.total_ngwee).desc(),OrderLine.name))
    summary['products']=[dict(name=name,quantity=quantity,total_ngwee=total) for name,quantity,total in products]
    summary['cash_movements_ngwee']=db.scalar(select(func.coalesce(func.sum(CashMovement.amount_ngwee),0)).where(CashMovement.business_day_id==day.id))
    summary['expected_cash_ngwee']+=summary['cash_movements_ngwee']+summary['payment_totals']['CASH']
    if day.actual_cash_ngwee is not None:
        summary['variance_ngwee']=day.actual_cash_ngwee-summary['expected_cash_ngwee']
    return summary


def report(db,business_day_id=None):
    from fastapi import HTTPException
    day=db.get(BusinessDay,business_day_id) if business_day_id else db.scalar(select(BusinessDay).order_by(BusinessDay.opened_at.desc()).limit(1))
    if business_day_id and not day:
        raise HTTPException(404,'Business day not found')
    return day.close_snapshot if day and day.status=='CLOSED' else daily_summary(db,day)
