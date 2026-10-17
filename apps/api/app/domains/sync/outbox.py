from sqlalchemy import select

from app.domains.reporting.service import daily_summary
from app.models.audit import AuditEvent
from app.models.business_day import BusinessDay
from app.models.outbox import ReportingOutbox, SyncState
from app.models.stand_settings import StandSettings

REPORTING_ACTIONS = {
    "DAY_OPENED",
    "DAY_CLOSED",
    "CASH_MOVEMENT",
    "ORDER_CREATED",
    "ORDER_REFUNDED",
    "ORDER_CORRECTION_STARTED",
    "ORDER_CORRECTION_COMPLETED",
    "WASTE_RECORDED",
    "INVENTORY_TRACKING_ACTIVATED",
    "STAND_SETTINGS_UPDATED",
}
REPORTING_PREFIXES = (
    "STOCK_",
    "INVENTORY_ITEM_",
    "MENU_ITEM_",
    "PRODUCT_",
    "VARIANT_",
    "MODIFIER_",
    "CATEGORY_",
)


def sync_state(db):
    state = db.get(SyncState, 1)
    if state is None:
        state = SyncState(id=1)
        db.add(state)
        db.flush()
    return state


def enqueue(db, aggregate_type, aggregate_id, event_type, payload):
    state = sync_state(db)
    event = ReportingOutbox(
        store_id=state.store_id,
        aggregate_type=aggregate_type,
        aggregate_id=str(aggregate_id),
        event_type=event_type,
        payload=payload,
    )
    db.add(event)
    db.flush()
    return event


def _relevant(action):
    return action in REPORTING_ACTIONS or action.startswith(REPORTING_PREFIXES)


def _snapshot(db, audit):
    day = db.scalar(select(BusinessDay).order_by(BusinessDay.opened_at.desc()).limit(1))
    settings = db.get(StandSettings, 1)
    from app.domains.inventory.service import inventory

    return {
        "schema_version": 1,
        "event": {
            "type": audit.action,
            "aggregate_type": audit.entity,
            "aggregate_id": audit.entity_id,
            "actor_id": audit.actor_id,
            "created_at": audit.created_at.isoformat(),
        },
        "store": {
            "business_name": settings.business_name if settings else "Happy Cone",
            "stand_name": settings.stand_name if settings else "Store",
            "location": settings.location if settings else "",
            "currency_code": settings.currency_code if settings else "ZMW",
            "currency_symbol": settings.currency_symbol if settings else "K",
            "timezone": settings.timezone if settings else "Africa/Lusaka",
        },
        "day": daily_summary(db, day) if day else None,
        "inventory": inventory(db),
    }


def enqueue_transaction(db):
    audits = [
        item
        for item in db.info.pop("outbox_audits", [])
        if isinstance(item, AuditEvent) and _relevant(item.action)
    ]
    if not audits:
        return []
    db.flush()
    return [
        enqueue(
            db,
            audit.entity,
            audit.entity_id,
            audit.action,
            _snapshot(db, audit),
        )
        for audit in audits
    ]
