def settings_payload(**overrides):
    values = {
        'business_name': 'Happy Cone Ice Cream',
        'stand_name': 'Arcades stand',
        'location': 'Lusaka',
        'currency_name': 'Zambian kwacha',
        'currency_code': 'ZMW',
        'currency_symbol': 'K',
        'timezone': 'Africa/Lusaka',
        'tax_id': '1002681530',
        'contact_number': '0771450074',
        'tax_label': 'TURNOVER TAX (TOT)',
        'tax_rate_basis_points': 500,
        'receipt_paper_width': '80mm',
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
    assert response.json()['business_name'] == 'CREAMY HEAVEN LIMITED'
    assert response.json()['timezone'] == 'Africa/Lusaka'
    assert response.json()['tax_id'] == '1002681530'
    assert response.json()['tax_label'] == 'TURNOVER TAX (TOT)'
    assert response.json()['tax_rate_basis_points'] == 500
    assert response.json()['receipt_paper_width'] == '80mm'
    assert response.json()['ticket_guidance'] == 'Receipts use the browser print dialog. A printer problem never removes a completed sale; staff can reprint from Sales.'
    assert response.json()['guide_workflow'] == 'Open a business day with the counted float. Choose each item, size, serving and extras, then take payment. Print or close the customer receipt and begin the next sale. Stock and reports update when the sale is accepted.'
    assert 'order' not in response.json()['guide_controls'].lower()
    assert 'order' not in response.json()['guide_offline'].lower()
    assert 'order' not in response.json()['guide_printing'].lower()
    assert 'prepar' not in response.json()['guide_workflow'].lower()


def test_menu_sales_mode_defaults_to_inventory_disabled(client, login):
    from app.models.stand_settings import StandSettings

    assert client.get('/api/stand-settings', headers=login('manager')).status_code == 200
    with client.app.state.session_factory() as db:
        assert db.get(StandSettings, 1).inventory_tracking_enabled is False


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
    invalid_tax = client.put('/api/stand-settings', headers=login('manager'), json=settings_payload(tax_rate_basis_points=10001))
    assert invalid_tax.status_code == 422


def test_manager_selects_supported_receipt_paper_widths(client, login):
    manager = login('manager')
    for width in ('58mm', '80mm'):
        response = client.put(
            '/api/stand-settings', headers=manager,
            json=settings_payload(receipt_paper_width=width),
        )
        assert response.status_code == 200
        assert response.json()['receipt_paper_width'] == width


def test_receipt_paper_width_rejects_unsupported_rolls(client, login):
    response = client.put(
        '/api/stand-settings', headers=login('manager'),
        json=settings_payload(receipt_paper_width='76mm'),
    )
    assert response.status_code == 422
