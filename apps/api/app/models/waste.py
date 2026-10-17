from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import UTCDateTime

from .base import Base, new_id, utcnow


class WasteRecord(Base):
    __tablename__ = "waste_records"
    __table_args__ = (
        CheckConstraint("kind IN ('PREPARED','INGREDIENT')"),
        CheckConstraint("quantity > 0"),
        CheckConstraint("value_ngwee >= 0"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    business_day_id: Mapped[str] = mapped_column(
        ForeignKey("business_days.id"), index=True
    )
    kind: Mapped[str] = mapped_column(String(20))
    label: Mapped[str] = mapped_column(String(180))
    variant_id: Mapped[str | None] = mapped_column(ForeignKey("variants.id"))
    modifier_ids: Mapped[list] = mapped_column(JSON, default=list)
    item_id: Mapped[str | None] = mapped_column(ForeignKey("inventory_items.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(16, 3))
    reason: Mapped[str] = mapped_column(String(30))
    comment: Mapped[str] = mapped_column(String(300), default="")
    value_ngwee: Mapped[int]
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
