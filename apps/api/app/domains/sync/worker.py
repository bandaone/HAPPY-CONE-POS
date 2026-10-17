import json
from datetime import timedelta
from urllib.request import Request, urlopen

from sqlalchemy import func, select

from app.models.base import utcnow
from app.models.outbox import ReportingOutbox

from .outbox import sync_state


def _http_transport(url, headers, payload):
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def _credential(settings):
    for candidate in (
        settings.supabase_secret_key,
        settings.supabase_service_role_key,
    ):
        if candidate and candidate.get_secret_value():
            return candidate
    return None


def configured(settings):
    return bool(
        settings.supabase_url
        and settings.supabase_url.strip()
        and _credential(settings)
    )


def push_batch(session_factory, settings, *, transport=None):
    if not configured(settings):
        return {"configured": False, "delivered": 0, "error": None}
    transport = transport or _http_transport
    now = utcnow()
    with session_factory() as db:
        rows = db.scalars(
            select(ReportingOutbox)
            .where(
                ReportingOutbox.delivered_at.is_(None),
                ReportingOutbox.available_at <= now,
            )
            .order_by(ReportingOutbox.sequence)
            .limit(settings.sync_batch_size)
        ).all()
        if not rows:
            return {"configured": True, "delivered": 0, "error": None}
        state = sync_state(db)
        payload = {
            "store_id": state.store_id,
            "events": [
                {
                    "event_id": row.event_id,
                    "sequence": row.sequence,
                    "event_type": row.event_type,
                    "aggregate_type": row.aggregate_type,
                    "aggregate_id": row.aggregate_id,
                    "created_at": row.created_at.isoformat(),
                    "payload": row.payload,
                }
                for row in rows
            ],
        }
        credential = _credential(settings)
        key = credential.get_secret_value()
        headers = {
            "Content-Type": "application/json",
            "apikey": key,
        }
        url = (
            f"{settings.supabase_url.rstrip('/')}/functions/v1/ingest-reporting-events"
        )
        try:
            response = transport(url, headers, payload)
            acknowledged = set(response.get("accepted", [])) | set(
                response.get("duplicates", [])
            )
            missing = [row for row in rows if row.event_id not in acknowledged]
            delivered = [row for row in rows if row.event_id in acknowledged]
            for row in delivered:
                row.delivered_at = now
                row.last_error = None
            for row in missing:
                row.attempts += 1
                row.last_error = "Remote endpoint did not acknowledge the event"
                row.available_at = now + timedelta(
                    seconds=min(3600, 5 * (2 ** min(row.attempts, 9)))
                )
            if delivered:
                state.last_success_at = now
            state.last_error = missing[0].last_error if missing else None
            db.commit()
            return {
                "configured": True,
                "delivered": len(delivered),
                "error": state.last_error,
            }
        except Exception as error:
            message = str(error)[:1000] or error.__class__.__name__
            for row in rows:
                row.attempts += 1
                row.last_error = message
                row.available_at = now + timedelta(
                    seconds=min(3600, 5 * (2 ** min(row.attempts, 9)))
                )
            state.last_error = message
            db.commit()
            return {"configured": True, "delivered": 0, "error": message}


def status(db, settings):
    state = sync_state(db)
    backlog = db.scalar(
        select(func.count())
        .select_from(ReportingOutbox)
        .where(ReportingOutbox.delivered_at.is_(None))
    )
    oldest = db.scalar(
        select(ReportingOutbox.created_at)
        .where(ReportingOutbox.delivered_at.is_(None))
        .order_by(ReportingOutbox.sequence)
        .limit(1)
    )
    return {
        "configured": configured(settings),
        "store_id": state.store_id,
        "backlog": backlog,
        "oldest_pending_at": oldest,
        "last_success_at": state.last_success_at,
        "last_error": state.last_error,
    }
