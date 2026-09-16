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
