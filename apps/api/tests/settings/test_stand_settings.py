def settings_payload(**overrides):
    values = {
        'business_name': 'Happy Cone Ice Cream',
        'stand_name': 'Arcades stand',
        'location': 'Lusaka',
        'currency_name': 'Zambian kwacha',
        'currency_code': 'ZMW',
        'currency_symbol': 'K',
        'timezone': 'Africa/Lusaka',
        'payment_guidance': 'Confirm mobile money and card payments before completing a sale.',
        'ticket_guidance': 'Give the numbered ticket to the customer after payment.',
        'receipt_footer': 'Thank you for choosing Happy Cone.',
        'activity_guidance': 'Use this record to review sales and stock changes.',
        'guide_workflow': 'Open the day, take the order, confirm payment and give the ticket.',
        'guide_controls': 'Use Tab to move and Enter to select.',
        'guide_offline': 'Keep this device until every saved order has synced.',
        'guide_printing': 'Use a 58 or 80 mm receipt printer.',
    }
    values.update(overrides)
    return values


def test_authenticated_staff_can_read_stand_settings(client, login):
    response = client.get('/api/stand-settings', headers=login('cashier'))
    assert response.status_code == 200
    assert response.json()['business_name'] == 'Happy Cone Ice Cream'
    assert response.json()['timezone'] == 'Africa/Lusaka'


def test_manager_updates_settings_and_change_is_audited(client, login):
    manager = login('manager')
    response = client.put('/api/stand-settings', headers=manager, json=settings_payload())
    assert response.status_code == 200
    assert response.json()['stand_name'] == 'Arcades stand'
    assert client.get('/api/stand-settings', headers=login('cashier')).json()['ticket_guidance'].startswith('Give the')

    actions = [event['action'] for event in client.get('/api/audit', headers=manager).json()]
    assert 'STAND_SETTINGS_UPDATED' in actions


def test_cashier_cannot_update_settings_and_invalid_timezone_is_rejected(client, login):
    assert client.put('/api/stand-settings', headers=login('cashier'), json=settings_payload()).status_code == 403
    invalid = client.put('/api/stand-settings', headers=login('manager'), json=settings_payload(timezone='Lusaka local time'))
    assert invalid.status_code == 422
