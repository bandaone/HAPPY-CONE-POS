from tests.orders.test_checkout import command,open_day


def test_mixed_payment_day_exact_totals_and_audit(client,login):
    headers=login()
    day=open_day(client,headers)
    for index,method in enumerate(['CASH','MOBILE_MONEY_MANUAL','CARD_MANUAL']):
        data=command(day,f'payment-{index}',method)
        if method!='CASH':
            data['payment']={'method':method,'provider':'MTN' if index==1 else 'Bank terminal','reference':f'REF-{index}'}
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
