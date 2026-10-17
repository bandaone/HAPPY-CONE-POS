# Happy Cone Operations, Stock and Remote Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a compact thermal receipt, tightly controlled sale correction, detailed daily reconciliation, simple recipe-based stock and waste tracking, and a read-only remote owner dashboard while keeping checkout fully usable offline.

**Architecture:** PostgreSQL remains the authoritative local store and every financial or stock change is append-only and audited. Checkout, corrections, stock movements, daily reporting and sync events share branch locking so related records commit atomically; a transactional outbox copies reporting projections to Supabase without putting cloud availability in the checkout path. The existing React PWA remains the local staff interface and a separate small React application provides the read-only owner view.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL/SQLite tests, React 19, TypeScript, Vite, Vitest, Supabase Postgres/Auth/REST, Cloudflare Pages, PowerShell Windows packaging.

**Spec:** `docs/superpowers/specs/2026-10-17-operations-reporting-sync-design.md`

## Global Constraints

- The shop computer and local PostgreSQL database remain the operational source of truth and checkout must work with no internet.
- Completed sales and stock movements are never deleted or overwritten; corrections create linked reversal records and audit events.
- Only the globally latest completed sale in the open business day can be corrected, and a newer sale permanently removes that eligibility.
- Cashiers and managers can correct the eligible sale; manager or owner permissions remain required for cash reconciliation, stock setup, counts and adjustments.
- Inventory starts only after opening quantities are recorded; the system must not infer historical consumption.
- Receipts target configured 58 mm or 80 mm paper and contain no logo icon, tax treatment calculation, provider reference, internal UUID or unit-count summary.
- Remote reporting is read-only, idempotent and visibly identifies stale data.
- Existing Windows offline installation and in-place upgrade behavior must remain supported on a 64-bit Windows 10 computer with 4 GB RAM.

## Review Focus

- Two tills try to correct the same latest sale: one succeeds and the other receives a conflict without duplicate money or stock reversal (Task 2).
- A recipe changes after a sale: correction restores the exact recorded sale consumption rather than recalculating the old recipe (Task 2).
- Inventory is disabled or has no opening quantities: checkout remains available and no misleading historical stock is created (Task 4).
- Internet fails during or after commit: the local sale completes once, its outbox event remains retryable, and cloud ingestion is idempotent (Task 7).
- A closed day is queried after later catalog or stock changes: the returned reconciliation is the immutable close snapshot (Task 3).

---

### Task 1: Compact, Reliable Thermal Receipt

**Files:**
- Modify: `apps/web/src/features/Receipt.tsx`
- Modify: `apps/web/src/features/receipt.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: existing `Receipt({ order, profile })`, `StandProfile.receipt_paper_width`, and browser print flow.
- Produces: `Receipt` markup with `receipt-paper-58|80`, text-only business heading and compact printable rows.

- [ ] **Step 1: Extend the failing receipt tests** to assert the paper class, absence of `img`, logo, tax calculation, units and payment references, and presence of business name, location, TPIN, telephone, receipt number, items, total, payment, cash/change, cashier and footer.
- [ ] **Step 2: Run `npm test -- --run src/features/receipt.test.tsx` in `apps/web`** and verify the interrupted receipt source fails to compile or violates the new assertions.
- [ ] **Step 3: Repair `Receipt.tsx`** and implement the compact text-only structure; preserve the refunded marker for historical copies and omit external payment details other than method.
- [ ] **Step 4: Replace conflicting receipt CSS** with a single thermal layout whose printable content width is 48 mm for 58 mm paper and 72 mm for 80 mm paper, with `@page { margin: 0 }` and no fixed page height.
- [ ] **Step 5: Run the focused receipt test and `npm run build`**; both must pass.
- [ ] **Step 6: Commit** with `fix: make thermal receipts compact and predictable`.

### Task 2: Audited Latest-Sale Correction

**Files:**
- Create: `apps/api/alembic/versions/0010_sale_corrections.py`
- Create: `apps/api/app/models/correction.py`
- Create: `apps/api/app/domains/orders/corrections.py`
- Modify: `apps/api/app/models/__init__.py`
- Modify: `apps/api/app/models/payment.py`
- Modify: `apps/api/app/schemas/order.py`
- Modify: `apps/api/app/domains/orders/service.py`
- Modify: `apps/api/app/api/routes/orders.py`
- Modify: `apps/api/tests/orders/test_status_refund.py`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/lib/client.ts`
- Modify: `apps/web/src/features/Operations.tsx`
- Modify: `apps/web/src/features/Pos.tsx`
- Modify: `apps/web/src/features/operations.test.tsx`

**Interfaces:**
- Consumes: `StockMovement(reference=order.id, type='SALE_CONSUMPTION')`, `lock_branch`, existing checkout quoting and audit service.
- Produces: `CorrectionCommand(reason: Reason)`, `start_correction(db, actor, order_id) -> dict`, `CheckoutCommand.corrects_order_id: str | None`, and order DTO fields `correctable`, `correction_status`, `corrected_by_order_id`.

- [ ] **Step 1: Write failing API tests** for cashier access, latest-sale eligibility, newer-sale conflict, closed-day conflict, concurrent/idempotent rejection, required reason, full payment reversal, exact positive stock movements from original consumption, pending correction, and replacement linkage.
- [ ] **Step 2: Run the focused API tests** and confirm the correction endpoint and schema are absent.
- [ ] **Step 3: Add the migration and model** for append-only `sale_corrections(original_order_id UNIQUE, replacement_order_id UNIQUE NULL, business_day_id, reason, status, actor_id, created_at, completed_at)` and add `refunds.kind` constrained to `REFUND|CORRECTION`.
- [ ] **Step 4: Implement `start_correction`** under `lock_branch`: verify open day and latest completed order, create the correction/refund, mark payment refunded, reverse the exact original `SALE_CONSUMPTION` movements with `SALE_CORRECTION_RETURN`, and audit the result.
- [ ] **Step 5: Extend checkout** so `corrects_order_id` can link only the actor's pending correction while holding the same branch lock; update status and audit after replacement succeeds.
- [ ] **Step 6: Expose `POST /api/orders/{order_id}/correction` to the cashier dependency** and include correction state and eligibility in order DTOs.
- [ ] **Step 7: Implement the staff flow**: the most recent eligible sale shows `Correct latest sale`; reason is mandatory; its lines reopen in the POS cart; the next completed checkout links the replacement; permission/error copy explains when a newer sale has locked correction.
- [ ] **Step 8: Run focused API/web tests plus API lint and web build**, then commit `feat: add audited latest-sale correction`.

### Task 3: Detailed Daily Reconciliation and Immutable Close Report

**Files:**
- Modify: `apps/api/app/domains/reporting/service.py`
- Modify: `apps/api/app/domains/business_day/service.py`
- Modify: `apps/api/tests/reporting/test_daily.py`
- Modify: `apps/api/tests/business_day/test_business_day.py`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/features/Operations.tsx`
- Modify: `apps/web/src/features/operations.test.tsx`

**Interfaces:**
- Consumes: orders, payments, refunds/corrections, order lines, cash movements, stock movements, business-day actor IDs.
- Produces: `daily_summary(db, day)` with `sales`, `cash_activity`, `products`, `hourly_sales`, `stock_usage`, `waste`, named opening/closing staff and reconciliation equation.

- [ ] **Step 1: Write failing report tests** asserting chronological sale and cash rows, corrected sales excluded from net item totals, payment totals, gross/correction/net values, quantities and values by item, hourly totals, ingredient consumption, waste selling value/reasons, expected-cash equation, and closed snapshot immutability.
- [ ] **Step 2: Run the report tests** and confirm the expanded fields fail.
- [ ] **Step 3: Refactor reporting into focused query helpers** and build the detailed summary without counting refunded/corrected order lines in net products.
- [ ] **Step 4: Store the complete summary at close** after actual cash is set and before status changes; continue serving the JSON snapshot for closed days.
- [ ] **Step 5: Replace the summary-only UI** with clear reconciliation, payment, cash-activity, item, stock-used and waste sections that use operational language and compact tables.
- [ ] **Step 6: Run report/business-day and operations UI tests**, then commit `feat: add detailed daily reconciliation`.

### Task 4: Simple Stock Setup and Recipe Activation

**Files:**
- Create: `apps/api/alembic/versions/0011_inventory_setup.py`
- Modify: `apps/api/app/models/inventory.py`
- Modify: `apps/api/app/schemas/inventory.py`
- Modify: `apps/api/app/domains/inventory/service.py`
- Modify: `apps/api/app/api/routes/inventory.py`
- Modify: `apps/api/tests/inventory/test_ledger.py`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/lib/client.ts`
- Modify: `apps/web/src/features/Operations.tsx`
- Modify: `apps/web/src/features/MenuAdmin.tsx`
- Modify: `apps/web/src/features/menu-admin.test.tsx`

**Interfaces:**
- Consumes: existing `RecipeComponent` on variants/modifiers and `StandSettings.inventory_tracking_enabled`.
- Produces: stock-item CRUD with `pack_name`, `units_per_pack`, `base_unit`; `activate_inventory(opening_quantities)`; reusable recipe copy/template UI.

- [ ] **Step 1: Write failing inventory tests** for creating/editing/archiving ingredients, pack-to-base-unit conversion, activation refusal when active recipes reference missing opening stock, no historical movements, and checkout behavior while tracking is disabled.
- [ ] **Step 2: Run focused tests** and confirm the setup endpoints are absent.
- [ ] **Step 3: Add stock setup fields and archived state**, keeping existing ledger rows valid, and implement CRUD plus one-time activation that records opening quantities as `OPENING_BALANCE` movements.
- [ ] **Step 4: Build a guided Stock setup UI** with plain fields, opening quantity entry and explicit `Start stock tracking`; show current menu recipes beside each price/extra and allow copying a recipe from another option.
- [ ] **Step 5: Keep checkout unchanged until activation**, then enforce and deduct recipes as it currently does.
- [ ] **Step 6: Run inventory/catalog/UI tests**, then commit `feat: simplify stock setup and recipes`.

### Task 5: Waste with Selling-Price Value

**Files:**
- Create: `apps/api/alembic/versions/0012_waste_records.py`
- Create: `apps/api/app/models/waste.py`
- Create: `apps/api/app/domains/inventory/waste.py`
- Modify: `apps/api/app/schemas/inventory.py`
- Modify: `apps/api/app/api/routes/inventory.py`
- Modify: `apps/api/tests/inventory/test_ledger.py`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/lib/client.ts`
- Modify: `apps/web/src/features/Operations.tsx`
- Modify: `apps/web/src/features/operations.test.tsx`

**Interfaces:**
- Consumes: catalog price/recipe functions and stock movement ledger.
- Produces: `PreparedWasteCommand`, `IngredientWasteCommand`, immutable `WasteRecord`, `record_prepared_waste`, and `record_ingredient_waste`.

- [ ] **Step 1: Write failing tests** for prepared-item recipe deduction, selected choices, selling-price value, required standard reason/comment, ingredient waste with related menu item or estimate, insufficient stock, and reversal only through opposite adjustment.
- [ ] **Step 2: Run focused tests** and verify failure.
- [ ] **Step 3: Add waste records and services** that write the waste header, derived ingredient ledger entries and audit event in one transaction.
- [ ] **Step 4: Replace the generic waste form** with `Prepared item` and `Ingredient` choices, large touch targets, reason chips and conditional comment/value fields.
- [ ] **Step 5: Add waste data to daily reporting**, run focused API/UI/report tests, then commit `feat: record waste quantity reason and sales value`.

### Task 6: Transactional Reporting Outbox

**Files:**
- Create: `apps/api/alembic/versions/0013_reporting_outbox.py`
- Create: `apps/api/app/models/outbox.py`
- Create: `apps/api/app/domains/sync/outbox.py`
- Create: `apps/api/app/domains/sync/worker.py`
- Create: `apps/api/app/api/routes/sync.py`
- Modify: `apps/api/app/core/config.py`
- Modify: `apps/api/app/main.py`
- Modify: each transaction service that changes sales, days, cash or stock
- Create: `apps/api/tests/sync/test_outbox.py`

**Interfaces:**
- Consumes: committed local operational transactions and stable store identifier.
- Produces: `enqueue(db, aggregate_type, aggregate_id, event_type, payload)`, ordered outbox sequence, `push_batch()`, retry metadata and `/api/sync/status`.

- [ ] **Step 1: Write failing tests** for same-transaction enqueue, rollback, ordered delivery, stable UUID/sequence, duplicate acknowledgement, retry/backoff, redacted payloads and checkout success during network failure.
- [ ] **Step 2: Run sync tests** and verify failure.
- [ ] **Step 3: Add outbox schema and enqueue calls** to checkout, correction, business day, cash, inventory and waste transactions.
- [ ] **Step 4: Implement a bounded background worker** using configured Supabase URL/service credential; mark events delivered only after idempotent remote acknowledgement and expose last success, backlog and last error locally.
- [ ] **Step 5: Run sync tests and the complete API suite**, then commit `feat: add offline safe reporting outbox`.

### Task 7: Supabase Projection and Read-Only Owner Dashboard

**Files:**
- Create: `supabase/migrations/202610170001_reporting.sql`
- Create: `supabase/functions/ingest-reporting-events/index.ts`
- Create: `apps/owner-dashboard/package.json`
- Create: `apps/owner-dashboard/src/*`
- Create: `apps/owner-dashboard/tests/dashboard.test.tsx`
- Create: `apps/owner-dashboard/wrangler.toml`
- Modify: `README.md`
- Create: `docs/implementation/remote-reporting.md`

**Interfaces:**
- Consumes: authenticated outbox batches and Supabase owner identities.
- Produces: idempotent reporting projections, RLS-restricted owner reads, date-based dashboard summaries, trends and visible `Last synced` state.

- [ ] **Step 1: Write SQL/ingestion tests or repeatable verification queries** for event uniqueness, sequence handling, owner-only reads and rejection of client writes.
- [ ] **Step 2: Create projection schema, RLS and ingestion function**; ingestion upserts by event UUID and advances a store cursor transactionally.
- [ ] **Step 3: Write failing dashboard tests** for login, one-store daily totals, payment split, item quantities/value, waste, cash variance and stale-sync banner.
- [ ] **Step 4: Build the responsive owner dashboard** with Supabase Auth and read-only queries; use the existing Happy Cone typography/colors without copying the dense POS controls.
- [ ] **Step 5: Add deployment/configuration documentation** for Supabase Free and Cloudflare Pages, including free-tier storage/activity limits and credential rotation.
- [ ] **Step 6: Run dashboard tests/build and SQL verification**, then commit `feat: add remote owner reporting dashboard`.

### Task 8: Full Verification and Windows Upgrade Release

**Files:**
- Modify: `apps/web/e2e/happy-cone.spec.ts`
- Modify: `scripts/*` and `packaging/*` files used by the existing Windows bundle
- Modify: `docs/implementation/windows-installation.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: all completed local/database/web changes.
- Produces: a versioned, checksummed Windows in-place upgrade bundle preserving operational data and an operator verification checklist.

- [ ] **Step 1: Add end-to-end coverage** for sale, print, latest-sale correction, replacement, detailed close, stock activation, consumption, waste and offline sale with queued sync.
- [ ] **Step 2: Run complete API, web and dashboard test/build/lint suites** and resolve all failures.
- [ ] **Step 3: Run migrations against a copy of the prior release database**, verify backup/restore and confirm existing sales/catalog/users remain intact.
- [ ] **Step 4: Build the Windows bundle** with the bundled Python/runtime and wheels, then run the repository release verification scripts and checksum validation.
- [ ] **Step 5: Correct the damaged Windows guide heading** and document exact upgrade, rollback, printer paper-size and LAN-address checks.
- [ ] **Step 6: Commit** with `release: prepare operations reporting upgrade` and record the verified artifact name and SHA-256.
