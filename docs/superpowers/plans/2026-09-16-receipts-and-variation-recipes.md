# Receipts and Variation Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an honest thermal customer receipt and let managers create and maintain the complete sellable catalog, including categories, products, variations, modifier groups, prices, availability, and stock recipes.

**Architecture:** Extend the existing FastAPI catalog domain with atomic manager-only replacement commands and expose inactive child records to authorised catalog reads. Snapshot the cashier display name on each order, then consume the expanded contracts in focused React receipt and catalog-editor components.

**Tech Stack:** Python 3.12, FastAPI, Pydantic 2, SQLAlchemy 2, Alembic, PostgreSQL/SQLite tests, React 19, TypeScript, Vite, Vitest, Testing Library, Playwright, axe-core.

**Spec:** `docs/superpowers/specs/2026-09-16-receipts-and-variation-recipes-design.md`

## Global Constraints

- The receipt is an operational `Customer Receipt`; never display fabricated ZRA, TPIN, tax, fiscal signature, SDC/MRC, Smart Invoice, or verification QR data.
- Prices remain non-negative integer ngwee and checkout pricing remains server-owned.
- Recipe quantities are positive decimals with at most three fractional places; duplicate or unknown inventory items are rejected.
- Only `MANAGER` and `OWNER_ADMIN` may mutate catalog price, availability, or recipes.
- Catalog item codes are user-supplied lowercase identifiers at creation and immutable afterward; records used by sales are archived instead of deleted.
- Catalog updates are atomic, branch-locked, and audited with structured before and after state.
- Historical sale names, prices, cashier name, and stock movements never change after later catalog or staff-account edits.
- Every visible control is keyboard operable, has a visible label, uses a minimum 44 by 44 CSS-pixel target, and does not communicate meaning by colour alone.
- Use the existing dependencies; add no receipt, QR, form, or state-management library.

---

### Task 1: Snapshot cashier identity on orders

**Files:**
- Create: `apps/api/alembic/versions/0002_order_cashier_name.py`
- Modify: `apps/api/app/models/order.py`
- Modify: `apps/api/app/domains/orders/service.py`
- Modify: `apps/web/src/lib/types.ts`
- Test: `apps/api/tests/orders/test_checkout.py`
- Test: `apps/api/tests/identity/test_user_admin.py`

**Interfaces:**
- Consumes: `Order.actor_id`, `User.name`, and the existing `order_dto(db, order)` response builder.
- Produces: non-null `Order.cashier_name: str` and `Order.cashier_name: string` in every API/web order contract.

- [ ] **Step 1: Write failing API tests for cashier snapshots**

Add assertions equivalent to:

```python
order = checkout(client, manager_headers)
assert order["cashier_name"] == "Mwamba Manager"

client.patch(
    f"/api/users/{manager_id}",
    headers=owner_headers,
    json={"name": "Renamed Manager", "role": "MANAGER", "active": True},
)
historic = client.get("/api/orders", headers=manager_headers).json()[0]
assert historic["cashier_name"] == "Mwamba Manager"
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd apps/api && .venv/bin/pytest tests/orders/test_checkout.py tests/identity/test_user_admin.py -q`

Expected: failure because `cashier_name` is absent from order responses and storage.

- [ ] **Step 3: Add migration and model field**

Create Alembic revision `0002_order_cashier_name` with `down_revision = "0001_initial"`. Add a nullable `String(120)` column, backfill from `users.name` through `orders.actor_id`, then use `batch_alter_table` to make it non-null so both PostgreSQL and the SQLite demonstration migration work. Downgrade removes the column through the same batch API. Add:

```python
cashier_name: Mapped[str] = mapped_column(String(120))
```

to `Order`.

- [ ] **Step 4: Capture and serialize the name**

Pass `cashier_name=actor.name` when constructing `Order`, and include `cashier_name=order.cashier_name` in `order_dto`.

- [ ] **Step 5: Update the TypeScript contract and fixtures**

Add `cashier_name: string` to `Order` and update complete `Order` fixtures in web tests. Do not make the field optional.

- [ ] **Step 6: Verify GREEN and migration integrity**

Run: `cd apps/api && .venv/bin/pytest tests/orders/test_checkout.py tests/identity/test_user_admin.py tests/test_production_readiness.py -q`

Expected: all selected tests pass, including migration-head validation.

- [ ] **Step 7: Commit**

```bash
git add apps/api/alembic/versions/0002_order_cashier_name.py apps/api/app/models/order.py apps/api/app/domains/orders/service.py apps/api/tests/orders/test_checkout.py apps/api/tests/identity/test_user_admin.py apps/web/src/lib/types.ts
git commit -m "Store cashier identity on completed orders"
```

### Task 2: Add atomic full-catalog management APIs

**Files:**
- Modify: `apps/api/app/api/routes/catalog.py`
- Modify: `apps/api/app/domains/catalog/service.py`
- Test: `apps/api/tests/catalog/test_catalog.py`
- Test: `apps/api/tests/business_day/test_commit_failure.py`
- Test: `apps/api/tests/orders/test_checkout.py`
- Test: `apps/api/tests/inventory/test_ledger.py`
- Modify: `docs/implementation/api-contract.md`

**Interfaces:**
- Consumes: `manager` dependency, `lock_branch(db)`, `commit_result`, `InventoryItem`, `Variant`, `Modifier`, and `RecipeComponent`.
- Produces strict create/update commands and audited services for categories, products, variations, modifier groups, modifiers, and recipes.

- [ ] **Step 1: Write failing permission, creation, and update tests**

Cover literal outcomes:

```python
command = {
    "name": "Single",
    "price_ngwee": 3500,
    "active": True,
    "recipe": [
        {"item_id": "vanilla-stock", "quantity": "120.000"},
        {"item_id": "napkins", "quantity": "1.000"},
    ],
}
response = client.put("/api/catalog/variants/vanilla-single", headers=manager_headers, json=command)
assert response.status_code == 200
assert response.json()["price_ngwee"] == 3500
assert response.json()["recipe"] == command["recipe"]
assert client.put("/api/catalog/variants/vanilla-single", headers=cashier_headers, json=command).status_code == 403
```

Add the equivalent modifier update and owner permission case. Add creation cases for a category, fully described product, variation, modifier group, and modifier. Assert each new record appears in the manager catalog and becomes available to cashiers only when active.

- [ ] **Step 2: Write failing validation tests**

Use separate cases for malformed or duplicate item code, negative price, blank name or description overflow, missing category/product/group, invalid group selection limits, zero quantity, negative quantity, four decimal places, duplicate `item_id`, missing inventory item, and unknown variant/modifier. After every rejected command, fetch the record and assert the complete catalog and recipe state equals the original literal fixture.

- [ ] **Step 3: Write failing inactive-read tests**

Deactivate one variant and one modifier through the wished-for endpoints. Assert normal catalog reads omit them and `GET /api/catalog?include_inactive=true` returns them with `active: false` for a manager. Assert cashier access to the inactive catalog remains `403`.

- [ ] **Step 4: Write the failing future-sales integration test**

Create one sale with the seeded K22 Single Vanilla and record its order and sale-consumption movements. Call the wished-for update endpoint to change Single Vanilla to K35 with `120.000` ml vanilla and one napkin, then attempt a second sale. Assert the first order remains K22, the second is K35, and only the second movement uses `-120.000` ml. This test must fail at the update request before production code is added.

- [ ] **Step 5: Run catalog tests and verify RED**

Run: `cd apps/api && .venv/bin/pytest tests/catalog/test_catalog.py -q`

Expected: `405 Method Not Allowed` for update requests and missing `active` fields.

- [ ] **Step 6: Define strict request schemas**

In `routes/catalog.py`, add the following recipe/update schema plus focused category, product, modifier-group, and create schemas. Creation schemas require `id` matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`; update schemas never accept `id`.

```python
class RecipeInput(Command):
    item_id: str = Field(min_length=1, max_length=60)
    quantity: Decimal = Field(gt=0, max_digits=16, decimal_places=3)

class CatalogItemUpdate(Command):
    name: str = Field(min_length=1, max_length=100)
    price_ngwee: StrictInt = Field(ge=0, le=2_000_000_000)
    active: StrictBool
    recipe: list[RecipeInput] = Field(max_length=100)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name cannot be blank")
        return value

    @field_validator("recipe")
    @classmethod
    def unique_items(cls, value: list[RecipeInput]) -> list[RecipeInput]:
        if len({row.item_id for row in value}) != len(value):
            raise ValueError("Each inventory item may appear only once")
        return value
```

- [ ] **Step 7: Implement atomic create and update services**

Add private helpers that serialize records, validate parent and inventory references before mutation, replace recipes, and record structured before/after audit metadata. Use explicit actions for category, product, variation, modifier-group, and modifier creation/update. Public functions return the same shapes used by catalog reads.

- [ ] **Step 8: Register manager-only routes**

Add:

```python
@router.put("/variants/{variant_id}")
def put_variant(variant_id: str, command: CatalogItemUpdate, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.update_variant(db, user, variant_id, command))

@router.put("/modifiers/{modifier_id}")
def put_modifier(modifier_id: str, command: CatalogItemUpdate, user=Depends(manager), db=Depends(database)):
    return commit_result(db, service.update_modifier(db, user, modifier_id, command))
```

Register the corresponding category, product, variation-create, modifier-group, and modifier-create routes described in the approved specification. All catalog mutations use the existing manager dependency and `commit_result`.

- [ ] **Step 9: Make manager catalog reads complete**

When `include_inactive` is true, omit active filters for products, variants, and modifiers. Return `active` on every variant and modifier in both read modes.

- [ ] **Step 10: Add rollback coverage**

Force the request commit to raise after the service mutates a variation. In a fresh session assert the original price, active state, and recipe remain. Reuse the existing commit-failure test infrastructure instead of mocking the catalog service.

- [ ] **Step 11: Verify API GREEN**

Run: `cd apps/api && .venv/bin/pytest tests/catalog/test_catalog.py tests/business_day/test_commit_failure.py tests/orders/test_checkout.py tests/inventory/test_ledger.py -q`

Expected: all selected tests pass.

- [ ] **Step 12: Document and commit**

Document both PUT contracts, inactive child behaviour, validation rules, and audit actions in `api-contract.md`.

```bash
git add apps/api/app/api/routes/catalog.py apps/api/app/domains/catalog/service.py apps/api/tests/catalog/test_catalog.py apps/api/tests/business_day/test_commit_failure.py apps/api/tests/orders/test_checkout.py apps/api/tests/inventory/test_ledger.py docs/implementation/api-contract.md
git commit -m "Add audited catalog recipe management"
```

### Task 3: Add typed full-catalog web-client methods

**Files:**
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/lib/client.ts`
- Modify: `apps/web/src/lib/client.test.ts`

**Interfaces:**
- Consumes: Task 2 HTTP endpoints.
- Produces typed create/update inputs, category and modifier-group contracts, `Variant.active`, and `POSClient` methods for every catalog mutation endpoint.

- [ ] **Step 1: Write failing client contract tests**

Assert that create and update methods use the exact endpoint, HTTP method, and JSON command for categories, products, variations, modifier groups, and modifiers. Use complete response fixtures including stable codes, parent identifiers, descriptions, active state, price, and recipe where applicable.

- [ ] **Step 2: Run client tests and verify RED**

Run: `cd apps/web && npm test -- --run src/lib/client.test.ts`

Expected: TypeScript/runtime failure because the methods do not exist.

- [ ] **Step 3: Extend types and `POSClient`**

Add:

```ts
export interface CatalogItemUpdate {
  name: string;
  price_ngwee: number;
  active: boolean;
  recipe: RecipeComponent[];
}
```

Add category and modifier-group types, `category_id` to products, `product_id` and `active` to variants, and `group_id` to modifiers. Add create/update methods returning the corresponding complete type.

- [ ] **Step 4: Implement `ApiClient` methods**

Use the existing authenticated `request` helper with `method: "PUT"` and `JSON.stringify(input)`. Do not duplicate fetch, token, timeout, or error parsing logic.

- [ ] **Step 5: Update complete catalog fixtures and verify GREEN**

Update every variant fixture with `active: true`, then run `cd apps/web && npm test -- --run src/lib/client.test.ts`.

Expected: all client tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/lib/client.ts apps/web/src/lib/client.test.ts
git commit -m "Add typed catalog update client"
```

### Task 4: Build accessible full menu and stock recipe administration

**Files:**
- Create: `apps/web/src/features/CatalogRecipes.tsx`
- Create: `apps/web/src/features/catalog-recipes.test.tsx`
- Modify: `apps/web/src/features/Operations.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `POSClient.catalog(true)`, `POSClient.inventory()`, `updateVariant`, `updateModifier`, `money`, `parseMoney`, `Variant`, `Modifier`, and `InventoryItem`.
- Produces: `CatalogRecipes({client, onChanged, onError})` and an accessible full-replacement recipe editor.

- [ ] **Step 1: Write failing rendering and interaction tests**

Render `CatalogRecipes` with a real in-memory test double implementing the `POSClient` contract. Assert an expandable Vanilla row exposes its description, Single and Double, K22.00, existing ingredient names/quantities, and `aria-expanded`. Open Single, change price to `35.00`, replace `100.000` with `120.000`, add Napkins `1.000`, save, and assert the captured command is exactly:

```ts
{
  name: "Single",
  price_ngwee: 3500,
  active: true,
  recipe: [
    { item_id: "vanilla-stock", quantity: "120.000" },
    { item_id: "napkins", quantity: "1.000" },
  ],
}
```

- [ ] **Step 2: Write failing creation, validation, and modifier tests**

Create a new category, fully described product, variation, modifier group, and modifier through the component and assert exact client commands. Assert duplicate or malformed codes are blocked, duplicate item selection produces an alert and no client call, a zero quantity prevents save, removing every row presents a non-blocking empty-recipe warning, and editing Waffle cone sends `updateModifier` rather than `updateVariant`.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `cd apps/web && npm test -- --run src/features/catalog-recipes.test.tsx`

Expected: module-not-found failure for `CatalogRecipes`.

- [ ] **Step 4: Implement the focused component**

Keep product expansion, dialog type, selected item, draft recipe rows, loading, and save errors inside `CatalogRecipes.tsx`. Use stable draft row identifiers separate from inventory IDs so the user can change a selection without corrupting React keys. Normalize quantities to three decimals only when submitting. Explain item codes in create forms and render them read-only in edit forms.

- [ ] **Step 5: Integrate with Settings**

Replace `MenuAvailability` in `Settings` with `CatalogRecipes`. Keep owner-only staff administration, stand details, payments, audit, and operating guide unchanged. Managers and owners already share the Settings route.

- [ ] **Step 6: Add responsive and accessible styling**

Add focused `catalog-*` and `recipe-*` classes. Use native buttons, labels, select, checkbox, and decimal inputs. Keep action buttons at least 44 pixels high, make recipe rows stack below 760 pixels, and preserve visible focus from the global style.

- [ ] **Step 7: Update manager/owner tour wording**

In `ProductTour.tsx`, state that Settings controls menu prices and the stock used by each variation. Do not add a new tour step.

- [ ] **Step 8: Verify GREEN and integration**

Run: `cd apps/web && npm test -- --run src/features/catalog-recipes.test.tsx src/features/onboarding.test.tsx src/features/staff-accounts.test.tsx`

Expected: all selected tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/CatalogRecipes.tsx apps/web/src/features/catalog-recipes.test.tsx apps/web/src/features/Operations.tsx apps/web/src/features/ProductTour.tsx apps/web/src/App.tsx apps/web/src/styles.css
git commit -m "Add variation price and stock recipe editor"
```

### Task 5: Redesign the operational thermal receipt

**Files:**
- Create: `apps/web/src/features/Receipt.tsx`
- Create: `apps/web/src/features/receipt.test.tsx`
- Modify: `apps/web/src/features/Pos.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: Task 1 `Order.cashier_name` and existing immutable order/payment fields.
- Produces: `Receipt({order}: {order: Order})` and `ReceiptModal` with print-safe 58/80 mm output.

- [ ] **Step 1: Write the failing receipt-content test**

Render a cash order with two Vanilla Single units at K35 each, K100 tendered, and K30 change. Assert the receipt exposes:

```text
Customer Receipt
Order A001
VANILLA-SINGLE
2 x K35.00
K70.00
Cash
K100.00
K30.00
Cashier: Mwamba Manager
Units bought: 2
Operational customer receipt - fiscal integration not configured
```

Assert `Tax Invoice`, `TPIN`, `Smart Invoice`, `SDC`, `MRC`, and `QR` are absent.

- [ ] **Step 2: Write failing external-payment and refund tests**

For mobile money, assert provider/reference appear while cash received/change do not. For a refunded sale, assert `Refunded` and its reason appear. Assert the short sale reference is derived from the order ID and is labelled `Sale reference`.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `cd apps/web && npm test -- --run src/features/receipt.test.tsx`

Expected: module-not-found failure for the focused receipt component or missing required fields.

- [ ] **Step 4: Extract and implement the receipt**

Move receipt rendering out of `Pos.tsx` into `Receipt.tsx`. Use semantic headings, definition-style metadata, line blocks with tabular prices, and text separators represented by borders rather than repeated punctuation. Compute units with `order.lines.reduce((sum, line) => sum + line.quantity, 0)` and use `order.id.slice(0, 8).toUpperCase()` for the internal sale reference.

- [ ] **Step 5: Implement thermal print CSS**

Default `.receipt-print` to 72 mm for 80 mm paper. Add `@media print` rules with `width: 100%`, `max-width: 72mm`, monochrome output, 3 mm margins, non-wrapping amount columns, and safe word wrapping for long product names and references. Ensure the content also fits a 52 mm printable area when the print dialog targets 58 mm paper.

- [ ] **Step 6: Update immediate and historical receipt paths**

Use the same component after checkout and from Sales reprint. Preserve the existing rule that a print failure never removes the saved sale.

- [ ] **Step 7: Verify GREEN**

Run: `cd apps/web && npm test -- --run src/features/receipt.test.tsx src/features/practice-flow.test.tsx`

Expected: all selected tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/Receipt.tsx apps/web/src/features/receipt.test.tsx apps/web/src/features/Pos.tsx apps/web/src/App.tsx apps/web/src/styles.css
git commit -m "Redesign operational customer receipt"
```

### Task 6: Browser, migration, documentation, and release verification

**Files:**
- Modify: `apps/web/e2e/happy-cone.spec.ts`
- Modify: `docs/implementation/project-guide.md`
- Modify: `docs/implementation/deployment-runbook.md`
- Modify: `docs/implementation/release-evidence-template.md`
- Modify: `docs/implementation/progress.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: all deliverables from Tasks 1-5.
- Produces: deployable documentation and end-to-end evidence for receipt printing and recipe management.

- [ ] **Step 1: Extend the owner browser scenario**

After owner sign-in, expand Vanilla in Settings, edit Single to K35 with 120 ml vanilla stock and one napkin, save, and assert the refreshed summary. Run axe against the expanded editor and modal.

- [ ] **Step 2: Extend the sale browser scenario**

Complete a sale using the edited variation. Assert the receipt contains `Customer Receipt`, cashier name, `2 x K35.00` or the exact chosen quantity, sale reference, payment details, and the operational fiscal notice. Assert no ZRA labels appear. Reopen the same receipt from Sales and compare its business values.

- [ ] **Step 3: Add print-width visual evidence**

Use Playwright print-media emulation and screenshots at 58 mm and 80 mm equivalent viewports. Assert `document.documentElement.scrollWidth <= window.innerWidth` and no receipt amount cell exceeds its receipt container.

- [ ] **Step 4: Run the focused browser scenario and verify RED/GREEN**

Run: `cd apps/web && PATH=/tmp/happycone-node/node_modules/node/bin:$PATH npm run test:e2e`

Expected: all browser scenarios pass with zero axe violations.

- [ ] **Step 5: Update operating documentation**

Document manager recipe editing, historical-price behaviour, cashier snapshots, thermal print setup, and the explicit non-fiscal boundary. Add the new migration to deployment/rollback instructions and release evidence.

- [ ] **Step 6: Run complete verification**

Run:

```bash
cd apps/api && .venv/bin/pytest -q
cd ../web && npm test
npm run build
PATH=/tmp/happycone-node/node_modules/node/bin:$PATH npm run test:e2e
cd ../.. && git diff --check
```

Expected: API, web, build, browser, accessibility, and whitespace checks all pass.

- [ ] **Step 7: Verify a production-style migration**

Against an isolated PostgreSQL 16 Compose volume, run `python -m app.cli migrate`, inspect that Alembic reports revision `0002_order_cashier_name`, complete one sale, and verify its order response contains the cashier snapshot. Do not reuse or delete the operator's development volume.

- [ ] **Step 8: Commit the release evidence**

```bash
git add apps/web/e2e/happy-cone.spec.ts README.md docs/implementation
git commit -m "Document receipt and catalog management release"
```

- [ ] **Step 9: Review final history and publish**

Run `git status --short --branch`, inspect every commit and `git diff origin/main...HEAD --check`, then push the verified commits to `origin/main`.
