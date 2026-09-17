from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StandSettingsCommand(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    business_name: str = Field(min_length=2, max_length=120)
    stand_name: str = Field(min_length=2, max_length=120)
    location: str = Field(min_length=2, max_length=160)
    currency_name: str = Field(min_length=2, max_length=80)
    currency_code: str = Field(min_length=3, max_length=3, pattern=r'^[A-Za-z]{3}$')
    currency_symbol: str = Field(min_length=1, max_length=6)
    timezone: str = Field(min_length=1, max_length=80)
    tax_id: str = Field(min_length=5, max_length=40, pattern=r'^[A-Za-z0-9 ./-]+$')
    contact_number: str = Field(min_length=5, max_length=40)
    tax_label: str = Field(min_length=2, max_length=80)
    tax_rate_basis_points: int = Field(ge=0, le=10_000)
    payment_guidance: str = Field(min_length=10, max_length=1000)
    ticket_guidance: str = Field(min_length=10, max_length=1000)
    receipt_footer: str = Field(min_length=2, max_length=240)
    activity_guidance: str = Field(min_length=10, max_length=1000)
    guide_workflow: str = Field(min_length=10, max_length=1500)
    guide_controls: str = Field(min_length=10, max_length=1500)
    guide_offline: str = Field(min_length=10, max_length=1500)
    guide_printing: str = Field(min_length=10, max_length=1500)

    @field_validator('currency_code')
    @classmethod
    def normalize_currency_code(cls, value: str) -> str:
        return value.upper()

    @field_validator('timezone')
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError('Enter a valid IANA timezone, such as Africa/Lusaka') from error
        return value
