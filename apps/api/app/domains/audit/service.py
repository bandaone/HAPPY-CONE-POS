from sqlalchemy import select
from app.models.audit import AuditEvent
from app.models.user import User


def record(db, actor, action, entity, entity_id, metadata=None, correlation_id=None):
    event = AuditEvent(actor_id=actor.id if actor else None, action=action, entity=entity,
                       entity_id=str(entity_id), details=metadata or {})
    if correlation_id:
        event.correlation_id = correlation_id
    db.add(event)
    return event


def history(db):
    rows = db.execute(select(AuditEvent, User.name).outerjoin(User, User.id == AuditEvent.actor_id)
                      .order_by(AuditEvent.created_at.desc()).limit(200))
    return [dict(id=e.id, actor_id=e.actor_id, actor_name=name or 'System', action=e.action,
                 entity=e.entity, entity_id=e.entity_id, metadata=e.details,
                 correlation_id=e.correlation_id, created_at=e.created_at) for e, name in rows]
