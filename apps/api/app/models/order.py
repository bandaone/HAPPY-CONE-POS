from app.core.time import UTCDateTime
from datetime import datetime
from sqlalchemy import String, ForeignKey, CheckConstraint, UniqueConstraint, JSON
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, new_id, utcnow


class Order(Base):
    __tablename__ = 'orders'
    __table_args__ = (CheckConstraint("status IN ('NEW','PREPARING','READY','SERVED')"),CheckConstraint('total_ngwee >= 0'),
                      UniqueConstraint('business_day_id','number'))
    id: Mapped[str] = mapped_column(String(36),primary_key=True,default=new_id)
    number: Mapped[str] = mapped_column(String(20))
    business_day_id: Mapped[str] = mapped_column(ForeignKey('business_days.id'),index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    status: Mapped[str] = mapped_column(String(20),default='NEW')
    total_ngwee: Mapped[int]
    idempotency_key: Mapped[str] = mapped_column(String(128),unique=True)
    payload_hash: Mapped[str] = mapped_column(String(64))
    offline: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(),default=utcnow)


class OrderLine(Base):
    __tablename__ = 'order_lines'
    __table_args__ = (CheckConstraint('quantity > 0'),CheckConstraint('unit_price_ngwee >= 0'),
                      CheckConstraint('total_ngwee = quantity * unit_price_ngwee'))
    id: Mapped[str] = mapped_column(String(36),primary_key=True,default=new_id)
    order_id: Mapped[str] = mapped_column(ForeignKey('orders.id'),index=True)
    position: Mapped[int]
    variant_id: Mapped[str] = mapped_column(ForeignKey('variants.id'))
    name: Mapped[str] = mapped_column(String(220))
    quantity: Mapped[int]
    unit_price_ngwee: Mapped[int]
    total_ngwee: Mapped[int]
    modifier_names: Mapped[list] = mapped_column(JSON)
    notes: Mapped[str] = mapped_column(String(300),default='')
