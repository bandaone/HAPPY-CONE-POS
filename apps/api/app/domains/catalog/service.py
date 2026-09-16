from decimal import Decimal
from collections import Counter
from sqlalchemy import select
from fastapi import HTTPException
from app.models.catalog import Product, Category, Variant, Modifier, ModifierGroup, RecipeComponent
from app.domains.audit.service import record
from app.core.db import lock_branch


def recipe(db, *, variant_id=None, modifier_id=None):
    query = select(RecipeComponent)
    query = query.where(RecipeComponent.variant_id == variant_id) if variant_id else query.where(RecipeComponent.modifier_id == modifier_id)
    return [{'item_id': row.item_id, 'quantity': format(row.quantity, '.3f')} for row in db.scalars(query)]


def catalog(db, include_inactive=False):
    products = []
    query = select(Product, Category.name).join(Category).order_by(Product.name)
    if not include_inactive:
        query = query.where(Product.active.is_(True))
    for p, category in db.execute(query):
        variants = [dict(id=v.id, name=v.name, price_ngwee=v.price_ngwee, recipe=recipe(db, variant_id=v.id))
                    for v in db.scalars(select(Variant).where(Variant.product_id == p.id, Variant.active.is_(True)).order_by(Variant.price_ngwee))]
        products.append(dict(id=p.id, name=p.name, category=category, description=p.description, color=p.color, active=p.active, variants=variants))
    modifiers = [dict(id=m.id, name=m.name, group=m.group_id, price_ngwee=m.price_ngwee, active=m.active,
                      recipe=recipe(db, modifier_id=m.id)) for m in db.scalars(select(Modifier).where(Modifier.active.is_(True)).order_by(Modifier.group_id, Modifier.name))]
    return dict(products=products, modifiers=modifiers)


def set_availability(db, actor, product_id, active):
    lock_branch(db)
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, 'Product not found')
    old = product.active
    product.active = active
    record(db, actor, 'PRODUCT_AVAILABILITY', 'product', product_id, {'before': old, 'after': active})
    return {'id': product_id, 'active': active}


def price_lines(db, lines):
    result, consumption = [], Counter()
    groups = db.scalars(select(ModifierGroup)).all()
    for line in lines:
        variant = db.get(Variant, line.variant_id)
        product = db.get(Product, variant.product_id) if variant else None
        if not variant or not variant.active or not product or not product.active:
            raise HTTPException(409, 'Selected product or variant is unavailable')
        if len(set(line.modifier_ids)) != len(line.modifier_ids):
            raise HTTPException(422, 'Duplicate modifiers are not allowed')
        modifiers = [db.get(Modifier, key) for key in line.modifier_ids]
        if any(m is None or not m.active for m in modifiers):
            raise HTTPException(409, 'Selected modifier is unavailable')
        counts = Counter(m.group_id for m in modifiers)
        if any(not g.minimum <= counts[g.id] <= g.maximum for g in groups):
            raise HTTPException(422, 'Select exactly one serving option and at most three toppings')
        unit_price = variant.price_ngwee + sum(m.price_ngwee for m in modifiers)
        result.append(dict(variant_id=variant.id, name=f'{product.name} · {variant.name}', quantity=line.quantity,
                           unit_price_ngwee=unit_price, total_ngwee=unit_price * line.quantity,
                           modifier_names=[m.name for m in modifiers], notes=line.notes))
        ingredients = recipe(db, variant_id=variant.id)
        for modifier in modifiers:
            ingredients += recipe(db, modifier_id=modifier.id)
        for component in ingredients:
            consumption[component['item_id']] += Decimal(component['quantity']) * line.quantity
    return dict(lines=result, total_ngwee=sum(line['total_ngwee'] for line in result)), consumption
