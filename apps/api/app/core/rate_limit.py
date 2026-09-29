from collections import OrderedDict, deque
from threading import Lock
from time import monotonic

from starlette.responses import JSONResponse


class LoginRateLimitMiddleware:
    """Bound failed or successful login attempts per client in one API worker."""

    def __init__(self, app, requests: int, window_seconds: int, capacity: int):
        self.app = app
        self.requests = requests
        self.window_seconds = window_seconds
        self.capacity = capacity
        self._clients: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = Lock()

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or scope.get("method") != "POST" or scope.get("path") != "/api/auth/login":
            await self.app(scope, receive, send)
            return

        client = scope.get("client")
        client_address = client[0] if client else "unknown"
        now = monotonic()
        with self._lock:
            cutoff = now - self.window_seconds
            expired = [key for key, attempts in self._clients.items() if not attempts or attempts[-1] <= cutoff]
            for key in expired:
                self._clients.pop(key, None)

            attempts = self._clients.pop(client_address, deque())
            while attempts and attempts[0] <= cutoff:
                attempts.popleft()
            if len(attempts) >= self.requests:
                self._clients[client_address] = attempts
                blocked = True
            else:
                if not attempts and len(self._clients) >= self.capacity:
                    self._clients.popitem(last=False)
                attempts.append(now)
                self._clients[client_address] = attempts
                blocked = False

        if blocked:
            response = JSONResponse(
                {"detail": "Too many login attempts. Try again shortly."},
                status_code=429,
                headers={"Retry-After": str(self.window_seconds)},
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)
