from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field, StrictInt
from decimal import Decimal

Money = Annotated[StrictInt, Field(ge=0, le=2_000_000_000)]
Quantity = Annotated[Decimal, Field(gt=0, max_digits=15, decimal_places=3, allow_inf_nan=False)]
Reason = Annotated[str, Field(min_length=3, max_length=300)]


class Command(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
