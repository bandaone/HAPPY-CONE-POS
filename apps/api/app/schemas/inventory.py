from decimal import Decimal
from typing import Literal

from pydantic import Field

from .common import Command, Quantity, Reason


class MovementCommand(Command):
    item_id: str = Field(min_length=1, max_length=60)
    type: Literal[
        "RECEIPT",
        "WASTE",
        "ADJUSTMENT_IN",
        "ADJUSTMENT_OUT",
        "RETURN_IN",
        "RETURN_OUT",
        "STAFF_USE",
    ]
    quantity: Quantity
    reason: Reason
    quantity_in_packs: bool = False


class CountCommand(Command):
    item_id: str = Field(min_length=1, max_length=60)
    counted_quantity: Decimal = Field(
        ge=0, max_digits=15, decimal_places=3, allow_inf_nan=False
    )
    reason: Reason


class StockItemCommand(Command):
    id: str = Field(min_length=1, max_length=60, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    name: str = Field(min_length=1, max_length=100)
    base_unit: str = Field(min_length=1, max_length=20)
    pack_name: str | None = Field(default=None, max_length=40)
    units_per_pack: Decimal = Field(
        default=Decimal("1"), gt=0, max_digits=15, decimal_places=3, allow_inf_nan=False
    )
    low_stock_threshold: Decimal = Field(
        default=Decimal("0"), ge=0, max_digits=15, decimal_places=3, allow_inf_nan=False
    )


class StockItemUpdate(Command):
    name: str = Field(min_length=1, max_length=100)
    base_unit: str = Field(min_length=1, max_length=20)
    pack_name: str | None = Field(default=None, max_length=40)
    units_per_pack: Decimal = Field(
        default=Decimal("1"), gt=0, max_digits=15, decimal_places=3, allow_inf_nan=False
    )
    low_stock_threshold: Decimal = Field(
        default=Decimal("0"), ge=0, max_digits=15, decimal_places=3, allow_inf_nan=False
    )


class ArchiveStockItemCommand(Command):
    active: bool


class OpeningQuantity(Command):
    item_id: str = Field(min_length=1, max_length=60)
    quantity: Decimal = Field(
        ge=0, max_digits=15, decimal_places=3, allow_inf_nan=False
    )


class ActivateInventoryCommand(Command):
    opening_quantities: list[OpeningQuantity] = Field(min_length=1)
