from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import func, select

from app.models.inventory import StockMovement
from app.models.stand_settings import StandSettings


def command(day_id, key='sale-001', method='CASH'):
    return {'business_day_id':day_id,'idempotency_key':key,'lines':[{'variant_id':'vanilla-double','quantity':1,'modifier_ids':['cone','oreo'],'notes':'Extra happy'}],
            'payment':{'method':method,'tendered_ngwee':5000},'offline':False}


def open_day(client, headers):
    return client.post('/api/business-day/open',headers=headers,json={'opening_float_ngwee':50000}).json()['id']


def enable_inventory_tracking(client):
    with client.app.state.session_factory.begin() as db:
        settings = db.get(StandSettings, 1)
        if settings is None:
            settings = StandSettings(id=1)
            db.add(settings)
        settings.inventory_tracking_enabled = True


def test_cash_checkout_recipe_ticket_and_idempotency(client, login):
    enable_inventory_tracking(client)
    headers = login('cashier')
    data = command(open_day(client,headers))
    quote = client.post('/api/orders/quote',headers=headers,json={'lines':data['lines']})
    assert quote.status_code == 200
    assert quote.json()['total_ngwee'] == 4200
    response = client.post('/api/orders',headers=headers,json=data)
    assert response.status_code == 201
    sale = response.json()
    assert sale['total_ngwee'] == 4200
    assert sale['payment']['change_ngwee'] == 800
    assert sale['number'] == 'A001'
    assert sale['cashier_name'] == 'Chipo Phiri'
    assert sale['status'] == 'SERVED'
    retry = client.post('/api/orders',headers=headers,json=data).json()
    assert retry['id'] == sale['id']
    assert retry['status'] == 'SERVED'
    assert client.get('/api/orders?active=true',headers=headers).json() == []
    with client.app.state.session_factory() as db:
        movements = db.scalars(select(StockMovement).where(StockMovement.reference==sale['id'])).all()
        assert {m.item_id:str(m.quantity) for m in movements} == {'vanilla-stock':'-160.000','cones':'-1.000','oreo-stock':'-20.000','napkins':'-1.000'}
    data['lines'][0]['quantity']=2
    assert client.post('/api/orders',headers=headers,json=data).status_code == 409
    ticket = client.get(f"/api/orders/{sale['id']}/ticket",headers=headers).json()
    assert ticket['number'] == sale['number']
    assert ticket['fiscal_status'] == 'NOT_CONFIGURED'


def test_completed_order_keeps_cashier_name_after_staff_rename(client, login):
    cashier = login('cashier')
    sale = client.post('/api/orders', headers=cashier,
                       json=command(open_day(client, cashier), key='cashier-snapshot')).json()
    assert sale['cashier_name'] == 'Chipo Phiri'

    owner = login('owner')
    users = client.get('/api/users', headers=owner).json()
    cashier_user = next(user for user in users if user['username'] == 'cashier')
    renamed = client.patch(f"/api/users/{cashier_user['id']}", headers=owner, json={
        'name': 'Chipo Tembo', 'role': 'CASHIER', 'active': True,
    })
    assert renamed.status_code == 200

    historic = client.get('/api/orders', headers=login('manager')).json()[0]
    assert historic['id'] == sale['id']
    assert historic['cashier_name'] == 'Chipo Phiri'


def test_checkout_rejections(client,login,legacy_server):
    headers=login('cashier')
    assert client.post('/api/orders',headers=headers,json=command('no-day')).status_code==409
    day_id=open_day(client,headers)
    data=command(day_id)
    data['lines'][0]['unit_price_ngwee']=1
    assert client.post('/api/orders',headers=headers,json=data).status_code==422
    del data['lines'][0]['unit_price_ngwee']
    data['payment']['tendered_ngwee']=4199
    assert client.post('/api/orders',headers=headers,json=data).status_code==422
    data['payment']['tendered_ngwee']=5000
    data['lines'][0]['modifier_ids']=[]
    assert client.post('/api/orders',headers=headers,json=data).status_code==422
    data['lines'][0]['modifier_ids']=['cone','cone']
    assert client.post('/api/orders',headers=headers,json=data).status_code==422
    data=command(day_id)
    assert client.post('/api/orders',headers=login('server'),json=data).status_code==403
    client.patch('/api/catalog/products/vanilla',headers=login(),json={'active':False})
    assert client.post('/api/orders',headers=headers,json=data).status_code==409
    assert client.get('/api/orders',headers=headers).json()==[]


def test_stock_failure_rolls_back_whole_sale(client,login,monkeypatch):
    from app.domains.orders import service
    enable_inventory_tracking(client)
    headers=login()
    data=command(open_day(client,headers))
    original=service.inventory.record_movement
    calls=0
    def failing(*args,**kwargs):
        nonlocal calls
        calls+=1
        result=original(*args,**kwargs)
        if calls==2:
            raise RuntimeError('Injected database failure after partial recipe write')
        return result
    monkeypatch.setattr(service.inventory,'record_movement',failing)
    import pytest
    with pytest.raises(RuntimeError,match='Injected database failure'):
        client.post('/api/orders',headers=headers,json=data)
    assert client.get('/api/orders',headers=headers).json()==[]
    with client.app.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(StockMovement).where(StockMovement.type=='SALE_CONSUMPTION'))==0
    monkeypatch.setattr(service.inventory,'record_movement',original)
    assert client.post('/api/orders',headers=headers,json=data).json()['number']=='A001'


def test_concurrent_replays_create_one_sale(client,login):
    headers=login()
    data=command(open_day(client,headers),'concurrent-key')
    with ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(lambda _: client.post('/api/orders',headers=headers,json=data), range(4)))
    assert [r.status_code for r in results]==[201]*4
    assert len({r.json()['id'] for r in results})==1
    assert len(client.get('/api/orders',headers=headers).json())==1


def test_offline_replay_and_closed_day_conflict(client,login):
    headers=login()
    day=open_day(client,headers)
    data=command(day,'offline-id')
    data['offline']=True
    sale=client.post('/api/orders',headers=headers,json=data)
    assert sale.status_code==201
    client.post('/api/business-day/close',headers=headers,json={'actual_cash_ngwee':54200})
    assert client.post('/api/orders',headers=headers,json=data).json()['id']==sale.json()['id']
    open_day(client,headers)
    data['idempotency_key']='late-offline-id'
    assert client.post('/api/orders',headers=headers,json=data).status_code==409


def test_persisted_order_times_are_explicit_utc(client, login):
    from datetime import datetime, timedelta
    headers = login()
    sale = client.post('/api/orders',headers=headers,json=command(open_day(client,headers))).json()
    stored = client.get('/api/orders',headers=headers).json()[0]
    created_at = datetime.fromisoformat(stored['created_at'])
    assert created_at.tzinfo is not None
    assert created_at.utcoffset() == timedelta(0)
    assert datetime.fromisoformat(sale['created_at']) == created_at
    day = client.get('/api/business-day/current',headers=headers).json()
    assert datetime.fromisoformat(day['opened_at']).utcoffset() == timedelta(0)


def test_competing_sales_cannot_oversell_stock(client, login):
    enable_inventory_tracking(client)
    headers = login()
    day = open_day(client, headers)
    stock = client.post('/api/inventory/movements', headers=headers, json={
        'item_id':'cones','type':'WASTE','quantity':'199','reason':'Leave one cone'})
    assert stock.status_code == 201
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda key: client.post('/api/orders', headers=headers,
                            json=command(day,key)), ['stock-key-1','stock-key-2']))
    assert sorted(response.status_code for response in results) == [201,409]
    assert len(client.get('/api/orders',headers=headers).json()) == 1
    inventory = client.get('/api/inventory',headers=headers).json()
    assert next(item for item in inventory if item['id']=='cones')['on_hand'] == '0.000'


def test_concurrent_close_and_checkout_keep_one_consistent_snapshot(client, login):
    headers = login()
    day = open_day(client,headers)
    with ThreadPoolExecutor(max_workers=2) as pool:
        checkout = pool.submit(client.post,'/api/orders',headers=headers,json=command(day))
        close = pool.submit(client.post,'/api/business-day/close',headers=headers,json={'actual_cash_ngwee':50000})
        sale,closed = checkout.result(),close.result()
    assert closed.status_code == 200
    assert sale.status_code in (201,409)
    expected_cash = 54200 if sale.status_code == 201 else 50000
    assert closed.json()['expected_cash_ngwee'] == expected_cash
    report = client.get('/api/reports/daily',headers=headers).json()
    assert report['expected_cash_ngwee'] == expected_cash
    assert report['order_count'] == int(sale.status_code==201)


def test_product_specific_choices_allow_repeated_flavours_and_reject_unrelated_options(client, login):
    manager = login('manager')
    for group_id, name, maximum in [
        ('flavour-choice', 'Flavour', 3),
        ('unrelated-choice', 'Unrelated', 1),
    ]:
        assert client.post('/api/catalog/modifier-groups', headers=manager, json={
            'id': group_id, 'name': name, 'minimum': 0, 'maximum': maximum,
        }).status_code == 201
    for modifier_id, group_id, name, price, active in [
        ('choice-vanilla', 'flavour-choice', 'Vanilla', 100, True),
        ('choice-strawberry', 'flavour-choice', 'Strawberry', 100, True),
        ('choice-unavailable', 'flavour-choice', 'Unavailable', 0, False),
        ('choice-unrelated', 'unrelated-choice', 'Unrelated', 0, True),
    ]:
        assert client.post(f'/api/catalog/modifier-groups/{group_id}/modifiers', headers=manager, json={
            'id': modifier_id, 'name': name, 'price_ngwee': price,
            'active': active, 'recipe': [],
        }).status_code == 201

    def menu_item(item_id, name, required):
        return client.post('/api/catalog/menu-items', headers=manager, json={
            'id': item_id, 'category_id': 'ice-cream', 'name': name,
            'description': '', 'color': '#F6E4AB', 'active': True,
            'prices': [{
                'id': f'{item_id}-standard', 'name': 'Standard', 'price_ngwee': 2500,
                'active': True, 'recipe': [],
            }],
            'choice_sets': ([] if required == 0 else [{
                'group_id': 'flavour-choice', 'minimum': required,
                'maximum': required, 'position': 0,
            }]),
        })

    assert menu_item('single-scoop-menu', 'Single Scoop', 1).status_code == 201
    assert menu_item('double-scoop-menu', 'Double Scoop', 2).status_code == 201
    assert menu_item('triple-scoop-menu', 'Triple Scoop', 3).status_code == 201
    assert menu_item('fixed-special-menu', 'Fixed Special', 0).status_code == 201

    cashier = login('cashier')
    day = open_day(client, cashier)

    def checkout(key, item_id, choices):
        return client.post('/api/orders', headers=cashier, json={
            'business_day_id': day, 'idempotency_key': key,
            'lines': [{
                'variant_id': f'{item_id}-standard', 'quantity': 1,
                'modifier_ids': choices, 'notes': '',
            }],
            'payment': {'method': 'CASH', 'tendered_ngwee': 5000},
            'offline': False,
        })

    repeated = checkout('repeated-flavour', 'double-scoop-menu', [
        'choice-vanilla', 'choice-vanilla',
    ])
    assert repeated.status_code == 201
    assert repeated.json()['total_ngwee'] == 2700
    assert repeated.json()['lines'][0]['modifier_names'] == ['Vanilla ×2']

    assert checkout('missing-choice', 'double-scoop-menu', []).status_code == 422
    assert checkout('too-many-choices', 'double-scoop-menu', [
        'choice-vanilla', 'choice-strawberry', 'choice-vanilla',
    ]).status_code == 422
    assert checkout('unknown-choice', 'single-scoop-menu', ['missing-choice']).status_code == 409
    assert checkout('inactive-choice', 'single-scoop-menu', ['choice-unavailable']).status_code == 409
    assert checkout('unrelated-choice', 'single-scoop-menu', ['choice-unrelated']).status_code == 422
    assert checkout('choice-on-fixed-item', 'fixed-special-menu', ['choice-vanilla']).status_code == 422
    assert len(client.get('/api/orders', headers=manager).json()) == 1


def test_sales_mode_checkout_ignores_stock_and_writes_no_consumption(client, login):
    from app.models.order import Order
    from app.models.payment import Payment

    manager = login('manager')
    for item_id, quantity in [
        ('vanilla-stock', '20000'), ('cones', '200'),
        ('oreo-stock', '3000'), ('napkins', '500'),
    ]:
        response = client.post('/api/inventory/movements', headers=manager, json={
            'item_id': item_id, 'type': 'WASTE', 'quantity': quantity,
            'reason': 'Prove sales mode does not depend on stock',
        })
        assert response.status_code == 201

    cashier = login('cashier')
    data = command(open_day(client, cashier), key='sale-with-zero-stock')
    response = client.post('/api/orders', headers=cashier, json=data)
    assert response.status_code == 201
    sale = response.json()
    retry = client.post('/api/orders', headers=cashier, json=data)
    assert retry.status_code == 201
    assert retry.json()['id'] == sale['id']

    with client.app.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Order)) == 1
        assert db.scalar(select(func.count()).select_from(Payment)) == 1
        movements = db.scalars(select(StockMovement).where(
            StockMovement.reference == sale['id'])).all()
        assert movements == []
