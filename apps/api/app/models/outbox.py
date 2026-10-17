from datetime import datetime

from sqlalchemy import JSON, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import UTCDateTime

from .base import Base, new_id, utcnow


class SyncState(Base):
    __tablename__ = "sync_state"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    store_id: Mapped[str] = mapped_column(String(36), unique=True, default=new_id)
    last_success_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    last_error: Mapped[str | None] = mapped_column(Text())
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, onupdate=utcnow
    )


class ReportingOutbox(Base):
    __tablename__ = "reporting_outbox"
    __table_args__ = (
        Index(
            "ix_reporting_outbox_pending", "delivered_at", "available_at", "sequence"
        ),
    )

    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(36), unique=True, default=new_id)
    store_id: Mapped[str] = mapped_column(String(36), index=True)
    aggregate_type: Mapped[str] = mapped_column(String(40))
    aggregate_id: Mapped[str] = mapped_column(String(80))
    event_type: Mapped[str] = mapped_column(String(60))
    payload: Mapped[dict] = mapped_column(JSON)
    attempts: Mapped[int] = mapped_column(default=0)
    available_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    delivered_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    last_error: Mapped[str | None] = mapped_column(Text())
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
