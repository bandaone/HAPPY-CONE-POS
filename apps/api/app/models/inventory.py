from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.time import UTCDateTime

from .base import Base, new_id, utcnow


class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (CheckConstraint("units_per_pack > 0"),)
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    unit: Mapped[str] = mapped_column(String(20))
    pack_name: Mapped[str | None] = mapped_column(String(40))
    units_per_pack: Mapped[Decimal] = mapped_column(Numeric(16, 3), default=1)
    active: Mapped[bool] = mapped_column(default=True)
    low_stock_threshold: Mapped[Decimal] = mapped_column(Numeric(16, 3), default=0)


class StockMovement(Base):
    __tablename__ = "stock_movements"
    __table_args__ = (CheckConstraint("quantity != 0"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    item_id: Mapped[str] = mapped_column(ForeignKey("inventory_items.id"), index=True)
    type: Mapped[str] = mapped_column(String(30))
    quantity: Mapped[Decimal] = mapped_column(Numeric(16, 3))
    reference: Mapped[str | None] = mapped_column(String(80), index=True)
    reason: Mapped[str] = mapped_column(String(300))
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class StockCount(Base):
    __tablename__ = "stock_counts"
    __table_args__ = (CheckConstraint("counted_quantity >= 0"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    item_id: Mapped[str] = mapped_column(ForeignKey("inventory_items.id"))
    expected_quantity: Mapped[Decimal] = mapped_column(Numeric(16, 3))
    counted_quantity: Mapped[Decimal] = mapped_column(Numeric(16, 3))
    variance: Mapped[Decimal] = mapped_column(Numeric(16, 3))
    reason: Mapped[str] = mapped_column(String(300))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
