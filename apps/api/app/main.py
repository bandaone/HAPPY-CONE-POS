import json
import logging
import re
import time
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.middleware.trustedhost import TrustedHostMiddleware
from app.core.config import Settings
from app.core.db import make_database
from app.api.routes.auth import router as auth_router
from app.api.routes.catalog import router as catalog_router
from app.api.routes.inventory import router as inventory_router
from app.api.routes.business_day import router as day_router
from app.api.routes.orders import router as orders_router
from app.api.routes.reports import router as reports_router
from app.api.routes.users import router as users_router
from app.realtime.orders import router as events_router


class RequestContextMiddleware:
    def __init__(self, app, *, log_level: str = 'INFO'):
        self.app = app
        self.logger = logging.getLogger('happycone.requests')
        logging.getLogger().setLevel(getattr(logging, log_level))

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            await self.app(scope, receive, send)
            return
        headers = {key.lower(): value for key, value in scope.get('headers', [])}
        supplied = headers.get(b'x-request-id', b'').decode('ascii', errors='ignore')
        request_id = supplied if re.fullmatch(r'[A-Za-z0-9._:-]{1,128}', supplied) else str(uuid4())
        scope.setdefault('state', {})['request_id'] = request_id
        started = time.perf_counter()
        status = 500

        async def send_with_request_id(message):
            nonlocal status
            if message['type'] == 'http.response.start':
                status = message['status']
                message.setdefault('headers', []).append((b'x-request-id', request_id.encode('ascii')))
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            self.logger.info(json.dumps({
                'event': 'http_request',
                'request_id': request_id,
                'method': scope.get('method'),
                'path': scope.get('path'),
                'status': status,
                'duration_ms': round((time.perf_counter() - started) * 1000, 2),
            }, separators=(',', ':')))


def create_app(settings: Settings | None = None, *, initialize: bool = False) -> FastAPI:
    settings = settings or Settings()
    production = settings.app_env == 'production'
    api = FastAPI(
        title='Happy Cone POS API',
        version='0.3.0',
        docs_url=None if production else '/docs',
        redoc_url=None if production else '/redoc',
        openapi_url=None if production else '/openapi.json',
    )
    api.state.settings = settings
    api.state.engine, api.state.session_factory = make_database(settings.database_url, initialize)
    api.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    api.add_middleware(RequestContextMiddleware, log_level=settings.log_level)
    api.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=['GET', 'POST', 'PATCH', 'OPTIONS'],
                       allow_headers=['Authorization', 'Content-Type', 'X-Request-ID'],
                       expose_headers=['X-Request-ID'])

    api.include_router(auth_router)
    api.include_router(catalog_router)
    api.include_router(inventory_router)
    api.include_router(day_router)
    api.include_router(orders_router)
    api.include_router(reports_router)
    api.include_router(users_router)
    api.include_router(events_router)

    @api.get('/health')
    def health() -> dict[str, str]:
        return {'status': 'ok'}

    @api.get('/ready')
    def ready() -> dict[str, str]:
        with api.state.session_factory() as db:
            db.execute(text('SELECT 1'))
        return {'status': 'ready', 'database': 'ok'}

    return api


app = create_app()
