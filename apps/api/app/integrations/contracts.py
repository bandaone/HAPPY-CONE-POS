"""Provider-neutral boundaries; no gateway or fiscal certification is implied."""
from dataclasses import dataclass
from typing import Protocol,Literal


@dataclass(frozen=True)
class InvoiceableSale:
    order_id: str
    total_ngwee: int
    currency: str = 'ZMW'


@dataclass(frozen=True)
class FiscalResult:
    status: Literal['NOT_CONFIGURED','PENDING','ACCEPTED','REJECTED']
    reference: str | None = None


class FiscalAdapter(Protocol):
    def submit(self,sale: InvoiceableSale) -> FiscalResult: ...


class PrintingAdapter(Protocol):
    def print_ticket(self,ticket: dict) -> None: ...


class NotConfiguredFiscalAdapter:
    def submit(self,sale: InvoiceableSale) -> FiscalResult:
        return FiscalResult('NOT_CONFIGURED')
