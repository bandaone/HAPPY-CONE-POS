from fastapi import HTTPException

from app.domains.audit.service import record
from app.models.payment import Payment

from .contracts import PaymentResult


class ManualPaymentAdapter:
    """Operator attestation, not a network gateway confirmation."""
    def confirm(self, *, amount_ngwee, provider=None, reference=None):
        return PaymentResult('CONFIRMED',amount_ngwee,provider,reference)


def record_payment(db,actor,order,command):
    if command.method == 'CASH' and command.tendered_ngwee < order.total_ngwee:
        raise HTTPException(422, 'Cash tendered is less than the order total')
    result = ManualPaymentAdapter().confirm(amount_ngwee=order.total_ngwee,provider=None,reference=None)
    payment = Payment(order_id=order.id,method=command.method,status=result.status,amount_ngwee=result.amount_ngwee,
                      tendered_ngwee=command.tendered_ngwee,
                      change_ngwee=command.tendered_ngwee-order.total_ngwee if command.method=='CASH' else 0,
                      provider=result.provider,reference=result.reference,confirmed_by=actor.id)
    db.add(payment)
    db.flush()
    record(db,actor,'CASH_PAYMENT_CONFIRMED' if command.method=='CASH' else 'MANUAL_PAYMENT_CONFIRMED','payment',payment.id,
           {'method':payment.method,'amount_ngwee':payment.amount_ngwee},order.id)
    return payment


def payment_dto(payment):
    return {key:getattr(payment,key) for key in ('method','status','amount_ngwee','tendered_ngwee','change_ngwee','provider','reference')}
