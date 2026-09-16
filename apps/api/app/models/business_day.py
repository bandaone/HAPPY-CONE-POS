from app.core.time import UTCDateTime
from datetime import datetime
from sqlalchemy import String, ForeignKey, JSON, CheckConstraint, Index, text
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, new_id, utcnow


class BusinessDay(Base):
    __tablename__ = 'business_days'
    __table_args__ = (CheckConstraint("status IN ('OPEN','CLOSED')"), CheckConstraint('opening_float_ngwee >= 0'),
        Index('one_open_business_day', 'status', unique=True, sqlite_where=text("status = 'OPEN'"), postgresql_where=text("status = 'OPEN'")))
    id: Mapped[str] = mapped_column(String(36),primary_key=True,default=new_id)
    status: Mapped[str] = mapped_column(String(10),default='OPEN')
    opened_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    opened_at: Mapped[datetime] = mapped_column(UTCDateTime(),default=utcnow)
    closed_by: Mapped[str | None] = mapped_column(ForeignKey('users.id'))
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    opening_float_ngwee: Mapped[int]
    actual_cash_ngwee: Mapped[int | None]
    close_snapshot: Mapped[dict | None] = mapped_column(JSON)
    next_order_number: Mapped[int] = mapped_column(default=1)


class CashMovement(Base):
    __tablename__ = 'cash_movements'
    __table_args__ = (CheckConstraint('amount_ngwee != 0'),)
    id: Mapped[str] = mapped_column(String(36),primary_key=True,default=new_id)
    business_day_id: Mapped[str] = mapped_column(ForeignKey('business_days.id'),index=True)
    amount_ngwee: Mapped[int]
    reason: Mapped[str] = mapped_column(String(300))
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(),default=utcnow)
