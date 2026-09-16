from app.domains.orders.service import order_dto


def ticket(db,order):
    sale=order_dto(db,order)
    return dict(order_id=sale['id'],number=sale['number'],created_at=sale['created_at'],lines=sale['lines'],
                total_ngwee=sale['total_ngwee'],payment_status=sale['payment']['status'],payment_method=sale['payment']['method'],
                tendered_ngwee=sale['payment']['tendered_ngwee'],change_ngwee=sale['payment']['change_ngwee'],fiscal_status='NOT_CONFIGURED')
