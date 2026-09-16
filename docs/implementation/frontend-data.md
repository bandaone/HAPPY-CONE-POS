# Frontend data layer

The web client uses the `POSClient` interface with `ApiClient` for authenticated API access. The application always opens on staff sign-in and never substitutes browser-local sample data after a timeout or server error.

```ts
import { ApiClient, money, type POSClient } from "../lib/client";
const live: POSClient = new ApiClient(savedToken);

money(4200); // K42.00
```

`ApiClient` calls relative `/api` routes, sends bearer authentication after login, aborts requests after 12 seconds, and exposes safe `POSAPIError` messages. Its constructor also accepts `{ baseUrl, timeoutMs }` as a second argument for tests or alternative hosting. `watchOrders` consumes the authenticated `/api/events` stream with bounded reconnect backoff; the preparation view retains a five-second query fallback.

All monetary fields are integer ngwee. `money` formats ngwee for display. `parseMoney` accepts kwacha text with at most two decimal places and derives ngwee from digit strings; pass `{ allowNegative: true }` only for signed amounts such as cash adjustments.

After authentication, the client loads the staff session, role-filtered navigation, catalog and current business day from the API. A first-time product tour is remembered per staff account and browser under `happy-cone:tour:v1:<user-id>`; it can always be restarted from Help. Session data and the last accepted catalog are cached only to support the documented offline cash workflow.

Offline cash capture uses `enqueueCheckout(userId, command)`, `listPending(userId)`, and `syncPending(userId, client)` from `apps/web/src/lib/offline.ts`. Each durable IndexedDB record belongs to one user. Enqueueing forces `offline: true`, rejects non-cash payments, and checks idempotency payloads. Sync submits records sequentially and removes acknowledged orders. Confirmed validation/conflict rejections remain visible with `status: "REJECTED"` and an error. Connection, authorization, rate-limit, and server failures remain pending with the exact command for a later idempotent attempt. If IndexedDB is unavailable, capture stops before claiming the cash order was saved.
