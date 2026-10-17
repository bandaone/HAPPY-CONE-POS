from fastapi import APIRouter, Depends

from app.api.deps import cashier, commit_result, current_user, database, manager, server
from app.domains.catalog.service import price_lines
from app.domains.orders import service
from app.domains.orders.corrections import start_correction
from app.domains.orders.refunds import refund_order
from app.domains.orders.transitions import transition
from app.domains.tickets.service import ticket
from app.schemas.order import (
    CheckoutCommand,
    CorrectionCommand,
    QuoteCommand,
    RefundCommand,
    StatusCommand,
)

router=APIRouter(prefix='/api/orders')


@router.post('/quote')
def quote(command: QuoteCommand,user=Depends(cashier),db=Depends(database)):
    return price_lines(db,command.lines)[0]


@router.post('',status_code=201)
def checkout(command: CheckoutCommand,user=Depends(cashier),db=Depends(database)):
    result=service.checkout(db,user,command)
    return commit_result(db, result)


@router.get('')
def orders(active: bool=False,user=Depends(current_user),db=Depends(database)):
    return service.list_orders(db,active)


@router.get('/{order_id}')
def order(order_id: str,user=Depends(current_user),db=Depends(database)):
    return service.order_dto(db,service.get_order(db,order_id))


@router.get('/{order_id}/ticket')
def order_ticket(order_id: str,user=Depends(current_user),db=Depends(database)):
    return ticket(db,service.get_order(db,order_id))




@router.post('/{order_id}/status')
def status(order_id: str,command: StatusCommand,user=Depends(server),db=Depends(database)):
    result=transition(db,user,order_id,command)
    return commit_result(db, result)


@router.post('/{order_id}/refund')
def refund(order_id: str,command: RefundCommand,user=Depends(manager),db=Depends(database)):
    result=refund_order(db,user,order_id,command.reason)
    return commit_result(db, result)


@router.post('/{order_id}/correction')
def correction(order_id: str, command: CorrectionCommand, user=Depends(cashier), db=Depends(database)):
    result = start_correction(db, user, order_id, command.reason)
    return commit_result(db, result)
