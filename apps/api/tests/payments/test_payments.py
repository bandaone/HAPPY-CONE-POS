from datetime import datetime

import pytest

from tests.orders.test_checkout import command, open_day


@pytest.mark.parametrize('method', ['MOBILE_MONEY_MANUAL', 'CARD_MANUAL'])
def test_non_cash_payment_records_method_only(client, login, method):
    headers = login('cashier')
    day = open_day(client, headers)
    data = command(day, key=f'method-only-{method.lower()}', method=method)
    data['payment'] = {'method': method}

    assert client.post('/api/orders', headers=headers, json={
        **data, 'offline': True,
    }).status_code == 422

    response = client.post('/api/orders', headers=headers, json=data)
    assert response.status_code == 201
    sale = response.json()
    assert sale['payment'] == {
        'method': method,
        'status': 'CONFIRMED',
        'amount_ngwee': 4200,
        'tendered_ngwee': None,
        'change_ngwee': 0,
        'provider': None,
        'reference': None,
    }
    assert sale['cashier_name'] == 'Chipo Phiri'
    assert datetime.fromisoformat(sale['created_at']).tzinfo is not None
    report = client.get('/api/reports/daily', headers=login('manager')).json()
    assert report['payment_totals'][method] == 4200
