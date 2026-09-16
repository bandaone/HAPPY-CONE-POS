# AGENTS.md — Ice-Cream POS

## Mission
Build a fast, reliable POS for a Lusaka ice-cream stand. It must work on ordinary phones, tablets, laptops and desktops, support simple thermal printing, accommodate multiple payment providers, track recipe-level stock, maintain strong sales records, and be easy for cashiers and servers to use.

## Non-negotiable product rules

1. The primary client is a responsive web/PWA application. Do not make dedicated POS hardware mandatory.
2. The default ticketing mode is: **customer ticket + realtime server screen**. Architecture must also permit two printed tickets or fully digital tickets later.
3. Order status lifecycle is `NEW -> PREPARING -> READY -> SERVED`, with cancellation/void/refund handled separately.
4. Completed sales are never deleted. Corrections use audited void/refund flows.
5. Inventory is recipe/component based, not merely finished-product counts.
6. Stock movements are ledger entries. Never silently overwrite stock balances.
7. A business day has explicit OPEN and CLOSE operations, opening float, payment totals, expected cash, actual cash and variance.
8. Roles: `CASHIER`, `SERVER`, `MANAGER`, `OWNER_ADMIN`.
9. Payment providers are adapters behind a payment interface. Do not couple checkout directly to MTN, Airtel, a card gateway, or any single aggregator.
10. Printing is an adapter. Core order completion must not depend on a printer being online.
11. Offline mode should permit menu access, local order capture and cash sales with later sync. Network-dependent payments may be unavailable offline.
12. Prepare an integration boundary for Zambia Revenue Authority Smart Invoice/VSDC, but do not hard-code fiscal logic into the order domain.

## Delivery discipline

- Follow the implementation plan in `docs/superpowers/plans/2026-09-14-icecream-pos-roadmap.md` task by task.
- Use TDD for domain logic and API behavior.
- Keep files focused. Split by domain responsibility.
- Do not add loyalty, customer accounts, delivery, multi-branch warehouse logic, AI forecasting, QR self-ordering or advanced procurement until the core MVP is working and tested.
- Prefer explicit domain services and repositories over business logic embedded in HTTP routes or React components.
- Every mutation affecting money, stock, permissions or order state must be auditable.
- Money must use decimal/integer minor-unit representation; never binary floating point.
- Use timezone-aware timestamps. Business reporting should operate in the configured branch timezone.

## Repository direction

- `apps/api`: FastAPI service
- `apps/web`: React/Vite PWA
- `packages/shared`: shared contracts/types generated or maintained deliberately
- `docs/superpowers/specs`: approved design
- `docs/superpowers/plans`: implementation plans

## Definition of MVP success

A cashier can open a business day, sell a configured ice-cream product, accept/record a payment, issue a customer ticket, cause the order to appear instantly on the server queue, have recipe ingredients deducted, mark the order served, close the business day, and see accurate sales/cash/stock records with an audit trail.
