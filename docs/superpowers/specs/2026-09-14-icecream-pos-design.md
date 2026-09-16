# Lusaka Ice-Cream POS — System Design

**Date:** 2026-09-14
**Status:** Approved architecture for implementation
**Primary deployment:** Single ice-cream stand, extensible to multiple outlets later

## 1. Purpose

Build a device-independent POS and stand-operations system that combines cashier ordering, customer/server ticketing, payments, recipe-level inventory, explicit business-day control, auditability and management reporting without requiring complicated proprietary POS hardware.

## 2. Core operating flow

1. Manager/cashier opens the business day and records opening cash float.
2. Cashier creates an order from large touch-friendly menu controls.
3. Cashier selects variants/modifiers such as scoop count, cup/cone and toppings.
4. System prices the order deterministically from the configured catalog.
5. Payment is captured/recorded.
6. Successful checkout creates a permanent sale/order record and customer ticket.
7. The same order appears on the server/preparation screen in realtime.
8. Recipe components are deducted through inventory ledger movements.
9. Server moves order through `NEW -> PREPARING -> READY -> SERVED`.
10. At day close, the system summarizes payment totals, expected cash, actual cash and variance and freezes the business-day close record.

A sale is the central business event. Ticketing, stock and reporting must derive from the recorded order/payment rather than separate manual updates.

## 3. Users and permissions

### CASHIER
- Open/operate assigned shift/business day subject to policy.
- Create orders and take payments.
- Reprint permitted tickets/receipts.
- Cannot edit product prices, silently alter stock or delete completed sales.

### SERVER
- View preparation queue.
- Transition eligible orders through preparation statuses.
- Cannot alter financial details.

### MANAGER
- Product/menu availability.
- Receive stock and record waste/adjustments/counts.
- Approve voids/refunds where configured.
- Open/close business day.
- View operational reports.

### OWNER_ADMIN
- Full reporting, users, configuration and future branch-level administration.

## 4. Order and ticket model

### Default mode
Customer ticket + server display.

### Customer ticket
Contains:
- short public order number such as `A042`,
- date/time,
- item summary,
- payment status,
- total,
- optional QR/barcode/reference.

### Server/preparation view
Contains:
- order number,
- exact items, variants and modifiers,
- preparation notes,
- payment-confirmed indicator,
- order age,
- status controls.

### Alternative modes
Architecture must permit:
- customer ticket + printed server ticket,
- two printed tickets,
- fully digital ticketing.

The ticket renderer/dispatcher is therefore separate from the order domain.

## 5. Catalog and recipes

Model:

`Category -> Product -> Variant -> Modifier Groups/Modifiers -> Recipe`

Example:

- Category: Ice Cream
- Product: Vanilla
- Variant: Double Scoop
- Serving modifier: Cone
- Topping modifier: Oreo

The sellable configuration maps to consumable components. Example recipe consumption:
- vanilla ice cream: 160 ml
- cone: 1 piece
- Oreo crumb: 20 g
- napkin: 1 piece

Products can be temporarily unavailable without deleting them.

## 6. Inventory model

Inventory items may be ingredients, packaging, ready-made resale goods or consumables.

Supported base units should include piece, ml, litre, g, kg, pack, box/carton with explicit conversion rules where required.

Inventory is ledger based. Movement types:
- `RECEIPT`
- `SALE_CONSUMPTION`
- `WASTE`
- `ADJUSTMENT_IN`
- `ADJUSTMENT_OUT`
- `RETURN_IN`
- `RETURN_OUT`
- `STAFF_USE`
- future `TRANSFER_IN`/`TRANSFER_OUT`

Never change on-hand stock without writing a movement.

A physical stock count records counted quantity and variance against expected quantity; variance adjustments require attribution and audit trail.

## 7. Payments

Checkout uses a payment abstraction.

Initial payment methods:
- Cash
- Mobile money (manual/reference recording initially)
- Card/manual external terminal record

Future adapters may support direct MTN/Airtel/Zamtel/Zed Mobile/aggregator/card/QR/bank callbacks.

Payment state is separate from provider state. Suggested normalized states:
- `PENDING`
- `CONFIRMED`
- `FAILED`
- `CANCELLED`
- `REFUNDED`
- `PARTIALLY_REFUNDED`

Provider-specific payloads must not leak into core order logic.

## 8. Printing

Printing is optional infrastructure, not a precondition for a sale.

Targets:
- browser print fallback,
- 58 mm thermal,
- 80 mm thermal (preferred),
- later local print bridge/Bluetooth/Wi-Fi ESC/POS adapter.

Ticket/receipt generation produces a neutral render model which printing adapters consume.

## 9. Business day and cash reconciliation

A branch has explicit business-day records.

On open:
- opened by,
- opened at,
- opening float.

During day:
- payments are assigned to the open business day,
- cash movements outside sales/refunds use explicit cash-movement records.

At close:
- gross sales,
- discounts,
- voids/refunds,
- payment-method totals,
- cash sales,
- opening float,
- non-sale cash movements,
- expected cash,
- actual cash counted,
- cash variance,
- order count,
- average order value.

Closed business days are immutable except through controlled administrative correction records.

## 10. Auditability

Audit log records security/business-sensitive actions including:
- login/security events where appropriate,
- price/configuration changes,
- stock receipt/adjustment/waste/count,
- void/refund approval,
- business-day open/close,
- manual payment confirmation,
- user/role changes.

Completed orders/sales are never hard-deleted through normal product workflows.

## 11. Offline behavior

The PWA caches:
- application shell,
- active catalog/menu,
- relevant configuration,
- locally created cash orders pending sync.

Offline cash sales receive globally reconcilable client-generated identifiers and local sequence/ticket identifiers. The server validates idempotency on sync.

Network-dependent mobile-money/card integrations may be disabled while offline rather than pretending they succeeded.

Conflict policy must favor financial/inventory integrity over silent merging.

## 12. Reporting

MVP reports:
- daily sales summary,
- sales by payment method,
- sales by product/variant,
- order count and average order value,
- cash expected vs actual,
- inventory movement ledger,
- current expected stock,
- waste,
- stock-count variance,
- basic top-selling products.

Later reports may add margin, COGS, hourly trends and forecasting.

## 13. ZRA Smart Invoice boundary

Create a fiscal-integration interface at the application boundary. The initial MVP may use a no-op/not-configured implementation, but order/domain objects should expose clean invoiceable sale data so a future Zambia Revenue Authority Smart Invoice/VSDC adapter can be added without rewriting checkout.

Do not claim fiscal compliance until an actual approved integration/configuration exists.

## 14. Technical architecture

### Monorepo

- `apps/web` — React + TypeScript + Vite PWA
- `apps/api` — FastAPI service
- `packages/shared` — shared contracts/types where beneficial

### Backend domains

- identity/access
- catalog
- orders
- payments
- tickets
- inventory
- business days/cash
- reporting
- audit
- integrations (print/fiscal/payment providers)

HTTP routes must be thin; business behavior belongs in domain/application services.

### Database
PostgreSQL with SQLAlchemy and Alembic.

Critical writes such as checkout + stock movements should use database transactions.

Money: Decimal at domain/API boundaries and fixed numeric/integer minor units in storage policy; never float.

Time: UTC persistence with configured branch timezone for business-day grouping/display.

### Realtime
WebSocket (or equivalent) events notify preparation clients of new orders/status changes. Database remains source of truth; realtime events are hints, not the only copy of state.

## 15. Reliability and security requirements

- Passwords hashed using a modern password-hashing library.
- Authenticated API; authorization enforced server-side.
- Idempotency key for checkout/payment confirmation and offline sync mutation paths.
- Optimistic/concurrency protection on order status and stock-sensitive operations where necessary.
- Structured error responses.
- Secrets only through environment configuration.
- Database constraints for money/status/foreign-key integrity.
- Audit correlation IDs for important mutations.

## 16. MVP boundary

The MVP includes:
- authentication and four roles,
- catalog/products/variants/modifiers/recipes,
- inventory items/movements/receiving/waste/counts,
- explicit business-day open/close,
- cashier POS,
- cash + manual external-payment recording,
- customer ticket,
- realtime server queue,
- preparation statuses,
- simple browser/thermal-friendly print layout,
- daily/cash/stock reports,
- audit log,
- offline-capable PWA foundation.

Not in MVP:
- loyalty,
- customer accounts,
- delivery,
- advanced procurement,
- multi-warehouse transfers,
- advanced forecasting,
- QR self-ordering,
- direct production payment gateway integration,
- production ZRA certification/integration,
- full multi-branch control plane.

## 17. Acceptance scenario

The MVP is successful when a cashier can:

1. sign in,
2. open the day with K500 float,
3. sell a double vanilla cone with Oreo,
4. record K50 cash against a K42 order and see K8 change,
5. issue order ticket A042,
6. have A042 appear on the server screen,
7. have vanilla/cone/Oreo/napkin stock deducted by the configured recipe,
8. let the server mark it preparing, ready and served,
9. record waste or new stock independently,
10. close the day with payment totals and cash variance,
11. retrieve the sale and inventory movements later with a full audit trail.
