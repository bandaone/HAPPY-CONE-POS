from app.core.time import UTCDateTime
from datetime import datetime
from sqlalchemy import String, ForeignKey, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, new_id, utcnow


class Payment(Base):
    __tablename__ = 'payments'
    __table_args__ = (CheckConstraint("method IN ('CASH','MOBILE_MONEY_MANUAL','CARD_MANUAL')"),
                      CheckConstraint("status IN ('PENDING','CONFIRMED','FAILED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED')"),
                      CheckConstraint('amount_ngwee >= 0'),CheckConstraint('change_ngwee >= 0'),
                      UniqueConstraint('method','provider','reference',name='unique_external_payment_reference'))
    id: Mapped[str] = mapped_column(String(36),primary_key=True,default=new_id)
    order_id: Mapped[str] = mapped_column(ForeignKey('orders.id'),unique=True)
    method: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30),default='CONFIRMED')
    amount_ngwee: Mapped[int]
    tendered_ngwee: Mapped[int | None]
    change_ngwee: Mapped[int] = mapped_column(default=0)
    provider: Mapped[str | None] = mapped_column(String(100))
    reference: Mapped[str | None] = mapped_column(String(120))
    confirmed_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(),default=utcnow)


class Refund(Base):
    __tablename__ = 'refunds'
    __table_args__ = (CheckConstraint('amount_ngwee >= 0'),)
    id: Mapped[str] = mapped_column(String(36),primary_key=True,default=new_id)
    order_id: Mapped[str] = mapped_column(ForeignKey('orders.id'),unique=True)
    payment_id: Mapped[str] = mapped_column(ForeignKey('payments.id'))
    business_day_id: Mapped[str] = mapped_column(ForeignKey('business_days.id'),index=True)
    amount_ngwee: Mapped[int]
    reason: Mapped[str] = mapped_column(String(300))
    approved_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(),default=utcnow)
