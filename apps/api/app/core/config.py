from zoneinfo import ZoneInfo
from typing import Literal
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    app_env: Literal['development', 'test', 'production'] = 'development'
    database_url: str = 'sqlite:///./happycone.db'
    branch_timezone: str = 'Africa/Lusaka'
    session_hours: int = 12
    cors_origins: list[str] = Field(default_factory=lambda: ['http://localhost:5173', 'http://127.0.0.1:5173'])
    allowed_hosts: list[str] = Field(default_factory=lambda: ['localhost', '127.0.0.1', 'testserver'])
    log_level: Literal['DEBUG', 'INFO', 'WARNING', 'ERROR'] = 'INFO'

    @field_validator('branch_timezone')
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        ZoneInfo(value)
        return value

    @field_validator('session_hours')
    @classmethod
    def valid_session_hours(cls, value: int) -> int:
        if not 1 <= value <= 168:
            raise ValueError('session_hours must be between 1 and 168')
        return value

    @model_validator(mode='after')
    def valid_production_settings(self):
        if self.app_env != 'production':
            return self
        if not self.database_url.startswith(('postgresql://', 'postgresql+psycopg://')):
            raise ValueError('production requires a PostgreSQL DATABASE_URL')
        unsafe_hosts = {'*', 'localhost', '127.0.0.1', 'testserver'}
        if not self.allowed_hosts or not any(host.lower() not in unsafe_hosts for host in self.allowed_hosts):
            raise ValueError('production ALLOWED_HOSTS must include the public deployment hostname')
        for origin in self.cors_origins:
            parsed = urlparse(origin)
            if parsed.scheme != 'https' or parsed.hostname in {'localhost', '127.0.0.1'}:
                raise ValueError('production CORS_ORIGINS must use HTTPS deployment origins')
        return self
