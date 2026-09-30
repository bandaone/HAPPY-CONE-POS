from typing import Literal

from pydantic import Field, StrictBool, StrictInt, model_validator

from .common import Command, Money, Reason


class LineCommand(Command):
    variant_id: str = Field(min_length=1,max_length=60)
    quantity: StrictInt = Field(ge=1,le=100)
    modifier_ids: list[str] = Field(default_factory=list,max_length=12)
    notes: str = Field(default='',max_length=300)


class QuoteCommand(Command):
    lines: list[LineCommand] = Field(min_length=1,max_length=50)


class PaymentCommand(Command):
    method: Literal['CASH','MOBILE_MONEY_MANUAL','CARD_MANUAL']
    tendered_ngwee: Money | None = None

    @model_validator(mode='after')
    def valid_method(self):
        if self.method == 'CASH':
            if self.tendered_ngwee is None:
                raise ValueError('Cash requires amount tendered')
        else:
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
