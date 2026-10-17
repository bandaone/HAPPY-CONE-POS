from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.db import lock_branch
from app.domains.audit.service import record
from app.models.base import utcnow
from app.models.catalog import Modifier, Product, RecipeComponent, Variant
from app.models.inventory import InventoryItem, StockCount, StockMovement
from app.models.stand_settings import StandSettings


def expected_on_hand(db, item_id):
    query = select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(
        StockMovement.item_id == item_id
    )
    settings = db.get(StandSettings, 1)
    if (
        settings
        and settings.inventory_tracking_enabled
        and settings.inventory_tracking_started_at
    ):
        query = query.where(
            StockMovement.created_at >= settings.inventory_tracking_started_at
        )
    return db.scalar(query) or Decimal(0)


def item_dto(db, item):
    return dict(
        id=item.id,
        name=item.name,
        unit=item.unit,
        base_unit=item.unit,
        pack_name=item.pack_name,
        units_per_pack=format(item.units_per_pack, ".3f"),
        active=item.active,
        on_hand=format(expected_on_hand(db, item.id), ".3f"),
        low_stock_threshold=format(item.low_stock_threshold, ".3f"),
    )


def inventory(db, include_inactive=False):
    query = select(InventoryItem).order_by(InventoryItem.name)
    if not include_inactive:
        query = query.where(InventoryItem.active.is_(True))
    return [item_dto(db, item) for item in db.scalars(query)]


def movement_dto(db, movement):
    item = db.get(InventoryItem, movement.item_id)
    return dict(
        id=movement.id,
        item_id=item.id,
        item_name=item.name,
        type=movement.type,
        quantity=format(movement.quantity, ".3f"),
        unit=item.unit,
        reference=movement.reference,
        reason=movement.reason,
        actor_id=movement.actor_id,
        created_at=movement.created_at,
    )


def movements(db, item_id=None):
    query = select(StockMovement).order_by(StockMovement.created_at.desc()).limit(500)
    if item_id:
        query = query.where(StockMovement.item_id == item_id)
    return [movement_dto(db, m) for m in db.scalars(query)]


def record_movement(
    db,
    actor,
    item_id,
    movement_type,
    quantity,
    reason,
    reference=None,
    correlation_id=None,
):
    if db.get(InventoryItem, item_id) is None:
        raise HTTPException(404, "Inventory item not found")
    if quantity < 0 and expected_on_hand(db, item_id) + quantity < 0:
        raise HTTPException(409, "Insufficient stock; review inventory before retrying")
    movement = StockMovement(
        item_id=item_id,
        type=movement_type,
        quantity=quantity,
        reason=reason,
        reference=reference,
        actor_id=actor.id if actor else None,
    )
    db.add(movement)
    db.flush()
    record(
        db,
        actor,
        f"STOCK_{movement_type}",
        "stock_movement",
        movement.id,
        {
            "item_id": item_id,
            "quantity": str(quantity),
            "reason": reason,
            "reference": reference,
        },
        correlation_id,
    )
    return movement


def manual_movement(db, actor, command):
    lock_branch(db)
    item = db.get(InventoryItem, command.item_id)
    if item is None or not item.active:
        raise HTTPException(404, "Active inventory item not found")
    quantity = command.quantity
    if command.quantity_in_packs:
        if not item.pack_name:
            raise HTTPException(422, "This item does not have a pack conversion")
        quantity *= item.units_per_pack
    incoming = command.type in ("RECEIPT", "ADJUSTMENT_IN", "RETURN_IN")
    movement = record_movement(
        db,
        actor,
        command.item_id,
        command.type,
        quantity if incoming else -quantity,
        command.reason,
    )
    return movement_dto(db, movement)


def count_dto(count):
    return dict(
        id=count.id,
        item_id=count.item_id,
        expected_quantity=format(count.expected_quantity, ".3f"),
        counted_quantity=format(count.counted_quantity, ".3f"),
        variance=format(count.variance, ".3f"),
        created_at=count.created_at,
    )


def record_count(db, actor, command):
    lock_branch(db)
    if db.get(InventoryItem, command.item_id) is None:
        raise HTTPException(404, "Inventory item not found")
    expected = expected_on_hand(db, command.item_id)
    count = StockCount(
        item_id=command.item_id,
        expected_quantity=expected,
        counted_quantity=command.counted_quantity,
        variance=command.counted_quantity - expected,
        reason=command.reason,
        actor_id=actor.id,
    )
    db.add(count)
    db.flush()
    record(
        db,
        actor,
        "STOCK_COUNT",
        "stock_count",
        count.id,
        {
            "item_id": count.item_id,
            "variance": str(count.variance),
            "reason": command.reason,
        },
    )
    return count_dto(count)


def counts(db):
    return [
        count_dto(c)
        for c in db.scalars(
            select(StockCount).order_by(StockCount.created_at.desc()).limit(200)
        )
    ]


def create_item(db, actor, command):
    lock_branch(db)
    if db.get(InventoryItem, command.id):
        raise HTTPException(409, "An inventory item already uses this code")
    item = InventoryItem(
        id=command.id,
        name=command.name.strip(),
        unit=command.base_unit.strip(),
        pack_name=command.pack_name.strip() if command.pack_name else None,
        units_per_pack=command.units_per_pack,
        low_stock_threshold=command.low_stock_threshold,
        active=True,
    )
    db.add(item)
    db.flush()
    record(
        db,
        actor,
        "INVENTORY_ITEM_CREATED",
        "inventory_item",
        item.id,
        {"name": item.name, "base_unit": item.unit},
    )
    return item_dto(db, item)


def update_item(db, actor, item_id, command):
    lock_branch(db)
    item = db.get(InventoryItem, item_id)
    if item is None:
        raise HTTPException(404, "Inventory item not found")
    before = item_dto(db, item)
    item.name = command.name.strip()
    item.unit = command.base_unit.strip()
    item.pack_name = command.pack_name.strip() if command.pack_name else None
    item.units_per_pack = command.units_per_pack
    item.low_stock_threshold = command.low_stock_threshold
    db.flush()
    record(
        db,
        actor,
        "INVENTORY_ITEM_UPDATED",
        "inventory_item",
        item.id,
        {"before": before, "after": item_dto(db, item)},
    )
    return item_dto(db, item)


def set_item_active(db, actor, item_id, active):
    lock_branch(db)
    item = db.get(InventoryItem, item_id)
    if item is None:
        raise HTTPException(404, "Inventory item not found")
    item.active = active
    record(
        db,
        actor,
        "INVENTORY_ITEM_AVAILABILITY_CHANGED",
        "inventory_item",
        item.id,
        {"active": active},
    )
    db.flush()
    return item_dto(db, item)


def _required_recipe_items(db):
    variant_items = db.scalars(
        select(RecipeComponent.item_id)
        .join(Variant, Variant.id == RecipeComponent.variant_id)
        .join(Product, Product.id == Variant.product_id)
        .where(
            RecipeComponent.variant_id.is_not(None),
            Variant.active.is_(True),
            Product.active.is_(True),
        )
    ).all()
    modifier_items = db.scalars(
        select(RecipeComponent.item_id)
        .join(Modifier, Modifier.id == RecipeComponent.modifier_id)
        .where(RecipeComponent.modifier_id.is_not(None), Modifier.active.is_(True))
    ).all()
    return set(variant_items) | set(modifier_items)


def activate_inventory(db, actor, command):
    lock_branch(db)
    settings = db.get(StandSettings, 1)
    if settings is None:
        settings = StandSettings(id=1)
        db.add(settings)
        db.flush()
    if settings.inventory_tracking_enabled:
        raise HTTPException(409, "Inventory tracking is already active")
    supplied = {line.item_id: line.quantity for line in command.opening_quantities}
    if len(supplied) != len(command.opening_quantities):
        raise HTTPException(422, "Enter each opening quantity once")
    required = _required_recipe_items(db)
    missing = sorted(required - set(supplied))
    if missing:
        raise HTTPException(
            422,
            "Enter an opening quantity for every item used by an active menu recipe",
        )
    for item_id in supplied:
        item = db.get(InventoryItem, item_id)
        if item is None or not item.active:
            raise HTTPException(422, f"Opening quantity item is unavailable: {item_id}")
    settings.inventory_tracking_started_at = utcnow()
    settings.inventory_tracking_enabled = True
    db.flush()
    for item_id, quantity in supplied.items():
        if quantity > 0:
            record_movement(
                db,
                actor,
                item_id,
                "OPENING_BALANCE",
                quantity,
                "Opening quantity when stock tracking started",
                reference=settings.inventory_tracking_started_at.isoformat(),
            )
    record(
        db,
        actor,
        "INVENTORY_TRACKING_ACTIVATED",
        "stand_settings",
        "1",
        {"opening_item_count": len(supplied)},
    )
    return {
        "inventory_tracking_enabled": True,
        "started_at": settings.inventory_tracking_started_at,
    }
