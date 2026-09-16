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
