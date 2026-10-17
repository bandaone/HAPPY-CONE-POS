from decimal import Decimal
from typing import Literal

from pydantic import Field, model_validator

from .common import Command, Money, Quantity, Reason

WasteReason = Literal[
    "DROPPED",
    "PREPARATION_MISTAKE",
    "MELTED_OR_SPOILED",
    "DAMAGED_PACKAGING",
    "OTHER",
]


class WasteCommand(Command):
    reason: WasteReason
    comment: str = Field(default="", max_length=300)

    @model_validator(mode="after")
    def other_needs_comment(self):
        if self.reason == "OTHER" and len(self.comment.strip()) < 3:
            raise ValueError("Add a comment when the waste reason is Other")
        return self


class PreparedWasteCommand(WasteCommand):
    variant_id: str = Field(min_length=1, max_length=60)
    modifier_ids: list[str] = Field(default_factory=list, max_length=20)
    quantity: int = Field(ge=1, le=100)
    notes: str = Field(default="", max_length=300, exclude=True)


class IngredientWasteCommand(WasteCommand):
    item_id: str = Field(min_length=1, max_length=60)
    quantity: Quantity
    related_variant_id: str | None = Field(default=None, max_length=60)
    estimated_value_ngwee: Money | None = None

    @model_validator(mode="after")
    def value_source_required(self):
        if self.related_variant_id is None and self.estimated_value_ngwee is None:
            raise ValueError(
                "Choose a related menu price or enter a selling-value estimate"
            )
        return self


class MovementCommand(Command):
    item_id: str = Field(min_length=1, max_length=60)
    type: Literal[
        "RECEIPT",
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
