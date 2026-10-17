from tests.orders.test_checkout import command, open_day


def test_mixed_payment_day_exact_totals_and_audit(client,login):
    headers=login()
    day=open_day(client,headers)
    for index,method in enumerate(['CASH','MOBILE_MONEY_MANUAL','CARD_MANUAL']):
        data=command(day,f'payment-{index}',method)
        if method!='CASH':
            data['payment']={'method':method}
        assert client.post('/api/orders',headers=headers,json=data).status_code==201
    report=client.get('/api/reports/daily',headers=headers).json()
    assert report['order_count']==3
    assert report['gross_sales_ngwee']==12600
    assert report['net_sales_ngwee']==12600
    assert report['average_order_ngwee']==4200
    assert report['payment_totals']=={'CASH':4200,'MOBILE_MONEY_MANUAL':4200,'CARD_MANUAL':4200}
    assert report['expected_cash_ngwee']==54200
    assert report['products']==[{'name':'Vanilla · Double scoop','quantity':3,'total_ngwee':12600}]
    closed=client.post('/api/business-day/close',headers=headers,json={'actual_cash_ngwee':54000}).json()
    assert closed['variance_ngwee']==-200
    assert client.get('/api/reports/daily',headers=login('cashier')).status_code==403
    actions=[a['action'] for a in client.get('/api/audit',headers=headers).json()]
    assert actions.count('MANUAL_PAYMENT_CONFIRMED')==2
    assert 'DAY_CLOSED' in actions


def test_detailed_reconciliation_excludes_corrected_items_and_explains_cash(client, login):
    from tests.orders.test_checkout import enable_inventory_tracking

    enable_inventory_tracking(client)
    manager = login('manager')
    cashier = login('cashier')
    day = open_day(client, cashier)
    first = client.post('/api/orders', headers=cashier,
                        json=command(day, 'report-first')).json()
    second = client.post('/api/orders', headers=cashier,
                         json=command(day, 'report-corrected')).json()
    assert client.post(f"/api/orders/{second['id']}/correction", headers=cashier,
                       json={'reason': 'Customer changed payment'}).status_code == 200
    replacement_command = command(day, 'report-replacement', 'CARD_MANUAL')
    replacement_command['payment'] = {'method': 'CARD_MANUAL'}
    replacement_command['corrects_order_id'] = second['id']
    replacement = client.post('/api/orders', headers=cashier,
                              json=replacement_command).json()
    client.post('/api/business-day/cash-movements', headers=manager,
                json={'amount_ngwee': -1000, 'reason': 'Buy cleaning cloths'})

    report = client.get('/api/reports/daily', headers=manager).json()
    assert report['gross_sales_ngwee'] == 12600
    assert report['corrections_ngwee'] == 4200
    assert report['net_sales_ngwee'] == 8400
    assert report['completed_sale_count'] == 2
    assert report['units_sold'] == 2
    assert report['payment_totals'] == {
        'CASH': 4200, 'MOBILE_MONEY_MANUAL': 0, 'CARD_MANUAL': 4200,
    }
    assert report['products'] == [{
        'name': 'Vanilla · Double scoop', 'quantity': 2, 'total_ngwee': 8400,
    }]
    assert [row['receipt_number'] for row in report['sales']] == [
        first['number'], second['number'], replacement['number'],
    ]
    assert report['sales'][1]['correction_status'] == 'COMPLETED'
    assert report['sales'][1]['net_ngwee'] == 0
    assert report['sales'][2]['corrects_receipt_number'] == second['number']
    assert [row['kind'] for row in report['cash_activity']] == [
        'OPENING_FLOAT', 'SALE', 'SALE', 'CORRECTION', 'CASH_MOVEMENT',
    ]
    assert report['cash_reconciliation'] == {
        'opening_float_ngwee': 50000,
        'cash_sales_ngwee': 8400,
        'cash_reversals_ngwee': -4200,
        'cash_movements_ngwee': -1000,
        'expected_cash_ngwee': 53200,
    }
    assert report['expected_cash_ngwee'] == 53200
    assert report['cash_movements'][0]['reason'] == 'Buy cleaning cloths'
    assert sum(row['net_sales_ngwee'] for row in report['hourly_sales']) == 8400
    usage = {row['item_id']: row['quantity'] for row in report['stock_usage']}
    assert usage == {
        'cones': '2.000', 'napkins': '2.000',
        'oreo-stock': '40.000', 'vanilla-stock': '320.000',
    }
    assert report['opened_by_name'] == 'Chipo Phiri'


def test_closed_detailed_report_is_immutable_snapshot(client, login):
    manager = login('manager')
    day = open_day(client, manager)
    client.post('/api/orders', headers=manager, json=command(day, 'snapshot-sale'))
    closed = client.post('/api/business-day/close', headers=manager,
                         json={'actual_cash_ngwee': 54200}).json()['summary']
    with client.app.state.session_factory.begin() as db:
        from sqlalchemy import select

        from app.models.user import User
        user = db.scalar(select(User).where(User.username == 'manager'))
        user.name = 'Renamed after close'
    assert client.get(f'/api/reports/daily?business_day_id={day}',
                      headers=manager).json() == closed
