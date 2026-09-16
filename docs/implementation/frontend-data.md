# Frontend data layer

The web client uses one `POSClient` interface for live API access and the explicit demo environment. Import contract types and `ApiClient` from `apps/web/src/lib/client.ts`; import `DemoClient` only when the user has selected demo mode. The live client never falls back to demo data after a timeout or server error.

```ts
import { ApiClient, money, type POSClient } from "../lib/client";
import { DemoClient } from "../lib/demo";

const live: POSClient = new ApiClient(savedToken);
const demo: POSClient = new DemoClient();

money(4200); // K42.00
```

`ApiClient` calls relative `/api` routes, sends bearer authentication after login, aborts requests after 12 seconds, and exposes safe `POSAPIError` messages. Its constructor also accepts `{ baseUrl, timeoutMs }` as a second argument for tests or alternative hosting. `watchOrders` consumes the authenticated `/api/events` stream with bounded reconnect backoff; the preparation view retains a five-second query fallback.

All monetary fields are integer ngwee. `money` formats ngwee for display. `parseMoney` accepts kwacha text with at most two decimal places and derives ngwee from digit strings; pass `{ allowNegative: true }` only for signed amounts such as cash adjustments.

`DemoClient` stores its independent, versioned state under `happy-cone:demo:v1` in local storage. It begins with the demo manager, an open day with a K500 float, catalog products, and stock receipt ledger entries. It begins with no orders. Sales price from the catalog, consume recipe stock, update reports, and survive refresh. Checkout idempotency keys return the original order for an identical command and reject a changed command. Refunds reverse reporting and payment values while retaining original sale records and stock consumption. Stock counts record variance without changing the ledger balance. Managers can request `catalog(true)` to manage unavailable products; ordinary catalog reads return active products only.

Offline cash capture uses `enqueueCheckout(userId, command)`, `listPending(userId)`, and `syncPending(userId, client)` from `apps/web/src/lib/offline.ts`. Each durable IndexedDB record belongs to one user. Enqueueing forces `offline: true`, rejects non-cash payments, and checks idempotency payloads. Sync submits records sequentially and removes acknowledged orders. Confirmed validation/conflict rejections remain visible with `status: "REJECTED"` and an error. Connection, authorization, rate-limit, and server failures remain pending with the exact command for a later idempotent attempt. If IndexedDB is unavailable, capture stops before claiming the cash order was saved.
