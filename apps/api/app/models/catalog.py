from decimal import Decimal
from sqlalchemy import String, ForeignKey, Numeric, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, new_id


class Category(Base):
    __tablename__ = 'categories'
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))


class Product(Base):
    __tablename__ = 'products'
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    category_id: Mapped[str] = mapped_column(ForeignKey('categories.id'))
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(300), default='')
    color: Mapped[str] = mapped_column(String(20), default='#F5E7BC')
    active: Mapped[bool] = mapped_column(default=True)


class Variant(Base):
    __tablename__ = 'variants'
    __table_args__ = (CheckConstraint('price_ngwee >= 0'),)
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    product_id: Mapped[str] = mapped_column(ForeignKey('products.id'))
    name: Mapped[str] = mapped_column(String(100))
    price_ngwee: Mapped[int]
    active: Mapped[bool] = mapped_column(default=True)


class ModifierGroup(Base):
    __tablename__ = 'modifier_groups'
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    minimum: Mapped[int] = mapped_column(default=0)
    maximum: Mapped[int] = mapped_column(default=3)


class Modifier(Base):
    __tablename__ = 'modifiers'
    __table_args__ = (CheckConstraint('price_ngwee >= 0'),)
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    group_id: Mapped[str] = mapped_column(ForeignKey('modifier_groups.id'))
    name: Mapped[str] = mapped_column(String(100))
    price_ngwee: Mapped[int]
    active: Mapped[bool] = mapped_column(default=True)


class RecipeComponent(Base):
    __tablename__ = 'recipe_components'
    __table_args__ = (CheckConstraint('quantity > 0'),
                      CheckConstraint('(variant_id IS NULL) != (modifier_id IS NULL)'))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    variant_id: Mapped[str | None] = mapped_column(ForeignKey('variants.id'))
    modifier_id: Mapped[str | None] = mapped_column(ForeignKey('modifiers.id'))
    item_id: Mapped[str] = mapped_column(ForeignKey('inventory_items.id'))
    quantity: Mapped[Decimal] = mapped_column(Numeric(16, 3))
