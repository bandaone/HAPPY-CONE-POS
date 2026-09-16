from decimal import Decimal
from sqlalchemy import select, func
from fastapi import HTTPException
from app.models.inventory import InventoryItem, StockMovement, StockCount
from app.core.db import lock_branch
from app.domains.audit.service import record


def expected_on_hand(db, item_id):
    return db.scalar(select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(StockMovement.item_id == item_id)) or Decimal(0)


def inventory(db):
    return [dict(id=i.id,name=i.name,unit=i.unit,on_hand=format(expected_on_hand(db,i.id),'.3f'),
                 low_stock_threshold=format(i.low_stock_threshold,'.3f'))
            for i in db.scalars(select(InventoryItem).order_by(InventoryItem.name))]


def movement_dto(db, movement):
    item = db.get(InventoryItem, movement.item_id)
    return dict(id=movement.id,item_id=item.id,item_name=item.name,type=movement.type,
                quantity=format(movement.quantity,'.3f'),unit=item.unit,reference=movement.reference,
                reason=movement.reason,actor_id=movement.actor_id,created_at=movement.created_at)


def movements(db, item_id=None):
    query = select(StockMovement).order_by(StockMovement.created_at.desc()).limit(500)
    if item_id:
        query = query.where(StockMovement.item_id == item_id)
    return [movement_dto(db,m) for m in db.scalars(query)]


def record_movement(db, actor, item_id, movement_type, quantity, reason, reference=None, correlation_id=None):
    if db.get(InventoryItem,item_id) is None:
        raise HTTPException(404, 'Inventory item not found')
    if quantity < 0 and expected_on_hand(db,item_id) + quantity < 0:
        raise HTTPException(409, 'Insufficient stock; review inventory before retrying')
    movement = StockMovement(item_id=item_id,type=movement_type,quantity=quantity,reason=reason,
                             reference=reference,actor_id=actor.id if actor else None)
    db.add(movement)
    db.flush()
    record(db,actor,f'STOCK_{movement_type}','stock_movement',movement.id,
           {'item_id': item_id,'quantity':str(quantity),'reason':reason,'reference':reference}, correlation_id)
    return movement


def manual_movement(db, actor, command):
    lock_branch(db)
    incoming = command.type in ('RECEIPT','ADJUSTMENT_IN','RETURN_IN')
    movement = record_movement(db,actor,command.item_id,command.type,
                               command.quantity if incoming else -command.quantity,command.reason)
    return movement_dto(db,movement)


def count_dto(count):
    return dict(id=count.id,item_id=count.item_id,expected_quantity=format(count.expected_quantity,'.3f'),
                counted_quantity=format(count.counted_quantity,'.3f'),variance=format(count.variance,'.3f'),created_at=count.created_at)


def record_count(db, actor, command):
    lock_branch(db)
    if db.get(InventoryItem, command.item_id) is None:
        raise HTTPException(404, 'Inventory item not found')
    expected = expected_on_hand(db,command.item_id)
    count = StockCount(item_id=command.item_id,expected_quantity=expected,counted_quantity=command.counted_quantity,
                        variance=command.counted_quantity-expected,reason=command.reason,actor_id=actor.id)
    db.add(count)
    db.flush()
    record(db,actor,'STOCK_COUNT','stock_count',count.id,{'item_id':count.item_id,'variance':str(count.variance),'reason':command.reason})
    return count_dto(count)


def counts(db):
    return [count_dto(c) for c in db.scalars(select(StockCount).order_by(StockCount.created_at.desc()).limit(200))]
