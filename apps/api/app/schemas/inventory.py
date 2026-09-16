from decimal import Decimal
from typing import Literal
from pydantic import Field
from .common import Command, Quantity, Reason


class MovementCommand(Command):
    item_id: str = Field(min_length=1, max_length=60)
    type: Literal['RECEIPT','WASTE','ADJUSTMENT_IN','ADJUSTMENT_OUT','RETURN_IN','RETURN_OUT','STAFF_USE']
    quantity: Quantity
    reason: Reason


class CountCommand(Command):
    item_id: str = Field(min_length=1, max_length=60)
    counted_quantity: Decimal = Field(ge=0, max_digits=15, decimal_places=3, allow_inf_nan=False)
    reason: Reason
