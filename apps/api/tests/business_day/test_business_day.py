def test_open_close_cash_adjustments_and_immutability(client, login):
    cashier, manager = login('cashier'), login()
    assert client.get('/api/business-day/current',headers=cashier).json() is None
    response = client.post('/api/business-day/open',headers=cashier,json={'opening_float_ngwee':50000})
    assert response.status_code == 201
    assert client.post('/api/business-day/open',headers=manager,json={'opening_float_ngwee':0}).status_code == 409
    assert client.post('/api/business-day/cash-movements',headers=manager,json={'amount_ngwee':-1000,'reason':'Petty cash'}).status_code == 201
    assert client.post('/api/business-day/close',headers=cashier,json={'actual_cash_ngwee':48000}).status_code == 403
    result = client.post('/api/business-day/close',headers=manager,json={'actual_cash_ngwee':48000})
    assert result.status_code == 200
    assert result.json()['expected_cash_ngwee'] == 49000
    assert result.json()['variance_ngwee'] == -1000
    assert result.json()['summary']['cash_movements_ngwee'] == -1000
    assert client.get('/api/business-day/current',headers=cashier).json() is None
    assert client.post('/api/business-day/close',headers=manager,json={'actual_cash_ngwee':48000}).status_code == 409
    assert client.post('/api/business-day/cash-movements',headers=manager,json={'amount_ngwee':100,'reason':'Too late'}).status_code == 409
