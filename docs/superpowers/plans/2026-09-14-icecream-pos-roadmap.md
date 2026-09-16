# Ice-Cream POS MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a testable single-stand POS where one sale flows through cashier checkout, payment, ticketing, server preparation, recipe-based stock deduction, business-day reconciliation and reporting.

**Architecture:** A React/TypeScript PWA calls a FastAPI application backed by PostgreSQL. Backend domain/application services own business rules; integrations for payment, ticket printing and fiscalization sit behind interfaces. WebSocket events update the preparation screen, while the database remains source of truth.

**Tech Stack:** React, TypeScript, Vite, PWA service worker, FastAPI, Python, SQLAlchemy, Alembic, PostgreSQL, Pytest, Vitest/React Testing Library, Playwright, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-14-icecream-pos-design.md`

## Global Constraints

- Responsive PWA; no proprietary POS terminal is required.
- Roles: `CASHIER`, `SERVER`, `MANAGER`, `OWNER_ADMIN`.
- Completed sales are never deleted through normal workflows.
- Inventory balances are derived from stock movements.
- Money must not use binary floating point.
- Persist timestamps in UTC; report/display using configured branch timezone.
- Checkout/offline sync endpoints must be idempotent.
- Payment, printing and fiscal integrations use adapters/interfaces.
- MVP stops before production gateway and ZRA integrations.

---

## Planned file map

### API
- `apps/api/app/main.py` — FastAPI composition root.
- `apps/api/app/core/config.py` — environment settings.
- `apps/api/app/core/db.py` — database session/engine.
- `apps/api/app/core/security.py` — password/token helpers.
- `apps/api/app/models/` — SQLAlchemy persistence models, separated by domain.
- `apps/api/app/schemas/` — request/response models.
- `apps/api/app/domains/catalog/` — catalog and recipe services.
- `apps/api/app/domains/inventory/` — stock ledger and count services.
- `apps/api/app/domains/business_day/` — open/close/cash reconciliation.
- `apps/api/app/domains/orders/` — order pricing, checkout and status lifecycle.
- `apps/api/app/domains/payments/` — normalized payment model/adapters.
- `apps/api/app/domains/tickets/` — ticket render model.
- `apps/api/app/domains/reporting/` — read/report services.
- `apps/api/app/domains/audit/` — audit append service.
- `apps/api/app/api/routes/` — thin HTTP routes.
- `apps/api/app/realtime/` — WebSocket connection/event publisher.
- `apps/api/tests/` — unit/integration/API tests.

### Web
- `apps/web/src/app/` — router, auth/session, app shell.
- `apps/web/src/features/auth/`
- `apps/web/src/features/pos/`
- `apps/web/src/features/preparation/`
- `apps/web/src/features/inventory/`
- `apps/web/src/features/business-day/`
- `apps/web/src/features/reports/`
- `apps/web/src/lib/api/` — typed API client.
- `apps/web/src/lib/offline/` — IndexedDB queue/cache abstraction.
- `apps/web/src/lib/printing/` — browser print abstraction.
- `apps/web/tests/` and feature tests.

---

### Task 1: Development foundation and health checks

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `apps/api/pyproject.toml`
- Create: `apps/api/app/main.py`
- Create: `apps/api/app/core/config.py`
- Create: `apps/api/app/core/db.py`
- Create: `apps/api/tests/test_health.py`
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/App.test.tsx`

**Interfaces:**
- Produces API `GET /health -> {"status":"ok"}`.
- Produces runnable React app and PostgreSQL local service.

- [ ] **Step 1: Write API health test** asserting HTTP 200 and exact JSON `{ "status": "ok" }`.
- [ ] **Step 2: Run `pytest apps/api/tests/test_health.py -v`** and confirm failure before implementation.
- [ ] **Step 3: Implement minimal FastAPI app/config and `/health` route.**
- [ ] **Step 4: Run health test and confirm pass.**
- [ ] **Step 5: Write web smoke test** that renders `Lusaka Ice-Cream POS`.
- [ ] **Step 6: Run Vitest and confirm failure before React shell exists.**
- [ ] **Step 7: Implement minimal React/Vite shell.**
- [ ] **Step 8: Run backend and frontend tests.**
- [ ] **Step 9: Add Docker Compose PostgreSQL and `.env.example`; verify API can start with configuration.**
- [ ] **Step 10: Commit** `chore: establish pos application foundation`.

### Task 2: Users, authentication and role authorization

**Files:**
- Create: `apps/api/app/models/user.py`
- Create: `apps/api/app/schemas/auth.py`
- Create: `apps/api/app/core/security.py`
- Create: `apps/api/app/domains/identity/service.py`
- Create: `apps/api/app/api/routes/auth.py`
- Create: `apps/api/tests/identity/test_auth.py`
- Create: `apps/web/src/features/auth/LoginPage.tsx`
- Create: `apps/web/src/features/auth/session.ts`
- Create: `apps/web/src/features/auth/LoginPage.test.tsx`

**Interfaces:**
- Produces `POST /auth/login` returning authenticated session/token and role.
- Produces server-side role guard accepting `CASHIER|SERVER|MANAGER|OWNER_ADMIN`.

- [ ] Test invalid credentials, valid credentials and forbidden-role behavior first.
- [ ] Implement user model with unique login identifier, password hash, role and active flag.
- [ ] Implement modern password hashing and token/session validation.
- [ ] Add login route and role dependency.
- [ ] Implement simple login UI and session persistence.
- [ ] Run identity/API/UI tests.
- [ ] Commit `feat: add authenticated role based access`.

### Task 3: Catalog, variants, modifiers and recipes

**Files:**
- Create: `apps/api/app/models/catalog.py`
- Create: `apps/api/app/schemas/catalog.py`
- Create: `apps/api/app/domains/catalog/service.py`
- Create: `apps/api/app/api/routes/catalog.py`
- Create: `apps/api/tests/catalog/test_catalog.py`
- Create: `apps/web/src/features/pos/catalog.ts`

**Interfaces:**
- Produces active sellable catalog read API.
- Produces deterministic pricing function using Decimal.
- Produces recipe component list for selected variant/modifiers.

- [ ] Test that `Double Vanilla + Cone + Oreo` produces configured price and component recipe.
- [ ] Test unavailable products/variants are not sellable.
- [ ] Implement category/product/variant/modifier-group/modifier/recipe persistence.
- [ ] Implement catalog query and pricing service.
- [ ] Seed development catalog data through an explicit dev seed command/fixture.
- [ ] Run tests.
- [ ] Commit `feat: add configurable product catalog and recipes`.

### Task 4: Inventory ledger, receiving, waste and stock count

**Files:**
- Create: `apps/api/app/models/inventory.py`
- Create: `apps/api/app/schemas/inventory.py`
- Create: `apps/api/app/domains/inventory/service.py`
- Create: `apps/api/app/api/routes/inventory.py`
- Create: `apps/api/tests/inventory/test_ledger.py`

**Interfaces:**
- `record_movement(item_id, movement_type, quantity, unit, reference, actor)`.
- `expected_on_hand(item_id) -> Decimal` from ledger sum.
- `record_stock_count(item_id, counted_quantity, actor)` returns expected, counted and variance.

- [ ] Write tests proving receipts increase stock and sale/waste reduce it.
- [ ] Write test proving a stock count reports variance without silently overwriting history.
- [ ] Implement inventory item and immutable movement records.
- [ ] Implement receive, waste, adjustment and count APIs restricted to manager/owner roles.
- [ ] Run tests and database transaction tests.
- [ ] Commit `feat: add inventory movement ledger`.

### Task 5: Business-day open/close and cash ledger

**Files:**
- Create: `apps/api/app/models/business_day.py`
- Create: `apps/api/app/domains/business_day/service.py`
- Create: `apps/api/app/api/routes/business_day.py`
- Create: `apps/api/tests/business_day/test_business_day.py`
- Create: `apps/web/src/features/business-day/OpenDayPage.tsx`
- Create: `apps/web/src/features/business-day/CloseDayPage.tsx`

**Interfaces:**
- One open business day per branch.
- `open_day(opening_float, actor)`.
- `close_day(actual_cash, actor)` computes immutable close snapshot.

- [ ] Test duplicate open is rejected.
- [ ] Test close calculates expected cash from opening float + cash receipts +/- explicit cash movements/refunds.
- [ ] Implement business-day and cash-movement persistence.
- [ ] Implement open/close APIs and simple cashier/manager UI.
- [ ] Run tests.
- [ ] Commit `feat: add business day cash reconciliation`.

### Task 6: Order draft, pricing and checkout transaction

**Files:**
- Create: `apps/api/app/models/order.py`
- Create: `apps/api/app/schemas/order.py`
- Create: `apps/api/app/domains/orders/service.py`
- Create: `apps/api/app/api/routes/orders.py`
- Create: `apps/api/tests/orders/test_checkout.py`

**Interfaces:**
- `quote_order(lines) -> priced order draft`.
- `checkout(command, idempotency_key) -> completed order`.
- Order statuses include `NEW`, `PREPARING`, `READY`, `SERVED`, plus controlled cancelled/void states.

- [ ] Test server re-prices from catalog rather than trusting client totals.
- [ ] Test checkout requires open business day.
- [ ] Test duplicate idempotency key returns same sale rather than duplicating it.
- [ ] Test completed checkout creates recipe `SALE_CONSUMPTION` movements in the same transaction.
- [ ] Implement order/order-line persistence and checkout application service.
- [ ] Run transaction rollback test: failure during stock movement leaves no half-completed sale.
- [ ] Commit `feat: add atomic order checkout`.

### Task 7: Payment normalization and cash/manual external payments

**Files:**
- Create: `apps/api/app/models/payment.py`
- Create: `apps/api/app/domains/payments/contracts.py`
- Create: `apps/api/app/domains/payments/service.py`
- Create: `apps/api/tests/payments/test_payments.py`

**Interfaces:**
- Normalized methods: `CASH`, `MOBILE_MONEY_MANUAL`, `CARD_MANUAL`.
- Normalized statuses: `PENDING`, `CONFIRMED`, `FAILED`, `CANCELLED`, `REFUNDED`, `PARTIALLY_REFUNDED`.
- Payment adapter interface remains provider-neutral.

- [ ] Test K50 cash against K42 due produces K8 change without float arithmetic.
- [ ] Test manual mobile-money transaction requires provider/reference fields.
- [ ] Implement payment persistence and checkout integration.
- [ ] Add manager-visible manual-payment audit fields.
- [ ] Run tests.
- [ ] Commit `feat: add normalized payment handling`.

### Task 8: Cashier POS UI

**Files:**
- Create: `apps/web/src/features/pos/PosPage.tsx`
- Create: `apps/web/src/features/pos/ProductGrid.tsx`
- Create: `apps/web/src/features/pos/OrderPanel.tsx`
- Create: `apps/web/src/features/pos/PaymentDialog.tsx`
- Create: `apps/web/src/features/pos/PosPage.test.tsx`
- Create: `apps/web/src/lib/api/client.ts`

**Interfaces:**
- Consumes active catalog and checkout APIs.
- Produces cashier-friendly touch flow with minimal typing.

- [ ] Test selecting variant/modifier updates visible cart.
- [ ] Test checkout button uses server quote/checkout response.
- [ ] Implement large touch targets, category/product grid and concise order panel.
- [ ] Implement cash and manual mobile-money/card payment forms.
- [ ] Surface change due prominently for cash.
- [ ] Run accessibility/smoke tests at tablet and desktop widths.
- [ ] Commit `feat: add touch friendly cashier pos`.

### Task 9: Ticket render model and browser printing

**Files:**
- Create: `apps/api/app/domains/tickets/service.py`
- Create: `apps/api/tests/tickets/test_ticket.py`
- Create: `apps/web/src/features/pos/CustomerTicket.tsx`
- Create: `apps/web/src/lib/printing/browserPrint.ts`
- Create: `apps/web/src/styles/receipt.css`

**Interfaces:**
- Neutral customer-ticket DTO containing order number, timestamp, lines, total and payment status.
- Browser print adapter; no checkout dependency on printer success.

- [ ] Test ticket DTO from completed order.
- [ ] Implement short human-friendly business-day order number generation.
- [ ] Implement 58/80-mm-friendly CSS print layouts with browser fallback.
- [ ] Test print failure/rejection does not reverse or duplicate sale.
- [ ] Commit `feat: add customer ticket printing`.

### Task 10: Realtime server/preparation queue

**Files:**
- Create: `apps/api/app/realtime/orders.py`
- Create: `apps/api/app/api/routes/preparation.py`
- Create: `apps/api/tests/orders/test_status_transitions.py`
- Create: `apps/web/src/features/preparation/PreparationPage.tsx`
- Create: `apps/web/src/features/preparation/OrderCard.tsx`
- Create: `apps/web/src/features/preparation/PreparationPage.test.tsx`

**Interfaces:**
- WebSocket order-created/order-updated events.
- Server authoritative transition endpoint enforcing `NEW -> PREPARING -> READY -> SERVED`.

- [ ] Test invalid transition `NEW -> SERVED` is rejected.
- [ ] Test server-role user can transition; cashier without permission cannot.
- [ ] Implement realtime publisher and reconnect-safe queue query.
- [ ] Implement preparation UI grouped/ordered by age/status.
- [ ] Verify reconnect reloads state from API rather than relying on missed events.
- [ ] Commit `feat: add realtime preparation workflow`.

### Task 11: Audit log and controlled void/refund foundation

**Files:**
- Create: `apps/api/app/models/audit.py`
- Create: `apps/api/app/domains/audit/service.py`
- Create: `apps/api/app/domains/orders/refunds.py`
- Create: `apps/api/tests/audit/test_audit.py`
- Create: `apps/api/tests/orders/test_void_refund.py`

**Interfaces:**
- Append-only audit event with actor, action, entity, entity ID, timestamp, correlation ID and structured metadata.
- Void/refund never deletes original sale.

- [ ] Test stock adjustment, manual payment confirmation and day close generate audit events.
- [ ] Test refund preserves original order and creates financial reversal record.
- [ ] Implement audited mutation helpers.
- [ ] Implement basic manager-approved void/refund domain path without gateway-specific refund calls.
- [ ] Commit `feat: add audit trail and reversible corrections`.

### Task 12: Reporting API and manager dashboard

**Files:**
- Create: `apps/api/app/domains/reporting/service.py`
- Create: `apps/api/app/api/routes/reports.py`
- Create: `apps/api/tests/reporting/test_daily_report.py`
- Create: `apps/web/src/features/reports/DailyReportPage.tsx`
- Create: `apps/web/src/features/reports/InventoryReportPage.tsx`

**Interfaces:**
- Daily sales/payment/cash summary by business day.
- Product sales summary.
- Inventory movement/current expected stock/waste/count variance views.

- [ ] Seed/test a mixed-payment day and assert exact totals.
- [ ] Test cancelled/voided/refunded handling follows financial policy and does not inflate sales.
- [ ] Implement reporting queries separated from transactional services.
- [ ] Build concise manager report pages.
- [ ] Commit `feat: add sales and inventory reporting`.

### Task 13: Offline PWA foundation and idempotent sync

**Files:**
- Create: `apps/web/src/lib/offline/db.ts`
- Create: `apps/web/src/lib/offline/queue.ts`
- Create: `apps/web/src/lib/offline/sync.ts`
- Create: `apps/web/src/lib/offline/queue.test.ts`
- Modify: `apps/web/vite.config.ts` for PWA/service worker.
- Create: `apps/api/tests/orders/test_offline_sync.py`

**Interfaces:**
- Cache application shell/catalog.
- Queue eligible cash checkout commands using client-generated UUID + idempotency key.
- Synchronize once and mark acknowledged.

- [ ] Test queued cash transaction survives simulated reload.
- [ ] Test same offline mutation replay does not duplicate order or inventory movement.
- [ ] Implement explicit offline indicator and disable network-dependent payment modes offline.
- [ ] Run browser offline test.
- [ ] Commit `feat: add offline cash sale synchronization`.

### Task 14: Fiscal and integration boundaries

**Files:**
- Create: `apps/api/app/integrations/fiscal/contracts.py`
- Create: `apps/api/app/integrations/fiscal/not_configured.py`
- Create: `apps/api/app/integrations/payments/contracts.py`
- Create: `apps/api/app/integrations/printing/contracts.py`
- Create: `apps/api/tests/integrations/test_boundaries.py`

**Interfaces:**
- Fiscal adapter consumes invoiceable sale DTO but initial implementation reports `NOT_CONFIGURED` without blocking ordinary MVP behavior unless policy is later configured otherwise.
- Payment adapter contract supports future asynchronous provider confirmation callbacks.
- Printing adapter contract consumes ticket render model.

- [ ] Test domains do not import provider SDKs.
- [ ] Test fiscal-not-configured state is explicit and not falsely reported as compliant.
- [ ] Commit `refactor: establish external integration boundaries`.

### Task 15: End-to-end acceptance scenario

**Files:**
- Create: `apps/web/e2e/icecream-sale.spec.ts`
- Create: `scripts/dev-seed.sh` or equivalent documented seed command.
- Modify: `README.md` with run/test instructions.

**Interfaces:**
- Exercises the exact acceptance scenario in the design spec.

- [ ] Start clean database and seed manager, cashier, server, catalog and stock.
- [ ] Open day with K500.
- [ ] Sell double vanilla cone + Oreo for configured K42 example price.
- [ ] Accept K50 cash and assert K8 change.
- [ ] Assert customer ticket/order number appears.
- [ ] Assert server queue receives order.
- [ ] Move through preparation statuses.
- [ ] Assert recipe inventory movements exist.
- [ ] Close day and assert payment/cash figures.
- [ ] Assert audit history contains critical events.
- [ ] Run complete API, web and E2E suites.
- [ ] Commit `test: verify complete pos business flow`.

---

## Post-MVP plans (separate work, not part of this plan)

1. Production mobile-money/card gateway adapters and webhook reconciliation.
2. Certified/approved ZRA Smart Invoice/VSDC integration.
3. Direct ESC/POS local print bridge and printer discovery.
4. Supplier/purchase-order/procurement workflow.
5. Multi-branch administration and stock transfers.
6. QR self-order/customer-facing ordering.
7. Costing, gross-margin and forecasting analytics.

## Plan self-review

- Spec coverage: all MVP requirements map to Tasks 1–15.
- Scope: production gateway/ZRA/multi-branch/loyalty/self-order remain explicitly deferred.
- Integrity: checkout, payment, stock and business-day behavior are tested transactionally and idempotently.
- UI: cashier and preparation screens are first-class, while management configuration/reporting is kept simpler.
