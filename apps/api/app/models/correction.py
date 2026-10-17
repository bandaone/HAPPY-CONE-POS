from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import UTCDateTime

from .base import Base, new_id, utcnow


class SaleCorrection(Base):
    __tablename__ = 'sale_corrections'
    __table_args__ = (CheckConstraint("status IN ('PENDING','COMPLETED','LOCKED')"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    original_order_id: Mapped[str] = mapped_column(ForeignKey('orders.id'), unique=True, index=True)
    replacement_order_id: Mapped[str | None] = mapped_column(ForeignKey('orders.id'), unique=True, index=True)
    business_day_id: Mapped[str] = mapped_column(ForeignKey('business_days.id'), index=True)
    reason: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), default='PENDING')
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
