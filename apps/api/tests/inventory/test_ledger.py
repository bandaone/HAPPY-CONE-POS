def test_receipt_waste_count_and_permissions(client, login):
    headers = login()
    def balance():
        return next(i for i in client.get('/api/inventory',headers=headers).json() if i['id']=='cones')['on_hand']
    assert balance() == '200.000'
    data = {'item_id':'cones','type':'RECEIPT','quantity':'10.000','reason':'Delivery'}
    assert client.post('/api/inventory/movements',headers=login('cashier'),json=data).status_code == 403
    assert client.post('/api/inventory/movements',headers=headers,json=data).status_code == 201
    data.update(type='WASTE',quantity='2.000',reason='Broken cones')
    assert client.post('/api/inventory/movements',headers=headers,json=data).json()['quantity'] == '-2.000'
    assert balance() == '208.000'
    response = client.post('/api/inventory/counts',headers=headers,json={'item_id':'cones','counted_quantity':'205.000','reason':'Evening count'})
    assert response.status_code == 201
    assert response.json()['variance'] == '-3.000'
    assert balance() == '208.000'
    data['quantity'] = '-1'
    assert client.post('/api/inventory/movements',headers=headers,json=data).status_code == 422
    data['quantity'] = '300'
    assert client.post('/api/inventory/movements',headers=headers,json=data).status_code == 409
