from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, model_validator


class LoginCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)



class UserCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: str = Field(min_length=1,max_length=80,pattern=r'^[a-zA-Z0-9_.-]+$')
    name: str = Field(min_length=1,max_length=120)
    role: Literal['CASHIER','SERVER','MANAGER','OWNER_ADMIN']
    password: str = Field(min_length=12,max_length=256)


class UserUpdateCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str | None = Field(default=None,min_length=1,max_length=120)
    role: Literal['CASHIER','SERVER','MANAGER','OWNER_ADMIN'] | None = None
    active: bool | None = None

    @model_validator(mode='after')
    def contains_change(self):
        if self.name is None and self.role is None and self.active is None:
            raise ValueError('Provide at least one account change')
        return self


class PasswordResetCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')
    password: str = Field(min_length=12,max_length=256)


class PasswordChangeCommand(BaseModel):
    model_config = ConfigDict(extra='forbid')
    current_password: str = Field(min_length=1,max_length=256)
    new_password: str = Field(min_length=12,max_length=256)
