from collections import Counter
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import delete, select

from app.core.db import lock_branch
from app.domains.audit.service import record
from app.domains.settings.service import get_settings
from app.models.catalog import (
    Category,
    Modifier,
    ModifierGroup,
    Product,
    ProductModifierGroup,
    RecipeComponent,
    Variant,
)
from app.models.inventory import InventoryItem
from app.models.order import OrderLine


def recipe(db, *, variant_id=None, modifier_id=None):
    query = select(RecipeComponent)
    query = query.where(RecipeComponent.variant_id == variant_id) if variant_id else query.where(RecipeComponent.modifier_id == modifier_id)
    return [{'item_id': row.item_id, 'quantity': format(row.quantity, '.3f')} for row in db.scalars(query)]


def category_dto(category):
    return {'id': category.id, 'name': category.name}


def variant_dto(db, variant):
    return dict(id=variant.id, product_id=variant.product_id, name=variant.name,
                price_ngwee=variant.price_ngwee, active=variant.active,
                recipe=recipe(db, variant_id=variant.id))


def modifier_dto(db, modifier):
    return dict(id=modifier.id, group_id=modifier.group_id, group=modifier.group_id,
                name=modifier.name, price_ngwee=modifier.price_ngwee, active=modifier.active,
                recipe=recipe(db, modifier_id=modifier.id))


def modifier_group_dto(group):
    return dict(id=group.id, name=group.name, minimum=group.minimum, maximum=group.maximum)


def product_choice_sets(db, product_id):
    query = (select(ProductModifierGroup)
             .where(ProductModifierGroup.product_id == product_id)
             .order_by(ProductModifierGroup.position, ProductModifierGroup.group_id))
    result = []
    for row in db.scalars(query):
        group = db.get(ModifierGroup, row.group_id)
        result.append(dict(group_id=row.group_id, name=group.name, minimum=row.minimum,
                           maximum=row.maximum, position=row.position))
    return result


def product_dto(db, product, *, include_inactive=False):
    category = db.get(Category, product.category_id)
    query = select(Variant).where(Variant.product_id == product.id)
    if not include_inactive:
        query = query.where(Variant.active.is_(True))
    variants = [variant_dto(db, row) for row in db.scalars(query.order_by(Variant.price_ngwee, Variant.name))]
    return dict(id=product.id, category_id=product.category_id, name=product.name,
                category=category.name, description=product.description, color=product.color,
                active=product.active, variants=variants,
                choice_sets=product_choice_sets(db, product.id))


def catalog(db, include_inactive=False):
    product_query = select(Product).order_by(Product.name)
    if not include_inactive:
        product_query = product_query.where(Product.active.is_(True))
    modifier_query = select(Modifier).order_by(Modifier.group_id, Modifier.name)
    if not include_inactive:
        modifier_query = modifier_query.where(Modifier.active.is_(True))
    products = [product_dto(db, row, include_inactive=include_inactive)
                for row in db.scalars(product_query)]
    if not include_inactive:
        products = [product for product in products if product['variants']]
    return {
        'categories': [category_dto(row) for row in db.scalars(select(Category).order_by(Category.name))],
        'products': products,
        'modifier_groups': [modifier_group_dto(row) for row in db.scalars(
            select(ModifierGroup).order_by(ModifierGroup.name))],
        'modifiers': [modifier_dto(db, row) for row in db.scalars(modifier_query)],
    }


def _existing_or_conflict(db, model, item_id, label):
    if db.get(model, item_id) is not None:
        raise HTTPException(409, f'{label} code is already in use')


def _required(db, model, item_id, label, status=404):
    value = db.get(model, item_id)
    if value is None:
        raise HTTPException(status, f'{label} not found')
    return value


def _validate_inventory(db, command):
    if command.active and not command.recipe and get_settings(db).inventory_tracking_enabled:
        raise HTTPException(422, 'Available items require at least one stock recipe ingredient')
    missing = [row.item_id for row in command.recipe if db.get(InventoryItem, row.item_id) is None]
    if missing:
        raise HTTPException(422, f"Inventory item not found: {missing[0]}")


def _replace_recipe(db, command, *, variant_id=None, modifier_id=None):
    _validate_inventory(db, command)
    target = RecipeComponent.variant_id == variant_id if variant_id else RecipeComponent.modifier_id == modifier_id
    db.execute(delete(RecipeComponent).where(target))
    db.add_all([
        RecipeComponent(variant_id=variant_id, modifier_id=modifier_id,
                        item_id=row.item_id, quantity=row.quantity)
        for row in command.recipe
    ])


def create_category(db, actor, command):
    lock_branch(db)
    _existing_or_conflict(db, Category, command.id, 'Category')
    category = Category(id=command.id, name=command.name)
    db.add(category)
    record(db, actor, 'CATEGORY_CREATED', 'category', category.id, {'after': category_dto(category)})
    return category_dto(category)


def update_category(db, actor, category_id, command):
    lock_branch(db)
    category = _required(db, Category, category_id, 'Category')
    before = category_dto(category)
    category.name = command.name
    after = category_dto(category)
    record(db, actor, 'CATEGORY_UPDATED', 'category', category.id, {'before': before, 'after': after})
    return after


def _product_values(command):
    return {key: getattr(command, key) for key in ('category_id', 'name', 'description', 'color', 'active')}


def create_product(db, actor, command):
    lock_branch(db)
    _existing_or_conflict(db, Product, command.id, 'Product')
    _required(db, Category, command.category_id, 'Category', 422)
    product = Product(id=command.id, **_product_values(command))
    db.add(product)
    db.flush()
    after = product_dto(db, product, include_inactive=True)
    record(db, actor, 'PRODUCT_CREATED', 'product', product.id, {'after': after})
    return after


def _validate_choice_sets(db, choices):
    for choice in choices:
        _required(db, ModifierGroup, choice.group_id, 'Choice set', 422)


def _replace_choice_sets(db, product_id, choices):
    db.execute(delete(ProductModifierGroup).where(ProductModifierGroup.product_id == product_id))
    db.add_all([
        ProductModifierGroup(product_id=product_id, group_id=choice.group_id,
                             minimum=choice.minimum, maximum=choice.maximum,
                             position=choice.position)
        for choice in choices
    ])


def create_menu_item(db, actor, command):
    lock_branch(db)
    _existing_or_conflict(db, Product, command.id, 'Menu item')
    _required(db, Category, command.category_id, 'Category', 422)
    _validate_choice_sets(db, command.choice_sets)
    for price in command.prices:
        _existing_or_conflict(db, Variant, price.id, 'Price')
        _validate_inventory(db, price)
    product = Product(id=command.id, **_product_values(command))
    db.add(product)
    db.flush()
    for price in command.prices:
        variant = Variant(id=price.id, product_id=product.id, **_catalog_item_values(price))
        db.add(variant)
        db.flush()
        _replace_recipe(db, price, variant_id=variant.id)
    _replace_choice_sets(db, product.id, command.choice_sets)
    db.flush()
    after = product_dto(db, product, include_inactive=True)
    record(db, actor, 'MENU_ITEM_CREATED', 'product', product.id, {'after': after})
    return after


def update_menu_item(db, actor, product_id, command):
    lock_branch(db)
    product = _required(db, Product, product_id, 'Menu item')
    _required(db, Category, command.category_id, 'Category', 422)
    _validate_choice_sets(db, command.choice_sets)
    for price in command.prices:
        existing = db.get(Variant, price.id)
        if existing is not None and existing.product_id != product_id:
            raise HTTPException(409, 'Price code is already in use')
        _validate_inventory(db, price)
    before = product_dto(db, product, include_inactive=True)
    for key, value in _product_values(command).items():
        setattr(product, key, value)
    submitted_ids = {price.id for price in command.prices}
    existing_prices = db.scalars(select(Variant).where(Variant.product_id == product_id)).all()
    for variant in existing_prices:
        if variant.id not in submitted_ids:
            variant.active = False
    for price in command.prices:
        variant = db.get(Variant, price.id)
        if variant is None:
            variant = Variant(id=price.id, product_id=product_id, **_catalog_item_values(price))
            db.add(variant)
            db.flush()
        else:
            for key, value in _catalog_item_values(price).items():
                setattr(variant, key, value)
        _replace_recipe(db, price, variant_id=variant.id)
    _replace_choice_sets(db, product_id, command.choice_sets)
    db.flush()
    after = product_dto(db, product, include_inactive=True)
    record(db, actor, 'MENU_ITEM_UPDATED', 'product', product.id,
           {'before': before, 'after': after})
    return after


def update_product(db, actor, product_id, command):
    lock_branch(db)
    product = _required(db, Product, product_id, 'Product')
    _required(db, Category, command.category_id, 'Category', 422)
    before = product_dto(db, product, include_inactive=True)
    for key, value in _product_values(command).items():
        setattr(product, key, value)
    after = product_dto(db, product, include_inactive=True)
    record(db, actor, 'PRODUCT_UPDATED', 'product', product.id, {'before': before, 'after': after})
    return after


def set_availability(db, actor, product_id, active):
    lock_branch(db)
    product = _required(db, Product, product_id, 'Product')
    old = product.active
    product.active = active
    record(db, actor, 'PRODUCT_AVAILABILITY', 'product', product_id, {'before': old, 'after': active})
    return {'id': product_id, 'active': active}


def _catalog_item_values(command):
    return {key: getattr(command, key) for key in ('name', 'price_ngwee', 'active')}


def create_variant(db, actor, product_id, command):
    lock_branch(db)
    _required(db, Product, product_id, 'Product', 422)
    _existing_or_conflict(db, Variant, command.id, 'Variation')
    _validate_inventory(db, command)
    variant = Variant(id=command.id, product_id=product_id, **_catalog_item_values(command))
    db.add(variant)
    db.flush()
    _replace_recipe(db, command, variant_id=variant.id)
    after = variant_dto(db, variant)
    record(db, actor, 'VARIANT_CREATED', 'variant', variant.id, {'after': after})
    return after


def update_variant(db, actor, variant_id, command):
    lock_branch(db)
    variant = _required(db, Variant, variant_id, 'Variation')
    _validate_inventory(db, command)
    before = variant_dto(db, variant)
    for key, value in _catalog_item_values(command).items():
        setattr(variant, key, value)
    _replace_recipe(db, command, variant_id=variant.id)
    db.flush()
    after = variant_dto(db, variant)
    record(db, actor, 'VARIANT_UPDATED', 'variant', variant.id, {'before': before, 'after': after})
    return after


def delete_variant(db, actor, variant_id):
    lock_branch(db)
    variant = _required(db, Variant, variant_id, 'Variation')
    if variant.active:
        raise HTTPException(409, 'Archive this variation before deleting it')
    if db.scalar(select(OrderLine.id).where(OrderLine.variant_id == variant_id).limit(1)):
        raise HTTPException(409, 'This variation appears in sales history and cannot be deleted. Keep it archived.')
    before = variant_dto(db, variant)
    db.execute(delete(RecipeComponent).where(RecipeComponent.variant_id == variant_id))
    db.delete(variant)
    record(db, actor, 'VARIANT_DELETED', 'variant', variant_id, {'before': before})
    return {'id': variant_id, 'deleted': True}


def create_modifier_group(db, actor, command):
    lock_branch(db)
    _existing_or_conflict(db, ModifierGroup, command.id, 'Modifier group')
    group = ModifierGroup(id=command.id, name=command.name, minimum=command.minimum, maximum=command.maximum)
    db.add(group)
    after = modifier_group_dto(group)
    record(db, actor, 'MODIFIER_GROUP_CREATED', 'modifier_group', group.id, {'after': after})
    return after


def update_modifier_group(db, actor, group_id, command):
    lock_branch(db)
    group = _required(db, ModifierGroup, group_id, 'Modifier group')
    before = modifier_group_dto(group)
    group.name, group.minimum, group.maximum = command.name, command.minimum, command.maximum
    after = modifier_group_dto(group)
    record(db, actor, 'MODIFIER_GROUP_UPDATED', 'modifier_group', group.id,
           {'before': before, 'after': after})
    return after


def create_modifier(db, actor, group_id, command):
    lock_branch(db)
    _required(db, ModifierGroup, group_id, 'Modifier group', 422)
    _existing_or_conflict(db, Modifier, command.id, 'Modifier')
    _validate_inventory(db, command)
    modifier = Modifier(id=command.id, group_id=group_id, **_catalog_item_values(command))
    db.add(modifier)
    db.flush()
    _replace_recipe(db, command, modifier_id=modifier.id)
    after = modifier_dto(db, modifier)
    record(db, actor, 'MODIFIER_CREATED', 'modifier', modifier.id, {'after': after})
    return after


def update_modifier(db, actor, modifier_id, command):
    lock_branch(db)
    modifier = _required(db, Modifier, modifier_id, 'Modifier')
    _validate_inventory(db, command)
    before = modifier_dto(db, modifier)
    for key, value in _catalog_item_values(command).items():
        setattr(modifier, key, value)
    _replace_recipe(db, command, modifier_id=modifier.id)
    db.flush()
    after = modifier_dto(db, modifier)
    record(db, actor, 'MODIFIER_UPDATED', 'modifier', modifier.id, {'before': before, 'after': after})
    return after


def delete_modifier(db, actor, modifier_id):
    lock_branch(db)
    modifier = _required(db, Modifier, modifier_id, 'Extra')
    if modifier.active:
        raise HTTPException(409, 'Archive this extra before deleting it')
    before = modifier_dto(db, modifier)
    db.execute(delete(RecipeComponent).where(RecipeComponent.modifier_id == modifier_id))
    db.delete(modifier)
    record(db, actor, 'MODIFIER_DELETED', 'modifier', modifier_id, {'before': before})
    return {'id': modifier_id, 'deleted': True}


def price_lines(db, lines):
    result, consumption = [], Counter()
    for line in lines:
        variant = db.get(Variant, line.variant_id)
        product = db.get(Product, variant.product_id) if variant else None
        if not variant or not variant.active or not product or not product.active:
            raise HTTPException(409, 'Selected product or variant is unavailable')
        modifiers = [db.get(Modifier, key) for key in line.modifier_ids]
        if any(m is None or not m.active for m in modifiers):
            raise HTTPException(409, 'Selected modifier is unavailable')
        assignments = db.scalars(select(ProductModifierGroup).where(
            ProductModifierGroup.product_id == product.id)).all()
        allowed = {assignment.group_id: assignment for assignment in assignments}
        if any(modifier.group_id not in allowed for modifier in modifiers):
            raise HTTPException(422, 'This choice is not available for the selected item')
        counts = Counter(m.group_id for m in modifiers)
        if any(not assignment.minimum <= counts[assignment.group_id] <= assignment.maximum
               for assignment in assignments):
            raise HTTPException(422, 'Select the required choices for this item')
        unit_price = variant.price_ngwee + sum(m.price_ngwee for m in modifiers)
        modifier_counts = Counter(line.modifier_ids)
        seen = set()
        modifier_names = []
        for modifier in modifiers:
            if modifier.id in seen:
                continue
            seen.add(modifier.id)
            count = modifier_counts[modifier.id]
            modifier_names.append(f'{modifier.name} ×{count}' if count > 1 else modifier.name)
        result.append(dict(variant_id=variant.id, name=f'{product.name} · {variant.name}', quantity=line.quantity,
                           unit_price_ngwee=unit_price, total_ngwee=unit_price * line.quantity,
                           modifier_names=modifier_names, notes=line.notes))
        ingredients = recipe(db, variant_id=variant.id)
        for modifier in modifiers:
            ingredients += recipe(db, modifier_id=modifier.id)
        for component in ingredients:
            consumption[component['item_id']] += Decimal(component['quantity']) * line.quantity
    return dict(lines=result, total_ngwee=sum(line['total_ngwee'] for line in result)), consumption
