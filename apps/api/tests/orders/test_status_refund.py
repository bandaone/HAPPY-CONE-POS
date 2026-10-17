from app.models.order import Order
from tests.orders.test_checkout import command, enable_inventory_tracking, open_day


def test_status_guards_and_refund_preserve_financial_history(client,login):
    enable_inventory_tracking(client)
    manager,cashier=login(),login('cashier')
    day=open_day(client,cashier)
    sale=client.post('/api/orders',headers=cashier,json=command(day)).json()
    path=f"/api/orders/{sale['id']}"
    assert client.get('/api/orders?active=true',headers=manager).json()==[]
    assert client.post(path+'/refund',headers=cashier,json={'reason':'Customer request'}).status_code==403
    refunded=client.post(path+'/refund',headers=manager,json={'reason':'Customer request'})
    assert refunded.status_code==200
    assert refunded.json()['refunded'] is True
    assert refunded.json()['total_ngwee']==4200
    assert refunded.json()['payment']['status']=='REFUNDED'
    assert client.post(path+'/refund',headers=manager,json={'reason':'Duplicate request'}).status_code==409
    assert len(client.get('/api/orders',headers=manager).json())==1
    stocks=client.get('/api/inventory',headers=manager).json()
    assert next(i for i in stocks if i['id']=='cones')['on_hand']=='199.000'
    summary=client.get('/api/reports/daily',headers=manager).json()
    assert summary['gross_sales_ngwee']==4200
    assert summary['refunds_ngwee']==4200
    assert summary['net_sales_ngwee']==0
    assert summary['expected_cash_ngwee']==50000
    actions=[a['action'] for a in client.get('/api/audit',headers=manager).json()]
    assert 'ORDER_REFUNDED' in actions
    assert actions.count('ORDER_STATUS_CHANGED')==0


def test_manager_can_finish_a_legacy_new_order(client, login):
    manager, cashier = login(), login('cashier')
    sale = client.post('/api/orders', headers=cashier,
                       json=command(open_day(client, cashier), key='legacy-status')).json()
    with client.app.state.session_factory.begin() as db:
        db.get(Order, sale['id']).status = 'NEW'

    path = f"/api/orders/{sale['id']}"
    assert len(client.get('/api/orders?active=true', headers=manager).json()) == 1
    assert client.post(path + '/status', headers=cashier,
                       json={'expected_status':'NEW','status':'PREPARING'}).status_code == 403
    assert client.post(path + '/status', headers=manager,
                       json={'expected_status':'NEW','status':'SERVED'}).status_code == 409
    for old, new in [('NEW','PREPARING'),('PREPARING','READY'),('READY','SERVED')]:
        response = client.post(path + '/status', headers=manager,
                               json={'expected_status':old,'status':new})
        assert response.json()['status'] == new
    assert client.get('/api/orders?active=true', headers=manager).json() == []


def test_closed_day_blocks_refund(client,login):
    headers=login()
    sale=client.post('/api/orders',headers=headers,json=command(open_day(client,headers))).json()
    closed=client.post('/api/business-day/close',headers=headers,json={'actual_cash_ngwee':54200}).json()
    assert closed['expected_cash_ngwee']==54200
    assert closed['variance_ngwee']==0
    assert client.post(f"/api/orders/{sale['id']}/refund",headers=headers,json={'reason':'Late request'}).status_code==409
    assert client.get('/api/reports/daily',headers=headers).json()==closed['summary']


def test_cashier_corrects_latest_sale_and_replacement_links_exact_stock(client, login):
    from decimal import Decimal

    from sqlalchemy import select

    from app.models.inventory import StockMovement

    enable_inventory_tracking(client)
    cashier = login('cashier')
    day = open_day(client, cashier)
    sale = client.post('/api/orders', headers=cashier,
                       json=command(day, key='original-sale')).json()
    assert sale['lines'][0]['modifier_ids'] == ['cone', 'oreo']

    corrected = client.post(f"/api/orders/{sale['id']}/correction", headers=cashier,
                            json={'reason': 'Customer changed to another item'})
    assert corrected.status_code == 200
    assert corrected.json()['payment']['status'] == 'REFUNDED'
    assert corrected.json()['correction_status'] == 'PENDING'
    assert corrected.json()['correctable'] is False

    with client.app.state.session_factory() as db:
        movements = db.scalars(select(StockMovement).where(
            StockMovement.reference == sale['id'])).all()
        by_item = {}
        for movement in movements:
            by_item[movement.item_id] = by_item.get(movement.item_id, Decimal('0')) + movement.quantity
        assert by_item == {
            'vanilla-stock': Decimal('0'), 'cones': Decimal('0'),
            'oreo-stock': Decimal('0'), 'napkins': Decimal('0'),
        }
        assert {movement.type for movement in movements} == {
            'SALE_CONSUMPTION', 'SALE_CORRECTION_RETURN',
        }

    replacement_command = command(day, key='replacement-sale')
    replacement_command['corrects_order_id'] = sale['id']
    replacement = client.post('/api/orders', headers=cashier, json=replacement_command)
    assert replacement.status_code == 201
    assert replacement.json()['corrects_order_id'] == sale['id']
    assert replacement.json()['correction_status'] == 'COMPLETED'
    original = client.get(f"/api/orders/{sale['id']}", headers=cashier).json()
    assert original['corrected_by_order_id'] == replacement.json()['id']


def test_only_latest_sale_can_be_corrected_and_unrelated_sale_locks_pending(client, login):
    cashier = login('cashier')
    day = open_day(client, cashier)
    first = client.post('/api/orders', headers=cashier,
                        json=command(day, key='first-sale')).json()
    second = client.post('/api/orders', headers=cashier,
                         json=command(day, key='second-sale')).json()
    blocked = client.post(f"/api/orders/{first['id']}/correction", headers=cashier,
                          json={'reason': 'Too late to correct'})
    assert blocked.status_code == 409
    assert 'latest' in blocked.json()['detail'].lower()

    started = client.post(f"/api/orders/{second['id']}/correction", headers=cashier,
                          json={'reason': 'Customer changed order'})
    assert started.status_code == 200
    unrelated = client.post('/api/orders', headers=cashier,
                            json=command(day, key='unrelated-sale'))
    assert unrelated.status_code == 201
    attempted = command(day, key='late-replacement')
    attempted['corrects_order_id'] = second['id']
    response = client.post('/api/orders', headers=cashier, json=attempted)
    assert response.status_code == 409
    assert client.get(f"/api/orders/{second['id']}", headers=cashier).json()['correction_status'] == 'LOCKED'


def test_correction_requires_reason_and_open_day(client, login):
    cashier = login('cashier')
    manager = login('manager')
    day = open_day(client, cashier)
    sale = client.post('/api/orders', headers=cashier,
                       json=command(day, key='close-before-correction')).json()
    assert client.post(f"/api/orders/{sale['id']}/correction", headers=cashier,
                       json={'reason': ''}).status_code == 422
    client.post('/api/business-day/close', headers=manager,
                json={'actual_cash_ngwee': 54200})
    assert client.post(f"/api/orders/{sale['id']}/correction", headers=manager,
                       json={'reason': 'Found after close'}).status_code == 409


def test_competing_correction_requests_reverse_sale_once(client, login):
    from concurrent.futures import ThreadPoolExecutor

    from sqlalchemy import func, select

    from app.models.correction import SaleCorrection
    from app.models.inventory import StockMovement

    enable_inventory_tracking(client)
    cashier = login('cashier')
    day = open_day(client, cashier)
    sale = client.post('/api/orders', headers=cashier,
                       json=command(day, key='competing-correction')).json()
    path = f"/api/orders/{sale['id']}/correction"
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(
            lambda _: client.post(path, headers=cashier,
                                  json={'reason': 'Correct once'}),
            range(2),
        ))
    assert sorted(response.status_code for response in responses) == [200, 409]
    with client.app.state.session_factory() as db:
        assert db.scalar(select(func.count()).select_from(SaleCorrection)) == 1
        assert db.scalar(select(func.count()).select_from(StockMovement).where(
            StockMovement.reference == sale['id'],
            StockMovement.type == 'SALE_CORRECTION_RETURN',
        )) == 4
