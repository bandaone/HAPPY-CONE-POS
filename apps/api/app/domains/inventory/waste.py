from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import select

from app.core.db import lock_branch
from app.domains.audit.service import record
from app.domains.business_day.service import current
from app.domains.catalog.service import price_lines, recipe
from app.domains.settings.service import get_settings
from app.models.catalog import Product, Variant
from app.models.inventory import InventoryItem
from app.models.user import User
from app.models.waste import WasteRecord

from .service import expected_on_hand, record_movement


def _dto(db, waste):
    actor = db.get(User, waste.actor_id)
    return {
        "id": waste.id,
        "business_day_id": waste.business_day_id,
        "kind": waste.kind,
        "label": waste.label,
        "variant_id": waste.variant_id,
        "modifier_ids": waste.modifier_ids,
        "item_id": waste.item_id,
        "quantity": format(waste.quantity, ".3f"),
        "reason": waste.reason,
        "comment": waste.comment,
        "value_ngwee": waste.value_ngwee,
        "actor_name": actor.name if actor else None,
        "created_at": waste.created_at,
    }


def _tracking_required(db):
    if not get_settings(db).inventory_tracking_enabled:
        raise HTTPException(409, "Start stock tracking before recording waste")


def _ensure_stock(db, consumption):
    for item_id, quantity in consumption.items():
        if expected_on_hand(db, item_id) < quantity:
            raise HTTPException(409, "Insufficient stock to record this waste")


def record_prepared_waste(db, actor, command):
    lock_branch(db)
    day = current(db, required=True)
    _tracking_required(db)
    quote, consumption = price_lines(db, [command])
    _ensure_stock(db, consumption)
    line = quote["lines"][0]
    waste = WasteRecord(
        business_day_id=day.id,
        kind="PREPARED",
        label=line["name"],
        variant_id=command.variant_id,
        modifier_ids=list(command.modifier_ids),
        item_id=None,
        quantity=Decimal(command.quantity),
        reason=command.reason,
        comment=command.comment,
        value_ngwee=quote["total_ngwee"],
        actor_id=actor.id,
    )
    db.add(waste)
    db.flush()
    for item_id, quantity in consumption.items():
        record_movement(
            db,
            actor,
            item_id,
            "WASTE",
            -quantity,
            f"Prepared item waste: {command.reason}",
            reference=waste.id,
            correlation_id=waste.id,
        )
    record(
        db,
        actor,
        "WASTE_RECORDED",
        "waste",
        waste.id,
        {
            "kind": waste.kind,
            "quantity": str(waste.quantity),
            "value_ngwee": waste.value_ngwee,
        },
        waste.id,
    )
    return _dto(db, waste)


def _derived_value(db, item_id, quantity, variant_id):
    variant = db.get(Variant, variant_id)
    product = db.get(Product, variant.product_id) if variant else None
    if not variant or not product or not variant.active or not product.active:
        raise HTTPException(422, "Related menu price was not found")
    component = next(
        (row for row in recipe(db, variant_id=variant.id) if row["item_id"] == item_id),
        None,
    )
    if component is None:
        raise HTTPException(
            422,
            "That menu price does not use this ingredient; enter a selling-value estimate",
        )
    servings = quantity / Decimal(component["quantity"])
    return int(
        (Decimal(variant.price_ngwee) * servings).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )


def record_ingredient_waste(db, actor, command):
    lock_branch(db)
    day = current(db, required=True)
    _tracking_required(db)
    item = db.get(InventoryItem, command.item_id)
    if item is None or not item.active:
        raise HTTPException(404, "Active inventory item not found")
    _ensure_stock(db, {item.id: command.quantity})
    value = (
        _derived_value(db, item.id, command.quantity, command.related_variant_id)
        if command.related_variant_id
        else command.estimated_value_ngwee
    )
    waste = WasteRecord(
        business_day_id=day.id,
        kind="INGREDIENT",
        label=item.name,
        variant_id=command.related_variant_id,
        modifier_ids=[],
        item_id=item.id,
        quantity=command.quantity,
        reason=command.reason,
        comment=command.comment,
        value_ngwee=value,
        actor_id=actor.id,
    )
    db.add(waste)
    db.flush()
    record_movement(
        db,
        actor,
        item.id,
        "WASTE",
        -command.quantity,
        f"Ingredient waste: {command.reason}",
        reference=waste.id,
        correlation_id=waste.id,
    )
    record(
        db,
        actor,
        "WASTE_RECORDED",
        "waste",
        waste.id,
        {
            "kind": waste.kind,
            "quantity": str(waste.quantity),
            "value_ngwee": waste.value_ngwee,
        },
        waste.id,
    )
    return _dto(db, waste)


def list_waste(db, business_day_id):
    rows = db.scalars(
        select(WasteRecord)
        .where(WasteRecord.business_day_id == business_day_id)
        .order_by(WasteRecord.created_at, WasteRecord.id)
    ).all()
    return [_dto(db, waste) for waste in rows]
