# Happy Cone Menu and Sales Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production-ready Menu and Sales mode in which managers maintain the real Happy Cone menu, cashiers record fast sales using Cash, Mobile money, or Card, stock does not block or change checkout, and receipts contain only the required business and sale details.

**Architecture:** Preserve the existing catalog, sales, inventory, and audit tables, then add product-specific choice-set associations and a protected `inventory_tracking_enabled=false` operating mode. Add atomic menu-item administration on top of the existing Product/Variant records, validate and price repeated product-specific choices on the server, simplify payment capture, and replace the stock/recipe UI with a focused Menu workspace. Existing inventory records and legacy payment columns remain dormant for compatibility.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, SQLAlchemy 2, Alembic, PostgreSQL/SQLite, React 19, TypeScript, Vitest, Testing Library, Playwright, Vite, PowerShell packaging.

**Spec:** `docs/superpowers/specs/2026-09-30-menu-sales-mode-design.md`

## Global Constraints

- Production starts with `inventory_tracking_enabled=false`; this release must not expose a casual stock-tracking toggle.
- Checkout must not check stock or create `SALE_CONSUMPTION` movements while inventory tracking is disabled.
- Do not delete existing inventory, catalog, sales, payment, refund, audit, or archived records.
- Owners and managers can maintain menu categories, sellable items, prices, product-specific choices, descriptions, and availability.
- A simple item adds in one tap; an item with choices shows only its attached choice sets.
- Repeated flavour choices are valid and count toward the product-specific minimum and maximum.
- Mobile money and Card store only method, authoritative sale amount, cashier, and time; provider and reference remain `NULL`.
- Cash continues to record amount received and change.
- Print one ordinary receipt with logo, business identity, location, TPIN, contact, receipt number, items, total, payment method, cashier, date/time, and footer.
- Do not print tax treatment, tax rate, calculated tax, provider, reference, serving information, or queue/order language.
- Keep checkout idempotency, refunds, daily reporting, audit history, offline Cash recovery, receipt reprinting, role authorization, and 58/80 mm printing.
- The final Windows package must install offline and upgrade an existing database to schema `0009` without losing data.

## Review Focus

- An item with no choice-set associations must accept no modifiers and add in one tap; Task 2 API tests and Task 5 component tests pin this behavior.
- Malicious or stale clients must not submit an unrelated choice, exceed a per-product maximum, or bypass required choices; Task 2 tests every rejection without creating a sale.
- Repeated selections must price each occurrence while receipt text collapses duplicates as `Name ×N`; Tasks 2 and 6 pin pricing and display.
- A timed-out Mobile money or Card request must recover through the existing idempotency key without a second sale; Tasks 3 and 5 test API replay and client recovery.
- Migration and Windows upgrade must preserve existing products, associations, receipts, payments, and inventory records while disabling stock enforcement; Tasks 1 and 7 test clean and populated databases.

---

### Task 1: Persist Menu and Sales Mode Safely

**Files:**
- Create: `apps/api/alembic/versions/0009_menu_sales_mode.py`
- Modify: `apps/api/app/models/stand_settings.py`
- Modify: `apps/api/app/models/payment.py`
- Modify: `apps/api/app/models/catalog.py`
- Modify: `apps/api/app/models/__init__.py`
- Modify: `apps/api/app/domains/settings/service.py`
- Modify: `apps/api/app/seed.py`
- Modify: `apps/api/tests/settings/test_stand_settings.py`
- Modify: `apps/api/tests/test_cli.py`
- Test: `apps/api/tests/catalog/test_catalog.py`

**Interfaces:**
- Produces: `StandSettings.inventory_tracking_enabled: bool`, default `False`, returned only to backend domain code.
- Produces: `ProductModifierGroup(product_id: str, group_id: str, minimum: int, maximum: int, position: int)` with one row per product/group.
- Produces: Alembic revision `0009`, down revision `0008`, that preserves data, seeds legacy associations, and drops `unique_external_payment_reference`.

- [ ] **Step 1: Write failing clean-database and populated-migration tests**

Add `test_menu_sales_mode_defaults_to_inventory_disabled` and `test_0009_preserves_financial_catalog_and_inventory_data`. Assert the latter records IDs/counts before migration, upgrades to `0009`, then finds the same records, `inventory_tracking_enabled is false`, one association for every pre-existing product/group pair, and existing payment provider/reference values untouched.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `cd apps/api && .venv/bin/pytest tests/settings/test_stand_settings.py tests/test_cli.py tests/catalog/test_catalog.py -q`

Expected: FAIL because revision `0009`, the mode field, and product/group association do not exist.

- [ ] **Step 3: Add the model and migration**

Create `ProductModifierGroup` with a composite primary key `(product_id, group_id)`, foreign keys to products/groups, checks `0 <= minimum <= maximum <= 20`, and non-negative position. Add the protected stand setting. In `upgrade()`, create the table, add the false setting, insert legacy product/group cross-product associations using each group's current limits, and remove the external-reference unique constraint with Alembic batch operations compatible with SQLite and PostgreSQL. Keep downgrade non-destructive.

- [ ] **Step 4: Update initialization and demo seed**

Export the new model and make `seed_catalog()` create the same product/group associations that migration creates. Do not remove its explicit development-only inventory seed.

- [ ] **Step 5: Run Task 1 tests**

Run: `cd apps/api && .venv/bin/pytest tests/settings/test_stand_settings.py tests/test_cli.py tests/catalog/test_catalog.py -q`

Expected: PASS, including schema-head assertions for `0009`.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/api/alembic/versions/0009_menu_sales_mode.py apps/api/app/models apps/api/app/domains/settings/service.py apps/api/app/seed.py apps/api/tests
git commit -m "Add menu and sales operating mode"
```

### Task 2: Add Product-Specific Menu Choices and Atomic Menu Items

**Files:**
- Modify: `apps/api/app/api/routes/catalog.py`
- Modify: `apps/api/app/domains/catalog/service.py`
- Modify: `apps/api/app/schemas/order.py`
- Modify: `apps/api/tests/catalog/test_catalog.py`
- Modify: `apps/api/tests/orders/test_checkout.py`

**Interfaces:**
- Produces: catalog `Product` DTO field `choice_sets: list[{group_id, name, minimum, maximum, position}]`.
- Produces: `create_menu_item(db, actor, command) -> dict` and `update_menu_item(db, actor, product_id, command) -> dict`.
- Produces: `POST /api/catalog/menu-items` and `PUT /api/catalog/menu-items/{product_id}` accepting product fields, `prices`, and `choice_sets` in one transaction.
- Produces: `price_lines(db, lines) -> tuple[dict, Counter]` that validates only the selected product's associations and permits repeated modifier IDs.

- [ ] **Step 1: Write failing menu-item contract tests**

Add tests that create `Single Scoop` with one `Standard` price and three attached sets; update its price, description, availability, and limits atomically; and confirm a failed child price or group leaves no partial Product/Variant/association changes. Assert an active price and modifier may have `recipe: []` while tracking is disabled.

Use this response contract:

```python
assert item['choice_sets'] == [
    {'group_id': 'flavour', 'name': 'Flavour', 'minimum': 1, 'maximum': 1, 'position': 0},
    {'group_id': 'serving', 'name': 'Serve in', 'minimum': 1, 'maximum': 1, 'position': 1},
]
```

- [ ] **Step 2: Write failing choice-validation tests**

Create Single, Double, and Triple Scoop products associated with the same Flavour set at exact limits 1, 2, and 3. Assert `['vanilla', 'vanilla']` is valid for Double Scoop, charges the modifier twice, and snapshots `Vanilla ×2`; assert missing, excessive, inactive, unknown, and unrelated choices return `422` or `409` and create no order. Assert an item with no associations rejects every modifier.

- [ ] **Step 3: Run the catalog and checkout tests and verify failure**

Run: `cd apps/api && .venv/bin/pytest tests/catalog/test_catalog.py tests/orders/test_checkout.py -q`

Expected: FAIL because choices are global, duplicate selections are rejected, and atomic menu-item routes do not exist.

- [ ] **Step 4: Implement menu-item commands and services**

Define `MenuPriceInput`, `ProductChoiceSetInput`, `MenuItemCreate`, and `MenuItemUpdate` in the catalog route module. Require one to twenty price records and unique group IDs. Create/update Product, Variant, and ProductModifierGroup rows under the existing request transaction; archive omitted historic variants instead of deleting them. Keep legacy category/product/variant routes for compatibility.

- [ ] **Step 5: Make recipes conditional and expose product choices**

Remove the unconditional Pydantic “available items require recipe” validator. In catalog services, enforce recipes only if `get_settings(db).inventory_tracking_enabled` is true. Extend product DTOs and the catalog response with ordered product-specific choice-set assignments.

- [ ] **Step 6: Validate and price repeated product choices**

Increase `LineCommand.modifier_ids` to a maximum of 12, remove duplicate-ID rejection, reject groups not associated with the product, count every occurrence against product-specific limits, and price every occurrence. Collapse snapshot names deterministically to `Name ×N` in first-selection order while retaining ordinary names for a count of one.

- [ ] **Step 7: Run Task 2 tests**

Run: `cd apps/api && .venv/bin/pytest tests/catalog/test_catalog.py tests/orders/test_checkout.py -q`

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add apps/api/app/api/routes/catalog.py apps/api/app/domains/catalog/service.py apps/api/app/schemas/order.py apps/api/tests/catalog apps/api/tests/orders
git commit -m "Add product-specific menu choices"
```

### Task 3: Simplify Payments and Disable Stock Effects

**Files:**
- Modify: `apps/api/app/schemas/order.py`
- Modify: `apps/api/app/domains/payments/service.py`
- Modify: `apps/api/app/domains/orders/service.py`
- Modify: `apps/api/tests/payments/test_payments.py`
- Modify: `apps/api/tests/orders/test_checkout.py`
- Modify: `apps/api/tests/reporting/test_daily.py`
- Modify: `apps/api/tests/orders/test_status_refund.py`

**Interfaces:**
- Produces: `PaymentCommand(method, tendered_ngwee=None)` with no provider/reference input contract.
- Produces: new non-cash `Payment` rows with `provider is None`, `reference is None`, `tendered_ngwee is None`, and `change_ngwee == 0`.
- Preserves: Cash validation, authoritative totals, audit events, idempotent checkout, refunds, reconciliation, and offline-Cash-only validation.

- [ ] **Step 1: Write failing method-only payment tests**

For Mobile money and Card, post only `{'method': method}` and assert `201`, authoritative `amount_ngwee`, null provider/reference/tendered values, zero change, cashier snapshot, timestamp, and correct daily-report total. Assert non-cash with `offline=true` still returns `422`.

- [ ] **Step 2: Write failing sales-without-stock tests**

Reduce recipe inventory to zero, complete a sale, and assert it succeeds with no movement whose reference is the sale ID. Assert an idempotent retry returns the same sale and the order/payment counts remain one. Keep a separate inventory-domain test proving manual inventory records themselves are unchanged.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `cd apps/api && .venv/bin/pytest tests/payments/test_payments.py tests/orders/test_checkout.py tests/reporting/test_daily.py -q`

Expected: FAIL because external references are required and checkout checks/deducts stock.

- [ ] **Step 4: Normalize method-only payments**

Remove provider/reference from `PaymentCommand`, remove the external-reference lookup, and call the manual confirmation adapter with null metadata. Store and audit only method and amount for new non-cash payments. Keep legacy columns in `payment_dto()` so historic records remain readable.

- [ ] **Step 5: Gate inventory enforcement in checkout**

Read the protected setting inside the checkout transaction. When false, skip insufficient-stock checks and `SALE_CONSUMPTION` writes. When true in a targeted compatibility test, retain the original check/deduction behavior so the dormant subsystem remains internally coherent.

- [ ] **Step 6: Re-run concurrency, refund, and report coverage**

Run: `cd apps/api && .venv/bin/pytest tests/payments tests/orders tests/reporting tests/inventory -q`

Expected: PASS, including concurrent idempotent replay and refund totals.

- [ ] **Step 7: Commit Task 3**

```bash
git add apps/api/app/schemas/order.py apps/api/app/domains/payments/service.py apps/api/app/domains/orders/service.py apps/api/tests
git commit -m "Record method-only payments without stock deductions"
```

### Task 4: Replace Stock Recipes with a Plain Menu Workspace

**Files:**
- Create: `apps/web/src/features/MenuAdmin.tsx`
- Create: `apps/web/src/features/menu-admin.test.tsx`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/lib/client.ts`
- Modify: `apps/web/src/lib/client.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/features/ProductTour.tsx`
- Modify: `apps/web/src/features/onboarding.test.tsx`
- Modify: `apps/web/src/styles.css`
- Delete after replacement: `apps/web/src/features/CatalogRecipes.tsx`
- Delete after replacement: `apps/web/src/features/catalog-recipes.test.tsx`

**Interfaces:**
- Produces: TypeScript `ProductChoiceSet`, `MenuPriceInput`, `MenuItemCreateInput`, and `MenuItemUpdateInput` matching Task 2.
- Produces: `POSClient.createMenuItem(input)` and `POSClient.updateMenuItem(id, input)`.
- Produces: `MenuAdmin({ client, onChanged, onError })` for Manager and Owner administrator only.

- [ ] **Step 1: Write failing client contract tests**

Assert `createMenuItem` posts one JSON request to `/catalog/menu-items` and `updateMenuItem` puts one request to `/catalog/menu-items/{id}` with prices and choice-set limits. Assert provider/reference are absent from serialized non-cash `CheckoutPayment` fixtures.

- [ ] **Step 2: Write failing Menu workspace tests**

Cover: load catalog without calling `inventory()`; create an item from name/category/price; edit description and price; attach Flavour/Serve in/Toppings with limits; create/edit categories and choices; archive, edit, and restore an item; and verify no Stock, recipe, ingredient, quantity-used, low-threshold, or variation terminology appears.

- [ ] **Step 3: Run focused web tests and verify failure**

Run: `cd apps/web && npm test -- --run src/lib/client.test.ts src/features/menu-admin.test.tsx src/features/onboarding.test.tsx`

Expected: FAIL because the new contracts and Menu workspace do not exist.

- [ ] **Step 4: Add web contracts and client methods**

Match the API property names exactly. Keep `provider` and `reference` only on `OrderPayment` for reading historical sales; remove them from `CheckoutPayment`.

- [ ] **Step 5: Build the focused Menu workspace**

Use business labels `Menu`, `Menu item`, `Selling price`, `Price choices`, `Choice set`, `Choice`, `Extra price`, `Available`, and `Archived`. Default to one hidden `Standard` price. Keep description, colour, and multiple prices in a collapsed optional section. Generate stable internal IDs without displaying code fields.

- [ ] **Step 6: Replace navigation and tour wording**

Change page ID/navigation from `inventory`/Stock to `menu`/Menu, render only `MenuAdmin`, remove the `Inventory` import/render path, and update manager/owner tour content. Update login, help, sync, and settings introduction copy so current operation does not claim stock tracking.

- [ ] **Step 7: Run Task 4 tests and production build**

Run: `cd apps/web && npm test -- --run src/lib/client.test.ts src/features/menu-admin.test.tsx src/features/onboarding.test.tsx && npm run build`

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add apps/web/src
git commit -m "Replace stock recipes with menu management"
```

### Task 5: Make Counter Choices and Payments Fast

**Files:**
- Create: `apps/web/src/features/ProductCustomizer.tsx`
- Create: `apps/web/src/features/product-customizer.test.tsx`
- Create: `apps/web/src/features/payment.test.tsx`
- Modify: `apps/web/src/features/Pos.tsx`
- Modify: `apps/web/src/features/practice-flow.test.tsx`
- Modify: `apps/web/src/lib/checkout-journal.test.ts`
- Modify: `apps/web/src/lib/offline.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces: `ProductCustomizer({ product, catalog, onAdd, onClose })` that emits a `CartLine` with repeated modifier IDs.
- Produces: a payment window where Mobile money/Card method buttons call `onSubmit(command)` directly and Cash retains an explicit amount confirmation.
- Preserves: `CheckoutCommand.idempotency_key`, `saveAttempt/readAttempt`, locked recovery, and offline Cash queue.

- [ ] **Step 1: Write failing customizer tests**

Assert a one-price item with no choices adds from its product card without opening a dialog. Assert Double Scoop shows only its attached sets, requires two flavours and one serving, allows Vanilla twice with plus/minus controls, enforces each maximum, and emits the exact repeated `modifier_ids` array. Assert unrelated groups never render.

- [ ] **Step 2: Write failing fast-payment tests**

Assert Cash reveals amount/change and submits only after confirmation. Assert tapping Mobile money or Card once submits a command with only `method`, closes neither recovery state nor receipt prematurely, and disables all method buttons while busy. Assert a timeout retry reuses the same idempotency key and method.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `cd apps/web && npm test -- --run src/features/product-customizer.test.tsx src/features/payment.test.tsx src/features/practice-flow.test.tsx src/lib/checkout-journal.test.ts src/lib/offline.test.ts`

Expected: FAIL because choices are global and non-cash fields/confirmation remain.

- [ ] **Step 4: Extract product-specific customization**

Render assignments in `position` order, look up only active modifiers in each assigned group, expose selection counts in visible and announced text, and flatten counts into repeated IDs. Hide the technical default price name when an item has one price. Keep optional preparation notes out of the primary flow.

- [ ] **Step 5: Implement the fast payment handler**

Replace provider/reference state and fields with one guarded `complete(selectedMethod)` path. Non-cash method buttons invoke it immediately; Cash form submission supplies `tendered_ngwee`. Disable repeated clicks while the promise is pending and preserve journal recovery wording using the saved method.

- [ ] **Step 6: Update cart and provisional-receipt summaries**

Ensure local estimation prices repeated choices individually and displays repeated names as `Name ×N`. Keep offline capture Cash-only and change calculation unchanged.

- [ ] **Step 7: Run Task 5 tests and full web unit suite**

Run: `cd apps/web && npm test`

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add apps/web/src/features apps/web/src/lib apps/web/src/styles.css
git commit -m "Streamline counter choices and payments"
```

### Task 6: Simplify Receipts, Settings, and Reports

**Files:**
- Modify: `apps/api/app/models/stand_settings.py`
- Modify: `apps/api/alembic/versions/0009_menu_sales_mode.py`
- Modify: `apps/api/tests/settings/test_stand_settings.py`
- Modify: `apps/web/src/features/Receipt.tsx`
- Modify: `apps/web/src/features/receipt.test.tsx`
- Modify: `apps/web/src/features/StandSettings.tsx`
- Modify: `apps/web/src/features/stand-settings.test.tsx`
- Modify: `apps/web/src/features/Operations.tsx`
- Modify: `apps/web/src/features/operations.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces: receipt output with no `.receipt-tax` section and no provider/reference rows.
- Produces: receipt settings UI for legal name, branch, location, TPIN, contact, 58/80 mm width, and footer only.
- Produces: user-facing report labels `Mobile money` and `Card`.

- [ ] **Step 1: Rewrite receipt tests to the approved contract**

Assert identity, TPIN, contact, date/time, `Receipt No.`, line choices, total, payment method, cashier, footer, and Cash received/change. Assert absence of Tax details, TURNOVER TAX, percentage/gross-sale text, provider, reference, Customer receipt heading, serving ticket, and queue/order labels. Include `Vanilla ×2` and both paper widths.

- [ ] **Step 2: Write failing settings and report-copy tests**

Assert Receipt details has no Tax category/rate/treatment controls or summary, but still saves TPIN, contact, paper width, and footer. Assert payment guidance says the cashier selects the confirmed method without recording references. Assert reports show `Mobile money` and `Card` without `manual`.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `cd apps/web && npm test -- --run src/features/receipt.test.tsx src/features/stand-settings.test.tsx src/features/operations.test.tsx`

Expected: FAIL on current tax, provider/reference, and manual-payment text.

- [ ] **Step 4: Simplify receipt rendering and print CSS**

Remove tax calculations and markup, external-payment metadata, and unused `.receipt-tax` rules. Keep the ordinary receipt number, refunded marker, business details, amounts, cashier, footer, and 58/80 mm print constraints.

- [ ] **Step 5: Simplify settings and supplied guidance**

Hide tax controls while retaining stored legacy fields in the update payload. Change supplied defaults and guarded migration replacements to method-only payment, menu-only workflow, and no-stock activity wording; preserve owner-customized text that does not exactly equal an old supplied default.

- [ ] **Step 6: Update operational labels**

Remove `· manual` from report rows and remove provider/reference wording from help, recovery, and settings cards. Keep internal enum values unchanged.

- [ ] **Step 7: Run Task 6 tests**

Run: `cd apps/api && .venv/bin/pytest tests/settings/test_stand_settings.py tests/test_cli.py -q && cd ../web && npm test -- --run src/features/receipt.test.tsx src/features/stand-settings.test.tsx src/features/operations.test.tsx && npm run build`

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

```bash
git add apps/api apps/web/src
git commit -m "Simplify receipts and operating guidance"
```

### Task 7: Verify the Full Story and Build Windows 1.0.6

**Files:**
- Modify: `apps/web/e2e/happy-cone.spec.ts`
- Modify: `README.md`
- Modify: `docs/implementation/api-contract.md`
- Modify: `docs/implementation/project-guide.md`
- Modify: `docs/implementation/progress.md`
- Modify: `docs/implementation/windows-installation.md`
- Modify: `docs/implementation/deployment-runbook.md`
- Modify if schema assertion requires it: `packaging/windows/scripts/Get-HappyConeStatus.ps1`
- Modify tests if schema assertion requires it: `packaging/windows/tests/*.Tests.ps1`

**Interfaces:**
- Produces: browser proof of manager menu setup followed by Cash, Mobile money, and Card sales, reports, receipt reprint, and accessibility checks.
- Produces: offline Windows release folder/archive `HappyCone-Windows-1.0.6` at schema `0009`.

- [ ] **Step 1: Rewrite the end-to-end browser journey**

Create category/choice sets/menu items as a manager, including Double Scoop requiring two flavours and one serving. As cashier, add a simple item in one tap, add mixed and repeated scoops, complete one sale per payment method, verify receipt contents/omissions, reprint from Sales, and confirm report totals. Keep axe checks, keyboard traversal, 58/80 mm overflow checks, and offline Cash sync coverage.

- [ ] **Step 2: Run complete repository verification**

Run:

```bash
cd apps/api && .venv/bin/pytest -q && .venv/bin/ruff check --select E4,E7,E9,F app tests
cd ../web && npm test && npm run build && npm run test:e2e
cd ../.. && python3 -m pytest scripts/tests/test_windows_bundle.py -q
git diff --check
```

Expected: every command passes with schema head `0009`.

- [ ] **Step 3: Test migration on a populated copy**

Back up a disposable copy of an existing database, run `alembic upgrade head`, and assert the previous counts/IDs for users, orders, payments, products, modifiers, inventory items, stock movements, and audit events are unchanged. Complete a new method-only Card sale and confirm no stock movement is written.

- [ ] **Step 4: Update user and operator documentation**

Document Menu administration, method-only payments, absence of stock enforcement, receipt fields, offline behavior, and the future status of retained inventory data. Replace Windows setup instructions that currently require opening stock and recipes. Change status examples from schema `0008` to `0009`.

- [ ] **Step 5: Build and verify the offline Windows package**

Run:

```bash
./scripts/build-windows-bundle.sh --version 1.0.6 --cache /tmp/happycone-vendor-cache --output build/windows
python3 -m zipfile -c /home/on3/Downloads/HappyCone-Windows-1.0.6.zip build/windows/HappyCone-Windows-1.0.6
sha256sum /home/on3/Downloads/HappyCone-Windows-1.0.6.zip
```

Verify the manifest, offline wheelhouse installation, PowerShell/Pester suite on CI, a clean Windows installation, and an upgrade of the working shop installation with its database preserved.

- [ ] **Step 6: Commit Task 7**

```bash
git add apps/web/e2e README.md docs/implementation packaging/windows
git commit -m "Prepare menu and sales Windows release"
```

- [ ] **Step 7: Final review and delivery**

Review the complete diff against the approved specification, confirm CI passes, push the reviewed branch to `origin/main`, and provide the Windows archive path, SHA-256, schema revision, first-run menu steps, and any physical printer checks still requiring the shop computer.
