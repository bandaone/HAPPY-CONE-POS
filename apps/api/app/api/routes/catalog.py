from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field, StrictBool, StrictInt, field_validator, model_validator

from app.api.deps import commit_result, current_user, database, manager
from app.domains.catalog import service
from app.schemas.common import Command

router = APIRouter(prefix='/api/catalog')

ItemCode = Annotated[str, Field(min_length=1, max_length=60, pattern=r'^[a-z0-9]+(?:-[a-z0-9]+)*$')]
Name = Annotated[str, Field(min_length=1, max_length=100)]


class Availability(Command):
    active: StrictBool


class CategoryUpdate(Command):
    name: Name


class CategoryCreate(CategoryUpdate):
    id: ItemCode


class ProductUpdate(Command):
    category_id: ItemCode
    name: Name
    description: str = Field(max_length=300)
    color: str = Field(pattern=r'^#[0-9A-Fa-f]{6}$')
    active: StrictBool


class ProductCreate(ProductUpdate):
    id: ItemCode


class RecipeInput(Command):
    item_id: ItemCode
    quantity: Decimal = Field(gt=0, max_digits=16, decimal_places=3, allow_inf_nan=False)


class CatalogItemUpdate(Command):
    name: Name
    price_ngwee: StrictInt = Field(ge=0, le=2_000_000_000)
    active: StrictBool
    recipe: list[RecipeInput] = Field(max_length=100)

    @field_validator('recipe')
    @classmethod
    def unique_items(cls, value):
        if len({row.item_id for row in value}) != len(value):
            raise ValueError('Each inventory item may appear only once')
        return value

    @model_validator(mode='after')
    def available_items_have_recipe(self):
        if self.active and not self.recipe:
            raise ValueError('Available items require at least one stock recipe ingredient')
        return self


class CatalogItemCreate(CatalogItemUpdate):
    id: ItemCode


class ModifierGroupUpdate(Command):
    name: Name
    minimum: StrictInt = Field(ge=0, le=20)
    maximum: StrictInt = Field(ge=0, le=20)

    @model_validator(mode='after')
    def valid_range(self):
        if self.minimum > self.maximum:
            raise ValueError('Minimum selections cannot exceed maximum selections')
        return self


class ModifierGroupCreate(ModifierGroupUpdate):
    id: ItemCode


@router.get('')
def catalog(include_inactive: bool = False, user=Depends(current_user), db=Depends(database)):
    if include_inactive and user.role not in ('MANAGER', 'OWNER_ADMIN'):
        raise HTTPException(403, 'Only managers can view unavailable products')
    return service.catalog(db, include_inactive)


@router.post('/categories', status_code=201)
def post_category(command: CategoryCreate, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.create_category(db, user, command))


@router.put('/categories/{category_id}')
def put_category(category_id: str, command: CategoryUpdate, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.update_category(db, user, category_id, command))


@router.post('/products', status_code=201)
def post_product(command: ProductCreate, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.create_product(db, user, command))


@router.put('/products/{product_id}')
def put_product(product_id: str, command: ProductUpdate, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.update_product(db, user, product_id, command))


@router.patch('/products/{product_id}')
def availability(product_id: str, command: Availability, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.set_availability(db, user, product_id, command.active))


@router.post('/products/{product_id}/variants', status_code=201)
def post_variant(product_id: str, command: CatalogItemCreate, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.create_variant(db, user, product_id, command))


@router.put('/variants/{variant_id}')
def put_variant(variant_id: str, command: CatalogItemUpdate, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.update_variant(db, user, variant_id, command))


@router.delete('/variants/{variant_id}')
def delete_variant(variant_id: str, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.delete_variant(db, user, variant_id))


@router.post('/modifier-groups', status_code=201)
def post_modifier_group(command: ModifierGroupCreate, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.create_modifier_group(db, user, command))


@router.put('/modifier-groups/{group_id}')
def put_modifier_group(group_id: str, command: ModifierGroupUpdate, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.update_modifier_group(db, user, group_id, command))


@router.post('/modifier-groups/{group_id}/modifiers', status_code=201)
def post_modifier(group_id: str, command: CatalogItemCreate, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.create_modifier(db, user, group_id, command))


@router.put('/modifiers/{modifier_id}')
def put_modifier(modifier_id: str, command: CatalogItemUpdate, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.update_modifier(db, user, modifier_id, command))


@router.delete('/modifiers/{modifier_id}')
def delete_modifier(modifier_id: str, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.delete_modifier(db, user, modifier_id))
