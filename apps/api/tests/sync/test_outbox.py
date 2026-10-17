import json
from datetime import timedelta

from sqlalchemy import func, select

from app.core.config import Settings
from app.domains.sync.outbox import enqueue
from app.domains.sync.worker import push_batch
from app.models.base import utcnow
from app.models.outbox import ReportingOutbox, SyncState
from tests.orders.test_checkout import command, open_day


def test_checkout_enqueues_redacted_snapshot_in_same_transaction(client, login):
    cashier = login("cashier")
    sale = command(open_day(client, cashier), key="outbox-sale")
    sale["payment"] = {"method": "CARD_MANUAL"}
    response = client.post(
        "/api/orders",
        headers=cashier,
        json=sale,
    )
    assert response.status_code == 201
    with client.app.state.session_factory() as db:
        rows = db.scalars(
            select(ReportingOutbox).order_by(ReportingOutbox.sequence)
        ).all()
        assert rows
        assert rows[-1].event_type == "ORDER_CREATED"
        encoded = json.dumps(rows[-1].payload).lower()
        assert '"provider"' not in encoded
        assert '"reference"' not in encoded
        assert rows[-1].payload["day"]["net_sales_ngwee"] == 4200


def test_outbox_enqueue_rolls_back_with_business_transaction(client):
    with client.app.state.session_factory() as db:
        event = enqueue(db, "test", "rollback", "TEST_EVENT", {"safe": True})
        event_id = event.event_id
        db.rollback()
    with client.app.state.session_factory() as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(ReportingOutbox)
                .where(ReportingOutbox.event_id == event_id)
            )
            == 0
        )


def test_worker_delivers_in_sequence_accepts_duplicates_and_retries(client):
    with client.app.state.session_factory.begin() as db:
        first = enqueue(db, "day", "one", "FIRST", {"value": 1})
        second = enqueue(db, "day", "one", "SECOND", {"value": 2})
        first_id, second_id = first.event_id, second.event_id
    settings = Settings(
        database_url="sqlite:///unused.db",
        supabase_url="https://example.supabase.co",
        supabase_service_role_key="secret-test-key",
    )
    calls = []

    def failing_transport(url, headers, payload):
        calls.append(payload)
        raise OSError("network unavailable")

    result = push_batch(
        client.app.state.session_factory, settings, transport=failing_transport
    )
    assert result["delivered"] == 0
    assert result["error"] == "network unavailable"
    with client.app.state.session_factory() as db:
        first_row = db.scalar(
            select(ReportingOutbox).where(ReportingOutbox.event_id == first_id)
        )
        assert first_row.attempts == 1
        first_row.available_at = utcnow() - timedelta(seconds=1)
        second_row = db.scalar(
            select(ReportingOutbox).where(ReportingOutbox.event_id == second_id)
        )
        second_row.available_at = utcnow() - timedelta(seconds=1)
        db.commit()

    def accepting_transport(url, headers, payload):
        calls.append(payload)
        assert headers["apikey"] == "secret-test-key"
        assert "Authorization" not in headers
        sequences = [event["sequence"] for event in payload["events"]]
        assert sequences == sorted(sequences)
        return {"accepted": [first_id], "duplicates": [second_id]}

    result = push_batch(
        client.app.state.session_factory, settings, transport=accepting_transport
    )
    assert result["delivered"] == 2
    with client.app.state.session_factory() as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(ReportingOutbox)
                .where(ReportingOutbox.delivered_at.is_(None))
            )
            == 0
        )
        state = db.get(SyncState, 1)
        assert state.last_success_at is not None
        assert state.last_error is None


def test_sync_status_keeps_one_store_identity(client, login):
    manager = login("manager")
    first = client.get("/api/sync/status", headers=manager)
    second = client.get("/api/sync/status", headers=manager)
    assert first.status_code == 200
    assert first.json()["configured"] is False
    assert first.json()["store_id"] == second.json()["store_id"]


def test_worker_accepts_current_supabase_secret_key(client):
    settings = Settings(
        database_url="sqlite:///unused.db",
        supabase_url="https://example.supabase.co",
        supabase_secret_key="sb_secret_current-key",
    )
    with client.app.state.session_factory.begin() as db:
        event = enqueue(db, "day", "one", "DAY_UPDATED", {"safe": True})

    def transport(_url, headers, _payload):
        assert headers == {
            "Content-Type": "application/json",
            "apikey": "sb_secret_current-key",
        }
        return {"accepted": [event.event_id], "duplicates": []}

    assert (
        push_batch(client.app.state.session_factory, settings, transport=transport)[
            "delivered"
        ]
        == 1
    )


def test_blank_reporting_credentials_leave_sync_disabled():
    settings = Settings(
        database_url="sqlite:///unused.db",
        supabase_url="https://example.supabase.co",
        supabase_secret_key="",
    )
    assert push_batch(None, settings) == {
        "configured": False,
        "delivered": 0,
        "error": None,
    }
