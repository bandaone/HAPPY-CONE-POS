import pytest
from sqlalchemy import select, update, delete
from sqlalchemy.exc import DBAPIError
from app.models.inventory import StockMovement
from app.models.audit import AuditEvent


@pytest.mark.parametrize('model',[StockMovement, AuditEvent])
def test_ledgers_reject_database_update_and_delete(client, model):
    with client.app.state.session_factory() as db:
        row = db.scalar(select(model))
        identifier = row.id
        with pytest.raises(DBAPIError):
            db.execute(delete(model).where(model.id == identifier))
        db.rollback()
        with pytest.raises(DBAPIError):
            db.execute(update(model).where(model.id == identifier).values(id=identifier))
        db.rollback()
        assert db.get(model, identifier) is not None


def test_original_sale_and_closed_day_cannot_be_rewritten(client,login):
    from tests.orders.test_checkout import command,open_day
    from app.models.order import Order,OrderLine
    from app.models.payment import Payment,Refund
    from app.models.business_day import BusinessDay,CashMovement
    from app.models.inventory import StockCount
    headers = login()
    day = open_day(client,headers)
    sale = client.post('/api/orders',headers=headers,json=command(day)).json()
    client.post('/api/business-day/cash-movements',headers=headers,json={'amount_ngwee':100,'reason':'Extra float'})
    client.post('/api/inventory/counts',headers=headers,json={'item_id':'cones','counted_quantity':'199','reason':'Physical count'})
    client.post(f"/api/orders/{sale['id']}/refund",headers=headers,json={'reason':'Customer changed mind'})
    assert client.post('/api/business-day/close',headers=headers,json={'actual_cash_ngwee':50100}).status_code == 200
    with client.app.state.session_factory() as db:
        for model in (Order,OrderLine,Payment,Refund,BusinessDay,CashMovement,StockCount):
            row = db.scalar(select(model))
            identifier = row.id
            with pytest.raises(DBAPIError):
                db.execute(delete(model).where(model.id==identifier))
            db.rollback()
        for model,values in ((Order,{'total_ngwee':1}),(Payment,{'amount_ngwee':1}),
                             (BusinessDay,{'actual_cash_ngwee':0}),
                             (OrderLine,{'name':'Rewritten'}),(Refund,{'reason':'Rewritten'}),
                             (CashMovement,{'reason':'Rewritten'}),(StockCount,{'reason':'Rewritten'})):
            with pytest.raises(DBAPIError):
                db.execute(update(model).values(**values))
            db.rollback()
