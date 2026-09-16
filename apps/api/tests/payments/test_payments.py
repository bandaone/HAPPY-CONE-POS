from tests.orders.test_checkout import command, open_day


def test_manual_payment_fields_and_offline_restrictions(client,login):
    headers=login()
    day=open_day(client,headers)
    data=command(day,method='MOBILE_MONEY_MANUAL')
    data['payment'].pop('tendered_ngwee')
    assert client.post('/api/orders',headers=headers,json=data).status_code==422
    data['payment'].update(provider='MTN',reference='MM-1234')
    data['offline']=True
    assert client.post('/api/orders',headers=headers,json=data).status_code==422
    data['offline']=False
    response=client.post('/api/orders',headers=headers,json=data)
    assert response.status_code==201
    assert response.json()['payment']['amount_ngwee']==4200
    assert response.json()['payment']['provider']=='MTN'
