# Cashier-Only Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every accepted checkout an immediately completed sale that produces one ordinary customer receipt and requires no server workspace, ticket or order-number workflow.

**Architecture:** Keep the existing order tables and API identifiers for compatibility, idempotency and audit history, but store new sales as `SERVED` and present their sequence as a receipt number. Remove preparation UI entry points and server-role assignment while retaining legacy server records for owner-led reassignment. Use the existing receipt component and browser-print adapter, simplified to one print target and one primary print action.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic, React 19, TypeScript, Vitest, Testing Library and Playwright.

**Spec:** `docs/superpowers/specs/2026-09-28-cashier-only-checkout-design.md`

## Global Constraints

- Print one customer receipt only; never render a serving ticket or server notification.
- Display the sequential value only as `Receipt No.` while preserving database and API identifiers.
- Preserve checkout idempotency, payment records, recipe stock deduction, refunds, reporting and audit history.
- A printer failure must never reverse a completed sale.
- New online and synchronized offline sales are complete (`SERVED`) at creation.
- Supported operational roles are `CASHIER`, `MANAGER` and `OWNER_ADMIN`; existing `SERVER` rows are preserved.
- Do not add printer hardware dependencies or silent-print claims.

## Review Focus

- Checkout retries after a timeout must return the same completed sale and deduct stock once; pin this in Task 1 checkout tests.
- A legacy server account with an existing session must see a clear no-workspace screen and no operational navigation; pin this in Task 3 component tests.
- Reassigning a legacy server must revoke existing sessions and allow the supported role to work; pin this in Task 1 identity tests and Task 3 staff tests.
- Offline cash capture must say `Pending sync`, then synchronize into a completed sale with one final receipt number; pin this in Task 2 unit tests and Task 4 browser tests.
- Print failure and 58/80 mm layout must keep the receipt available and all amounts within the paper width; pin this in Task 2 receipt tests and Task 4 browser tests.

---

### Task 1: Complete Sales and Supported Staff Roles

**Files:**
- Modify: `apps/api/app/domains/orders/service.py`
- Modify: `apps/api/app/schemas/auth.py`
- Modify: `apps/api/app/domains/identity/service.py`
- Modify: `apps/api/app/seed.py`
- Modify: `apps/api/app/cli.py`
- Modify: `apps/api/tests/orders/test_checkout.py`
- Modify: `apps/api/tests/orders/test_status_refund.py`
- Modify: `apps/api/tests/identity/test_user_admin.py`
- Modify: `apps/api/tests/identity/test_auth.py`

**Interfaces:**
- Produces: `checkout(db, actor, command) -> dict` with `status == "SERVED"` for every new sale.
- Produces: staff create/update commands that accept only `CASHIER | MANAGER | OWNER_ADMIN` for new assignments.
- Preserves: existing `User.role == "SERVER"` rows returned by `list_users(db)` and reassignable to a supported role.

- [ ] **Step 1: Write failing checkout tests**

Add assertions that a successful checkout and an idempotent retry both return `status == "SERVED"`, `GET /api/orders?active=true` is empty, and stock movements occur once.

- [ ] **Step 2: Run the checkout tests and confirm they fail**

Run: `pytest apps/api/tests/orders/test_checkout.py -q`
Expected: FAIL because new orders currently default to `NEW`.

- [ ] **Step 3: Store new sales as complete**

Set `status="SERVED"` explicitly when `Order` is created in `checkout`. Keep `number`, idempotency and audit metadata unchanged.

- [ ] **Step 4: Write failing identity tests**

Assert owner API create/update requests reject assigning `SERVER`, an existing server row remains listed, reassignment to `CASHIER` succeeds, and the role change revokes that user’s sessions.

- [ ] **Step 5: Run identity tests and confirm they fail**

Run: `pytest apps/api/tests/identity/test_user_admin.py apps/api/tests/identity/test_auth.py -q`
Expected: FAIL because `SERVER` is currently assignable.

- [ ] **Step 6: Restrict new operational roles**

Define the create/update Pydantic role literals as `CASHIER | MANAGER | OWNER_ADMIN`. Preserve the database constraint and DTO support for historic `SERVER` rows. Remove the server demo account and the server option from administrator CLI choices.

- [ ] **Step 7: Adapt legacy transition tests**

Keep one compatibility test that inserts a legacy `NEW` order directly and proves the existing transition service still works for a manager. Remove expectations that a newly paid sale enters the preparation queue.

- [ ] **Step 8: Run Task 1 tests**

Run: `pytest apps/api/tests/orders apps/api/tests/identity -q`
Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Commit message: `Complete sales at cashier checkout`

### Task 2: Ordinary Receipt and Fast Print Handoff

**Files:**
- Modify: `apps/web/src/features/Receipt.tsx`
- Modify: `apps/web/src/features/Pos.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/features/receipt.test.tsx`
- Modify: `apps/web/src/features/practice-flow.test.tsx`
- Modify: `apps/web/src/lib/offline.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces: `Receipt({ order, profile })` with one visible `Receipt No. {number}` and no order label, secondary sale reference or variant code.
- Produces: `ReceiptModal` whose initially focused primary action is `Print receipt`.
- Preserves: the existing `onPrint()` callback and print-only `.receipt-print` adapter.

- [ ] **Step 1: Write failing receipt tests**

Assert the receipt includes `Receipt No. A001`, business/tax/payment/cashier data and item quantities; assert it excludes `Order A001`, `Sale reference`, `VANILLA-DOUBLE`, customer-ticket and serving-ticket wording. Assert `Print receipt` has focus after the modal opens.

- [ ] **Step 2: Run receipt tests and confirm they fail**

Run: `npm test -- --run src/features/receipt.test.tsx src/features/practice-flow.test.tsx` from `apps/web`
Expected: FAIL on current order labels, item code and button priority.

- [ ] **Step 3: Simplify the receipt renderer**

Replace the `Order` and `Sale reference` rows with one `Receipt No.` row, remove `.receipt-item-code`, update the accessible article label, and make the Print button primary with `autoFocus`; keep Done as the secondary action.

- [ ] **Step 4: Replace checkout and offline wording**

Use `Current sale`, `Add to sale`, `Next sale`, `Provisional receipt`, `Print provisional receipt`, `Pending sync`, and `saved sale(s)` in cashier-visible copy. Do not rename internal TypeScript `Order` contracts or `/api/orders` routes.

- [ ] **Step 5: Add print-failure and offline-copy assertions**

Test that `window.print` failure leaves the completed receipt open/reprintable, and that offline capture uses provisional-receipt and pending-sync wording without server acceptance language.

- [ ] **Step 6: Run Task 2 tests**

Run: `npm test -- --run src/features/receipt.test.tsx src/features/practice-flow.test.tsx src/lib/offline.test.ts` from `apps/web`
Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Commit message: `Simplify customer receipt checkout`

### Task 3: Remove Preparation Workspace and Server Assignment

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/features/Operations.tsx`
- Modify: `apps/web/src/features/ProductTour.tsx`
- Modify: `apps/web/src/features/onboarding.test.tsx`
- Modify: `apps/web/src/features/staff-accounts.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces: navigation and `Page` types without `preparation`.
- Produces: `StaffAccounts` role selector with supported roles plus a disabled `Legacy server — reassign required` value only while editing an existing server.
- Produces: a legacy-server no-workspace view with account access and Sign out, but no operational navigation.

- [ ] **Step 1: Write failing navigation and tour tests**

Assert authenticated Cashier, Manager and Owner views have no Prepare navigation or preparation tour step. Assert a legacy server user sees the no-workspace explanation and no Counter, Sales, Stock, Cash day, Reports or Settings actions.

- [ ] **Step 2: Write failing staff-management tests**

Assert Add staff account offers only Cashier, Manager and Owner administrator. When editing an existing server, assert the legacy value is labelled, the form cannot reactivate/save it as `SERVER`, and selecting Cashier submits the reassignment.

- [ ] **Step 3: Run focused tests and confirm they fail**

Run: `npm test -- --run src/features/onboarding.test.tsx src/features/staff-accounts.test.tsx` from `apps/web`
Expected: FAIL because preparation and Server are still exposed.

- [ ] **Step 4: Remove preparation UI paths**

Remove `Preparation` from App imports/rendering, remove the `preparation` page and navigation item, remove server-specific tour steps, and delete the unused preparation component and queue-only CSS.

- [ ] **Step 5: Add the legacy-server account state**

Render a focused no-workspace message for `user.role === "SERVER"` with Account and Sign out access. Keep the user out of all operational pages and do not fetch a business day for that role.

- [ ] **Step 6: Restrict staff role controls**

Remove Server from create choices. For an existing server row, show a legacy badge and require reassignment to a supported role before activation. Preserve owner self-protection and session-revocation behavior.

- [ ] **Step 7: Run Task 3 tests**

Run: `npm test -- --run src/features/onboarding.test.tsx src/features/staff-accounts.test.tsx` from `apps/web`
Expected: PASS.

- [ ] **Step 8: Commit Task 3**

Commit message: `Remove server preparation workspace`

### Task 4: Guidance Migration and End-to-End Verification

**Files:**
- Create: `apps/api/alembic/versions/0007_cashier_only_guidance.py`
- Modify: `apps/api/app/models/stand_settings.py`
- Modify: `apps/api/tests/settings/test_stand_settings.py`
- Modify: `apps/api/tests/test_cli.py`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/features/StandSettings.tsx`
- Modify: `apps/web/e2e/happy-cone.spec.ts`
- Modify: `README.md`
- Modify: `docs/implementation/progress.md`

**Interfaces:**
- Produces: migration revision `0007_cashier_only_guidance` with down revision `0006_archive_untracked_catalog_items`.
- Produces: cashier-only default values for `ticket_guidance`, `guide_workflow` and `guide_printing`.
- Preserves: owner-customized guidance that does not exactly match an old supplied default.

- [ ] **Step 1: Write failing migration and settings tests**

Assert migration 0007 replaces exact old defaults, preserves customized text, and the API returns cashier-only defaults for a new database.

- [ ] **Step 2: Run settings and migration tests and confirm they fail**

Run: `pytest apps/api/tests/settings/test_stand_settings.py apps/api/tests/test_cli.py -q`
Expected: FAIL because revision 0007 and new defaults do not exist.

- [ ] **Step 3: Add the guidance migration and defaults**

Use guarded SQL updates for the three exact old strings. Update API model defaults and matching web fallback copy. Rename editable settings labels from ticket/order language to receipt/sale language.

- [ ] **Step 4: Rewrite the browser journey**

Remove preparation and server-role scenarios. Assert checkout returns `SERVED`, the receipt uses `Receipt No. A001`, one printable receipt exists, no order/item-code/server wording appears, reprint works, stock/report/day-close remain correct, and offline sync creates one completed sale. Keep 58/80 mm overflow and axe checks.

- [ ] **Step 5: Run all automated verification**

Run API tests, web component tests, TypeScript/Vite build, Playwright browser journeys and `git diff --check`.
Expected: all pass; production-readiness assertion also passes in the API container with PostgreSQL driver installed.

- [ ] **Step 6: Update operational documentation**

Document the cashier-only flow, single receipt, small receipt number, lack of preparation workspace and browser-print limitation. Remove claims that servers operate a digital queue.

- [ ] **Step 7: Commit Task 4**

Commit message: `Finish cashier-only checkout flow`

- [ ] **Step 8: Final branch review and delivery**

Review the complete diff against the specification, fast-forward main, push `origin/main`, restart localhost and verify API readiness plus the web root.
