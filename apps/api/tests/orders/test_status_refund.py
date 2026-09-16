from tests.orders.test_checkout import command,open_day


def test_status_guards_and_refund_preserve_financial_history(client,login):
    manager,cashier,server=login(),login('cashier'),login('server')
    day=open_day(client,cashier)
    sale=client.post('/api/orders',headers=cashier,json=command(day)).json()
    path=f"/api/orders/{sale['id']}"
    assert len(client.get('/api/orders?active=true',headers=server).json())==1
    assert client.post(path+'/status',headers=cashier,json={'expected_status':'NEW','status':'PREPARING'}).status_code==403
    assert client.post(path+'/status',headers=server,json={'expected_status':'NEW','status':'SERVED'}).status_code==409
    for old,new in [('NEW','PREPARING'),('PREPARING','READY'),('READY','SERVED')]:
        assert client.post(path+'/status',headers=server,json={'expected_status':old,'status':new}).json()['status']==new
    assert client.post(path+'/status',headers=server,json={'expected_status':'READY','status':'SERVED'}).status_code==409
    assert client.get('/api/orders?active=true',headers=server).json()==[]
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
    assert actions.count('ORDER_STATUS_CHANGED')==3


def test_closed_day_blocks_refund(client,login):
    headers=login()
    sale=client.post('/api/orders',headers=headers,json=command(open_day(client,headers))).json()
    closed=client.post('/api/business-day/close',headers=headers,json={'actual_cash_ngwee':54200}).json()
    assert closed['expected_cash_ngwee']==54200
    assert closed['variance_ngwee']==0
    assert client.post(f"/api/orders/{sale['id']}/refund",headers=headers,json={'reason':'Late request'}).status_code==409
    assert client.get('/api/reports/daily',headers=headers).json()==closed['summary']
