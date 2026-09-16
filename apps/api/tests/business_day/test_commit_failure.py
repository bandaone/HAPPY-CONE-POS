from fastapi.testclient import TestClient
from sqlalchemy.orm import Session


def test_day_open_never_returns_success_before_commit(client, login, monkeypatch):
    headers = login()
    def fail_commit(self):
        raise RuntimeError('Injected commit failure')
    monkeypatch.setattr(Session,'commit',fail_commit)
    with TestClient(client.app,raise_server_exceptions=False) as failing_client:
        response = failing_client.post('/api/business-day/open',headers=headers,json={'opening_float_ngwee':50000})
    assert response.status_code == 500


def test_catalog_recipe_update_rolls_back_when_commit_fails(client, login, monkeypatch):
    headers = login()
    original = client.get('/api/catalog?include_inactive=true', headers=headers).json()

    def fail_commit(self):
        raise RuntimeError('Injected commit failure')

    monkeypatch.setattr(Session, 'commit', fail_commit)
    with TestClient(client.app, raise_server_exceptions=False) as failing_client:
        response = failing_client.put('/api/catalog/variants/vanilla-single', headers=headers, json={
            'name': 'Single scoop', 'price_ngwee': 9900, 'active': False,
            'recipe': [{'item_id': 'napkins', 'quantity': '3.000'}],
        })
    assert response.status_code == 500
    assert client.get('/api/catalog?include_inactive=true', headers=headers).json() == original
