from typing import Literal
from pydantic import Field, StrictInt, model_validator, StrictBool
from .common import Command, Money, Reason


class LineCommand(Command):
    variant_id: str = Field(min_length=1,max_length=60)
    quantity: StrictInt = Field(ge=1,le=100)
    modifier_ids: list[str] = Field(default_factory=list,max_length=4)
    notes: str = Field(default='',max_length=300)


class QuoteCommand(Command):
    lines: list[LineCommand] = Field(min_length=1,max_length=50)


class PaymentCommand(Command):
    method: Literal['CASH','MOBILE_MONEY_MANUAL','CARD_MANUAL']
    tendered_ngwee: Money | None = None
    provider: str | None = Field(default=None,min_length=1,max_length=100)
    reference: str | None = Field(default=None,min_length=1,max_length=120)

    @model_validator(mode='after')
    def valid_method(self):
        if self.method == 'CASH':
            if self.tendered_ngwee is None:
                raise ValueError('Cash requires amount tendered')
            if self.provider or self.reference:
                raise ValueError('Cash cannot have an external payment reference')
        else:
            if not self.provider or not self.reference:
                raise ValueError('Manual external payments require provider and reference')
            if self.tendered_ngwee is not None:
                raise ValueError('External payments cannot have cash tendered')
        return self


class CheckoutCommand(QuoteCommand):
    idempotency_key: str = Field(min_length=8,max_length=128,pattern=r'^[A-Za-z0-9_\-]+$')
    business_day_id: str = Field(min_length=1,max_length=36)
    payment: PaymentCommand
    offline: StrictBool = False

    @model_validator(mode='after')
    def offline_cash_only(self):
        if self.offline and self.payment.method != 'CASH':
            raise ValueError('Only cash sales can synchronize from offline mode')
        return self


class StatusCommand(Command):
    status: Literal['NEW','PREPARING','READY','SERVED']
    expected_status: Literal['NEW','PREPARING','READY','SERVED']


class RefundCommand(Command):
    reason: Reason
