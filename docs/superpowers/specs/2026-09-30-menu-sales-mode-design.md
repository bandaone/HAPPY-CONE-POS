# Happy Cone Menu and Sales Mode Design

**Date:** 2026-09-30  
**Status:** Approved conversational design, pending written-spec review

## Purpose

Happy Cone needs a production-ready counter system that can be used immediately without first setting up or maintaining inventory. Owners and managers must be able to build the real menu, set prices and choices, and control availability. Cashiers must be able to record and print sales quickly using Cash, Mobile money, or Card.

This release turns the application into a focused **Menu and Sales mode**. Inventory data and code remain available for future work, but stock counts, stock recipes, deductions, adjustments, and low-stock rules do not affect daily operation.

## Success Criteria

1. An owner or manager can create and edit the full Happy Cone menu without understanding stock recipes or internal catalog terms.
2. A cashier can add a simple item with one tap and complete a Mobile money or Card sale by tapping the chosen payment method once from the payment window.
3. Mobile money and Card sales store the method, sale amount, cashier, and time without provider, phone, terminal, card, approval, or transaction-reference details.
4. Cash sales calculate change from the amount received.
5. Every accepted sale appears in Sales and daily reports and can be reprinted.
6. Completed sales never depend on stock availability and never create stock movements while Menu and Sales mode is active.
7. Receipts contain the required business and sale information without tax treatment, tax rate, calculated tax, serving-ticket language, or external payment details.
8. Existing sales, audit records, archived catalog records, and inventory records survive the migration unchanged.

## Roles and Permissions

- **Cashier:** view the available menu, build a sale, take payment, print or reprint permitted receipts, and view the normal cashier sales workflow.
- **Manager:** all cashier functions plus menu administration, availability, prices, reports, refunds, and the existing operational controls assigned to managers.
- **Owner administrator:** all manager functions plus owner-level account and system administration.
- Inventory screens are removed from normal navigation for every role in this release. Inventory APIs remain protected by their existing manager authorization for future recovery or reactivation.

## Operating Mode

Add a persisted `inventory_tracking_enabled` setting to stand settings. Its production default and migration value are `false`. It is not exposed as a casual user-facing toggle in this release.

When the setting is `false`:

- available catalog items may have no stock recipe;
- quoting and checkout use catalog prices and choices only;
- checkout does not check expected stock;
- checkout does not create `SALE_CONSUMPTION` movements;
- menu administration does not show recipe controls;
- stock navigation and stock screens are hidden.

The existing inventory tables, movements, counts, recipes, and API routes are retained. Re-enabling inventory is future work that must include a stock-readiness check rather than merely changing the flag.

## Menu Model

The existing category, product, variant, modifier-group, modifier, and sale-line records remain the catalog foundation so sales history does not need to be rewritten.

### Sellable items

A product represents the item the cashier recognizes on the printed menu, such as:

- Single Scoop
- Double Scoop
- Triple Scoop
- Classic Soft Serve Cone
- Soft Serve Cup
- Chocolate Dip Cone
- Happy Mix
- Strawberry Delight

A normal item has one hidden default price record. The administration interface calls this the item's price and does not expose the technical word “variation.” Items that genuinely have different price choices may enable an optional **Price choices** section.

Each product stores its category, name, short description, display colour, availability, and one or more prices. Owners and managers can archive and restore items. Historical items that appear in sales cannot be destructively removed.

### Choice sets

Add a `product_modifier_groups` association between products and reusable choice sets. The association stores:

- product ID;
- modifier-group ID;
- minimum selections for that product;
- maximum selections for that product;
- display position.

This prevents a global choice such as “Serve in” from appearing on unrelated products. The same reusable choice set can be attached to several relevant menu items with different requirements.

Examples:

- Single Scoop: exactly one Flavour, exactly one Serve in choice, optional Toppings.
- Double Scoop: exactly two Flavour selections, exactly one Serve in choice, optional Toppings.
- Triple Scoop: exactly three Flavour selections, exactly one Serve in choice, optional Toppings.
- Soft Serve Cup: no serving-container question; optional Toppings only if the business enables it.
- A fixed special: no choices unless that special actually permits them.

A choice may be selected more than once when appropriate. A Double Scoop can therefore record Vanilla twice or Vanilla plus Strawberry. Repeated choices contribute their price adjustment once per selection. The checkout request keeps the existing modifier selection list but permits duplicate IDs and raises the safe selection limit enough for triple scoops plus serving and toppings. The receipt and sale snapshot display repeated selections clearly, for example `Vanilla ×2`.

### Menu administration

Replace the technical “Menu and stock recipes” interface with a **Menu** page for managers and owners.

The primary interface contains:

- category filters;
- a searchable list of menu items;
- clear Available/Archived status;
- Add menu item;
- Edit;
- Archive or Restore;
- Manage categories;
- Manage choices.

The default Add/Edit item form asks only for:

1. item name;
2. category;
3. selling price;
4. availability;
5. applicable choices and how many the cashier must select.

Description, display colour, multiple prices, and advanced choice configuration remain optional and collapsed. No stock item, unit, quantity, recipe, or low-stock field appears.

Choice management uses business language:

- **Choice set:** Flavour, Serve in, Toppings, or another meaningful label.
- **Choice:** Vanilla, Regular Cone, Cup, Chocolate Sauce, and similar selections.
- **Extra price:** the additional amount, including zero.
- **Available:** whether cashiers may select it now.

Archived items and choices remain editable and restorable. Deletion is offered only when an archived record has no sales-history dependency; otherwise the interface explains that it must remain archived.

## Cashier Sale Flow

The cashier page retains large touch targets and the visible current-sale panel.

1. The cashier taps a menu card.
2. If the item has no required or optional choices, it is added immediately.
3. If choices apply, one compact window displays only the choice sets attached to that item.
4. The interface shows remaining required selections and prevents adding the item until all minimums are met.
5. Repeated choices use visible plus/minus controls and a quantity badge.
6. The cashier can change line quantity or remove a line from the current sale.
7. The cashier taps **Take payment** when the sale is ready.

The preparation-note field is removed from the primary flow because it slows routine service. Existing historical notes remain readable. If retained for exceptional use, it is placed behind a clearly optional secondary action and never blocks checkout.

## Payment Flow

The payment window shows the total and three large methods.

### Cash

Tapping Cash reveals the amount-received field, quick tender buttons, and calculated change. The cashier confirms the cash sale after the amount received covers the total.

### Mobile money

Tapping Mobile money immediately submits the sale using `MOBILE_MONEY_MANUAL`. The request contains the payment method only; the server derives the payment amount from the authoritative sale total and records the cashier and timestamp.

### Card

Tapping Card immediately submits the sale using `CARD_MANUAL`. The request contains the payment method only; the server derives the payment amount from the authoritative sale total and records the cashier and timestamp.

No screen or API contract requires provider, phone number, terminal name, card number, approval code, or transaction reference. Existing nullable payment columns remain for historical compatibility, but new payments normalize `provider` and `reference` to `NULL`. External-reference duplicate checking is removed; checkout idempotency remains the duplicate-sale protection.

User-facing labels are **Cash**, **Mobile money**, and **Card** everywhere, including reports. Internal enum names may remain unchanged to avoid an unnecessary data migration.

## Sale Integrity and Recovery

Checkout remains one database transaction: the order, sale lines, payment, and audit record either commit together or do not commit. The server remains the authority for prices and totals.

The existing idempotency key and checkout journal remain in use. While a submission is unresolved, the cart is locked and the cashier is directed to recover the saved payment. Retrying the same accepted request returns the original sale instead of creating a duplicate.

A browser-print failure never reverses or removes an accepted sale. The receipt can be opened again from Sales.

The Windows computer can operate without internet access. Devices on its private local network can use every payment method while they can reach the local Happy Cone server. If a browser loses its connection to the local server, the existing offline queue remains limited to Cash; Mobile money and Card require a live connection to the local server so their final result is known immediately.

## Receipt

The application prints one ordinary customer receipt. It does not produce a serving ticket or server notification.

The receipt contains:

- Happy Cone logo;
- legal business name;
- shop or branch name;
- location;
- TPIN;
- contact number;
- date and time;
- receipt number;
- purchased items, selected choices, quantity, unit price, and line total;
- sale total;
- payment method;
- cash received and change for Cash only;
- cashier name;
- editable receipt footer.

The receipt does not contain:

- “Customer receipt” as a headline;
- tax category or tax treatment;
- tax rate;
- calculated tax amount;
- provider or terminal;
- transaction or payment reference;
- order/serving queue number;
- serving instructions;
- redundant fiscal or workflow explanations.

The receipt-settings screen retains editable business name, branch, location, TPIN, contact number, paper width, and footer. Tax-category and tax-rate controls are removed from the visible interface. Existing tax fields may remain in storage for compatibility but are not printed or used in this mode.

## Reports and Sales Records

Daily reports continue to show:

- gross and net sales;
- refunds;
- sale count and average sale;
- totals by Cash, Mobile money, and Card;
- product performance;
- cash reconciliation.

The Sales view continues to show receipt number, time, status, payment method, total, cashier in the sale detail, receipt reprint, and controlled refund actions. Reports use the simplified payment labels without “manual.”

## API and Migration

The migration will:

1. add `inventory_tracking_enabled` with a false default and set existing stand settings to false;
2. add `product_modifier_groups` with foreign keys, selection limits, ordering, and uniqueness per product/group;
3. associate every existing product with its existing global modifier groups using the groups' current limits, preserving current checkout behaviour until an owner edits those associations;
4. retain all catalog IDs, sale lines, payment records, inventory records, and audit data;
5. retain nullable provider/reference columns but stop populating them.

Catalog validation allows an active item with an empty recipe while inventory tracking is disabled. Checkout choice validation uses only the groups associated with the selected product. Unknown, unavailable, unrelated, excessive, or insufficient choices produce a clear validation response and do not create a sale.

The web client receives each product's attached choice sets in the catalog response. New focused menu-administration endpoints may orchestrate the existing product and default-price records atomically so a failed item creation cannot leave a half-created product.

## Accessibility and Counter Usability

- Every action remains keyboard reachable with a visible focus indicator.
- Touch targets meet a minimum practical size of 44 by 44 CSS pixels.
- Payment methods use text and icons rather than colour alone.
- Required choice counts are announced in visible text and through accessible status messaging.
- Modal focus is trapped correctly and returns to the triggering item.
- Errors appear next to the relevant action and in an announced error region.
- Receipt output remains readable at both 58 mm and 80 mm paper widths.
- The interface uses direct Happy Cone language and avoids technical inventory, recipe, variant, provider, and manual-payment wording.

## Verification

### API tests

- create and edit an item with no stock recipe in Menu and Sales mode;
- attach product-specific choice sets and enforce their minimum and maximum selections;
- accept repeated flavour selections and price them correctly;
- reject an option not attached to the product;
- complete Cash, Mobile money, and Card sales without external payment details;
- confirm provider and reference are null for new non-cash sales;
- verify idempotent retry returns the original sale;
- verify checkout creates no stock check or movement while tracking is disabled;
- verify reports and refunds retain correct method totals;
- verify migration preserves existing records and associations.

### Web tests

- menu-item creation and editing with only plain business fields;
- archived item editing and restoration;
- one-tap add for items without choices;
- required, optional, and repeated choices;
- one-tap Mobile money and Card submission from the payment window;
- Cash received and change calculation;
- receipt contents and explicit absence of removed tax/payment wording;
- role-based Menu access;
- keyboard, focus, and accessible-name coverage for changed controls.

### Release verification

Run the complete API and web test suites, production web build, database migration smoke test, and end-to-end browser checkout for all three payment methods. Render or print-test both 58 mm and 80 mm receipts. Rebuild the offline Windows package only after these checks pass, then verify a clean installation and an upgrade that preserves an existing database.

## Out of Scope for This Release

- stock receiving, counts, waste, adjustments, low-stock alerts, or automatic deductions;
- supplier and purchase-order management;
- fiscal-device integration or certified fiscal-invoice claims;
- payment-provider API integration;
- storage of customer phone, card, provider, terminal, approval, or transaction-reference data;
- serving tickets, server screens, kitchen queues, or spoken-order automation;
- internet hosting or multi-branch synchronization.
