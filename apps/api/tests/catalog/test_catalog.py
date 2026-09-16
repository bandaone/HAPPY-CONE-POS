from sqlalchemy import select

from app.models.inventory import StockMovement


def recipe(item_id='vanilla-stock', quantity='120.000'):
    return [{'item_id': item_id, 'quantity': quantity}]


def test_active_catalog_recipes_and_availability(client, login):
    headers = login()
    catalog = client.get('/api/catalog', headers=headers).json()
    assert len(catalog['products']) >= 3
    vanilla = next(p for p in catalog['products'] if p['id'] == 'vanilla')
    double = next(v for v in vanilla['variants'] if v['id'] == 'vanilla-double')
    assert double['price_ngwee'] == 3200
    assert {'item_id': 'vanilla-stock', 'quantity': '160.000'} in double['recipe']
    assert double['price_ngwee'] + sum(m['price_ngwee'] for m in catalog['modifiers'] if m['id'] in ['cone','oreo']) == 4200
    assert client.patch('/api/catalog/products/vanilla', headers=login('cashier'), json={'active':False}).status_code == 403
    assert client.patch('/api/catalog/products/vanilla', headers=headers, json={'active':False}).status_code == 200
    assert 'vanilla' not in [p['id'] for p in client.get('/api/catalog', headers=headers).json()['products']]


def test_manager_can_list_and_restore_unavailable_products(client, login):
    manager = login()
    client.patch('/api/catalog/products/vanilla', headers=manager, json={'active': False})
    assert client.get('/api/catalog?include_inactive=true', headers=login('cashier')).status_code == 403
    response = client.get('/api/catalog?include_inactive=true', headers=manager)
    vanilla = next(p for p in response.json()['products'] if p['id'] == 'vanilla')
    assert vanilla['active'] is False
    assert client.patch('/api/catalog/products/vanilla', headers=manager, json={'active': True}).status_code == 200
    assert any(p['id'] == 'vanilla' for p in client.get('/api/catalog', headers=manager).json()['products'])


def test_manager_builds_complete_sellable_item_and_owner_can_edit_it(client, login):
    manager = login('manager')
    assert client.post('/api/catalog/categories', headers=login('cashier'), json={
        'id': 'frozen-treats', 'name': 'Frozen treats',
    }).status_code == 403
    assert client.post('/api/catalog/products', headers=login('server'), json={
        'id': 'mango', 'category_id': 'ice-cream', 'name': 'Mango',
        'description': 'Bright mango ice cream made for hot afternoons.',
        'color': '#F4B942', 'active': True,
    }).status_code == 403

    category = client.post('/api/catalog/categories', headers=manager, json={
        'id': 'frozen-treats', 'name': 'Frozen treats',
    })
    assert category.status_code == 201
    assert category.json() == {'id': 'frozen-treats', 'name': 'Frozen treats'}

    product = client.post('/api/catalog/products', headers=manager, json={
        'id': 'mango', 'category_id': 'frozen-treats', 'name': 'Mango sunshine',
        'description': 'Bright mango ice cream made for hot afternoons.',
        'color': '#F4B942', 'active': True,
    })
    assert product.status_code == 201
    assert product.json()['description'] == 'Bright mango ice cream made for hot afternoons.'
    assert product.json()['category_id'] == 'frozen-treats'

    variant = client.post('/api/catalog/products/mango/variants', headers=manager, json={
        'id': 'mango-single', 'name': 'Single scoop', 'price_ngwee': 2800,
        'active': True, 'recipe': recipe('vanilla-stock', '90.000'),
    })
    assert variant.status_code == 201
    assert variant.json() == {
        'id': 'mango-single', 'product_id': 'mango', 'name': 'Single scoop',
        'price_ngwee': 2800, 'active': True,
        'recipe': [{'item_id': 'vanilla-stock', 'quantity': '90.000'}],
    }

    group = client.post('/api/catalog/modifier-groups', headers=manager, json={
        'id': 'presentation', 'name': 'Presentation', 'minimum': 0, 'maximum': 1,
    })
    assert group.status_code == 201
    assert group.json() == {
        'id': 'presentation', 'name': 'Presentation', 'minimum': 0, 'maximum': 1,
    }
    modifier = client.post('/api/catalog/modifier-groups/presentation/modifiers', headers=manager, json={
        'id': 'gift-box', 'name': 'Gift box', 'price_ngwee': 800,
        'active': True, 'recipe': recipe('cups', '1.000'),
    })
    assert modifier.status_code == 201
    assert modifier.json()['group_id'] == 'presentation'

    owner = login('owner')
    edited = client.put('/api/catalog/products/mango', headers=owner, json={
        'category_id': 'frozen-treats', 'name': 'Mango sunshine',
        'description': 'Smooth mango ice cream with a clean tropical finish.',
        'color': '#F0A936', 'active': True,
    })
    assert edited.status_code == 200
    assert edited.json()['description'] == 'Smooth mango ice cream with a clean tropical finish.'

    catalog = client.get('/api/catalog', headers=login('cashier')).json()
    mango = next(entry for entry in catalog['products'] if entry['id'] == 'mango')
    assert mango['category_id'] == 'frozen-treats'
    assert mango['variants'][0]['id'] == 'mango-single'
    assert any(entry['id'] == 'gift-box' for entry in catalog['modifiers'])

    audit_actions = {event['action'] for event in client.get('/api/audit', headers=owner).json()}
    assert {'CATEGORY_CREATED', 'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'VARIANT_CREATED',
            'MODIFIER_GROUP_CREATED', 'MODIFIER_CREATED'} <= audit_actions


def test_manager_updates_prices_recipes_and_inactive_children(client, login):
    manager = login('manager')
    variant = client.put('/api/catalog/variants/vanilla-single', headers=manager, json={
        'name': 'Single scoop', 'price_ngwee': 3500, 'active': False,
        'recipe': recipe(),
    })
    assert variant.status_code == 200
    assert variant.json()['price_ngwee'] == 3500
    assert variant.json()['active'] is False
    assert variant.json()['recipe'] == recipe()

    modifier = client.put('/api/catalog/modifiers/cone', headers=manager, json={
        'name': 'Waffle cone', 'price_ngwee': 600, 'active': False,
        'recipe': recipe('cones', '1.000'),
    })
    assert modifier.status_code == 200
    assert modifier.json()['price_ngwee'] == 600
    assert modifier.json()['active'] is False

    active = client.get('/api/catalog', headers=manager).json()
    vanilla = next(product for product in active['products'] if product['id'] == 'vanilla')
    assert 'vanilla-single' not in {entry['id'] for entry in vanilla['variants']}
    assert 'cone' not in {entry['id'] for entry in active['modifiers']}

    complete = client.get('/api/catalog?include_inactive=true', headers=manager).json()
    vanilla = next(product for product in complete['products'] if product['id'] == 'vanilla')
    assert next(entry for entry in vanilla['variants'] if entry['id'] == 'vanilla-single')['active'] is False
    assert next(entry for entry in complete['modifiers'] if entry['id'] == 'cone')['active'] is False
    assert client.get('/api/catalog?include_inactive=true', headers=login('cashier')).status_code == 403


def test_catalog_rejects_invalid_creation_and_recipe_without_partial_change(client, login):
    manager = login('manager')
    original = client.get('/api/catalog?include_inactive=true', headers=manager).json()
    assert client.post('/api/catalog/categories', headers=manager,
                       json={'id': 'Bad Code', 'name': 'Bad'}).status_code == 422
    assert client.post('/api/catalog/categories', headers=manager,
                       json={'id': 'ice-cream', 'name': 'Duplicate'}).status_code == 409
    assert client.post('/api/catalog/products', headers=manager, json={
        'id': 'orphan', 'category_id': 'missing', 'name': 'Orphan',
        'description': 'Cannot be filed.', 'color': '#FFFFFF', 'active': True,
    }).status_code == 422
    assert client.post('/api/catalog/modifier-groups', headers=manager, json={
        'id': 'broken', 'name': 'Broken', 'minimum': 2, 'maximum': 1,
    }).status_code == 422
    assert client.put('/api/catalog/variants/vanilla-single', headers=manager, json={
        'name': 'Single scoop', 'price_ngwee': 3500, 'active': True,
        'recipe': [
            {'item_id': 'napkins', 'quantity': '1.000'},
            {'item_id': 'napkins', 'quantity': '2.000'},
        ],
    }).status_code == 422
    assert client.put('/api/catalog/variants/vanilla-single', headers=manager, json={
        'name': 'Single scoop', 'price_ngwee': 3500, 'active': True,
        'recipe': recipe('missing-stock', '1.000'),
    }).status_code == 422
    assert client.get('/api/catalog?include_inactive=true', headers=manager).json() == original


def test_recipe_and_price_changes_apply_only_to_future_sales(client, login):
    cashier = login('cashier')
    day = client.post('/api/business-day/open', headers=cashier,
                      json={'opening_float_ngwee': 50000}).json()['id']

    def sale(key):
        return client.post('/api/orders', headers=cashier, json={
            'business_day_id': day, 'idempotency_key': key,
            'lines': [{'variant_id': 'vanilla-single', 'quantity': 1,
                       'modifier_ids': ['cone'], 'notes': ''}],
            'payment': {'method': 'CASH', 'tendered_ngwee': 5000}, 'offline': False,
        }).json()

    first = sale('before-catalog-edit')
    assert first['total_ngwee'] == 2700
    updated = client.put('/api/catalog/variants/vanilla-single', headers=login('manager'), json={
        'name': 'Single scoop', 'price_ngwee': 3500, 'active': True,
        'recipe': [
            {'item_id': 'vanilla-stock', 'quantity': '120.000'},
            {'item_id': 'napkins', 'quantity': '1.000'},
        ],
    })
    assert updated.status_code == 200
    second = sale('after-catalog-edit')
    assert second['total_ngwee'] == 4000
    historic = next(order for order in client.get('/api/orders', headers=login('manager')).json()
                    if order['id'] == first['id'])
    assert historic['total_ngwee'] == 2700

    with client.app.state.session_factory() as db:
        first_movements = db.scalars(select(StockMovement).where(
            StockMovement.reference == first['id'])).all()
        second_movements = db.scalars(select(StockMovement).where(
            StockMovement.reference == second['id'])).all()
    assert next(row.quantity for row in first_movements if row.item_id == 'vanilla-stock') == -80
    assert next(row.quantity for row in second_movements if row.item_id == 'vanilla-stock') == -120
