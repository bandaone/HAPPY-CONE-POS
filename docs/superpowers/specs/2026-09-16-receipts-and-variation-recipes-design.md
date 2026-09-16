# Happy Cone receipts and variation stock recipes

**Date:** 16 September 2026  
**Status:** Approved for implementation planning  
**Scope:** Operational customer receipts, catalog pricing, and recipe-based stock configuration

## Purpose

Happy Cone needs a thermal customer receipt that follows the clear hierarchy of the supplied retail receipt while remaining honest about the system's current fiscal status. Managers also need to maintain the selling price and stock consumption for each product variation from the same administration workflow.

The finished workflow will let a manager state that a Single Vanilla costs K35 and consumes a defined amount of vanilla ice cream and one napkin. The API will use that recipe for stock consumption on every future sale. Historical sales will retain the product name and price recorded when they were completed.

## Boundaries

This release produces an operational customer receipt. It does not create or imitate a ZRA Smart Invoice. The receipt must not display a TPIN, Smart Invoice number, fiscal signature, SDC identifier, MRC identifier, tax calculation, verification QR code, or the heading `Tax Invoice` unless a later approved fiscal integration supplies authentic values.

The catalog editor will create and update categories, products, variations, modifier groups, modifiers, and their inventory recipes. Inventory ingredients continue to be created through inventory administration; this release selects from those existing stock records when defining a sale recipe.

Catalog records that may already appear in a sale are never hard-deleted. Managers archive products, variations, and modifiers by making them unavailable. Stable item codes cannot be changed after creation because they identify historical order lines, recipes, and audit records.

## Roles and access

| Capability | Cashier | Server | Manager | Owner administrator |
| --- | --- | --- | --- | --- |
| View active products and prices | Yes | Yes | Yes | Yes |
| Print or reprint an authorised receipt | Yes | No | Yes | Yes |
| View inactive catalog records | No | No | Yes | Yes |
| Create and edit categories or modifier groups | No | No | Yes | Yes |
| Create and edit products and descriptions | No | No | Yes | Yes |
| Create or edit variation price, availability, or recipe | No | No | Yes | Yes |
| Create or edit modifier price, availability, or recipe | No | No | Yes | Yes |

The API remains the enforcement boundary. Hiding an editor in the web interface is not considered access control.

## Operational receipt

### Content

The receipt presents the following information in this order:

1. Happy Cone Ice Cream identity and Lusaka stand.
2. `Customer Receipt` heading.
3. Local date and time in `Africa/Lusaka`.
4. Order number and a shortened sale reference derived from the stored order identifier.
5. One block per order line with the variation identifier, recorded product and variation name, modifiers, quantity, unit price, and line total.
6. Sale total, payment method, amount received, and change where applicable.
7. Cashier name and total units bought.
8. Refund status and reason when the receipt represents a refunded sale.
9. Customer hand-off message and the statement `Operational customer receipt - fiscal integration not configured`.

The sale reference is for internal lookup only. It must not be labelled as a fiscal, tax, Smart Invoice, or ZRA reference.

### Data contract

Order responses will add `cashier_name`. Checkout stores the cashier's display name on the order so a later staff-account rename cannot rewrite an older receipt. Existing response fields provide the order identifier, order number, time, recorded line names, variant identifiers, quantities, unit prices, totals, payment details, and refund state.

The API continues to return historical order lines from the sale record. Receipt rendering must never resolve current catalog names or prices for an older sale.

### Print presentation

The browser receipt view remains readable on screen and prints as a single narrow column. Print styles support both 58 mm and 80 mm printers without clipped amounts or wrapped totals. The design uses high-contrast black text, dashed separators, tabular numbers, and a compact type scale. The Happy Cone logo may print when graphics are enabled, but all required business information remains understandable if the printer omits images.

No QR code is included because the system has no public receipt-verification destination. A future fiscal integration can add its authorised QR payload without changing the operational receipt fields.

## Catalog and recipe administration

### Management interface

Settings will replace the simple availability table with a `Menu and stock recipes` section. The section includes clear actions to add a category, product, variation, modifier group, or modifier. Products appear as compact expandable rows showing category, customer description, status, and variation count. Expanding a product reveals each variation with:

- variation name;
- active or unavailable status;
- selling price in Zambian kwacha;
- recipe summary using inventory item name, quantity, and unit;
- an `Edit variation` action.

Product editing includes a stable item code, name, category, customer-facing description, display colour, and availability. Variation editing includes a stable item code, name, selling price, availability, and recipe. Creation forms explain where each value appears on the cashier screen and receipt. Item codes are trimmed, lowercase identifiers containing letters, numbers, and hyphens; they become read-only after creation.

Serving choices and toppings appear in named modifier groups because they contribute price and stock independently of the base variation. Authorised staff can create and edit the group name and its minimum and maximum selections. Each modifier uses the same stable code, price, status, recipe summary, create, and edit pattern.

The edit dialog contains the selling price, availability, and a recipe builder. A recipe row contains an inventory item selector, positive quantity input, unit label, and remove action. `Add ingredient` appends another row. The interface prevents selecting the same inventory item twice and gives a clear empty-recipe warning before submission. Empty recipes remain valid for items that intentionally consume no tracked stock.

The editor displays the current data from the API and submits one complete replacement command. It does not apply partial recipe-row mutations in the browser.

### API

Manager-protected endpoints will be added:

```text
POST /api/catalog/categories
PUT  /api/catalog/categories/{category_id}
POST /api/catalog/products
PUT  /api/catalog/products/{product_id}
POST /api/catalog/products/{product_id}/variants
PUT /api/catalog/variants/{variant_id}
POST /api/catalog/modifier-groups
PUT  /api/catalog/modifier-groups/{group_id}
POST /api/catalog/modifier-groups/{group_id}/modifiers
PUT /api/catalog/modifiers/{modifier_id}
```

Create commands include the stable item code. Update commands omit it. Duplicate codes return `409`. A product requires an existing category, a variation requires an existing product, and a modifier requires an existing modifier group. Group limits must satisfy `0 <= minimum <= maximum <= 20`. Products, variations, and modifiers use availability instead of deletion.

Variation command:

```json
{
  "name": "Single",
  "price_ngwee": 3500,
  "active": true,
  "recipe": [
    {"item_id": "vanilla-stock", "quantity": "120.000"},
    {"item_id": "napkins", "quantity": "1.000"}
  ]
}
```

Modifier commands use the same shape. Names are trimmed and length-limited. Prices are non-negative integer ngwee. Recipe quantities must be positive decimals with at most three fractional places. Inventory item identifiers must exist and may appear only once per command. Unknown catalog records return `404`; invalid input returns `422`; unauthorised roles return `403`.

Each update runs in one database transaction under the existing branch mutation lock. The service updates the catalog record, replaces its recipe components, and creates an audit event containing structured before and after values. If any validation, database, or audit operation fails, none of the catalog or recipe changes commit.

### Catalog reads

Normal `GET /api/catalog` responses continue to include active products, active variations, and active modifiers only. Manager and owner calls using `include_inactive=true` will include category identifiers, modifier-group definitions, inactive variations, and inactive modifiers as well as inactive products. Product objects include `category_id`; variant and modifier objects include their `active` state so the editor can render it directly.

### Stock behaviour

Checkout pricing remains server-owned. The quote and checkout services use the current variation and modifier prices. Completed order lines preserve the accepted unit price and display name.

On checkout, recipe quantities for the selected variation and modifiers are multiplied by the sold quantity and aggregated per inventory item. Existing stock sufficiency checks and append-only sale-consumption movements remain unchanged. Recipe edits affect future quotes and sales only; they do not rewrite prior stock movements.

## Errors and concurrent changes

The edit dialog remains open when a save fails and shows the API's safe error message. After a successful save, the web client reloads the catalog and inventory data before confirming success.

The first release uses last-write-wins semantics under the branch lock. The audit log preserves both updates when two authorised users save the same record sequentially. Optimistic version checks are deferred until multiple simultaneous administration terminals demonstrate a need for them.

If a variation becomes unavailable while it is already in a cashier's cart, the server rejects quote or checkout with the existing unavailable-item response. The cashier refreshes the menu and rebuilds the affected line.

## Accessibility and first-time use

- Expandable product rows use buttons with `aria-expanded` and clear accessible names.
- Every recipe control has a visible label; unit text is associated with its quantity input.
- Add, remove, save, and cancel actions are keyboard operable with visible focus.
- Validation errors use the existing alert pattern and identify the affected recipe row.
- Price and quantity meaning never relies on colour.
- Touch targets remain at least 44 by 44 CSS pixels.
- Receipt information remains readable when the logo is unavailable and at browser zoom up to 200 percent.
- The product tour's manager and owner guidance will mention that prices and sale consumption are maintained in Settings.

## Testing

### API tests

- Manager and owner can update a variation and modifier.
- Manager and owner can create and edit categories, products, variations, modifier groups, and modifiers.
- Cashier and server cannot call any catalog mutation endpoint.
- Duplicate or malformed item codes and missing parent records are rejected without partial changes.
- Existing item codes cannot be renamed, and catalog records used by sales are archived rather than deleted.
- Cashier and server receive `403` for both update endpoints.
- Invalid price, zero or negative quantity, excess precision, duplicate item, and missing inventory item are rejected without partial changes.
- Manager catalog reads include inactive variants and modifiers; ordinary reads exclude them.
- Audit metadata records the complete before and after state.
- A sale after an edit uses the new price and consumes the new recipe.
- An earlier sale and its stock movements remain unchanged after an edit.
- A forced commit failure rolls back catalog and recipe updates.
- Order responses include the cashier name captured when the sale was completed and preserve it after an account rename.

### Web tests

- The editor loads existing price, availability, recipe quantities, and units.
- Adding and removing recipe rows produces one complete update command.
- Duplicate inventory selections and invalid quantities are blocked with understandable errors.
- Successful save refreshes the displayed catalog.
- Cashier and server workspaces do not expose catalog editing.
- Receipt output shows item code, quantity, unit price, line total, payment detail, cashier, and operational fiscal notice.
- Refunded receipts show their status and reason.

### Browser and print verification

- Complete a sale, open its receipt immediately, and reprint it from Sales.
- Verify 58 mm and 80 mm print previews for clipping and overflow.
- Run accessibility checks on the catalog editor and receipt dialog.
- Verify desktop, tablet, and phone administration layouts.
- Confirm existing checkout, offline sync, preparation, reporting, and staff-administration scenarios still pass.

## Release and migration

The existing catalog tables already hold price, active state, and recipe components, so catalog editing needs no schema change. A migration will add a non-null `cashier_name` snapshot to orders. Existing rows will be backfilled from their linked staff account during migration; new checkouts will store the current display name directly.

The release updates the API contract, project guide, automated tests, and release evidence. Deployment uses the normal application build and restart. No seed rerun is required, and existing catalog and inventory data remain intact.
