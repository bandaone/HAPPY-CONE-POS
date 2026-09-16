from dataclasses import dataclass
from typing import Protocol, Literal

PaymentStatus = Literal['PENDING','CONFIRMED','FAILED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED']


@dataclass(frozen=True)
class PaymentResult:
    status: PaymentStatus
    amount_ngwee: int
    provider: str | None = None
    reference: str | None = None


class PaymentAdapter(Protocol):
    def confirm(self, *, amount_ngwee: int, provider: str | None, reference: str | None) -> PaymentResult: ...
