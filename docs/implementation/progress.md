# Happy Cone MVP implementation ledger

Plan: `docs/superpowers/plans/2026-09-14-icecream-pos-roadmap.md`

User authorized the complete MVP and a professional, use-case-specific interface on 2026-09-14. That authorization superseded the starter prompt's Task 1 review stop.

## Delivery status

All 15 roadmap tasks are implemented in source:

1. Development foundation, health checks, Dockerfiles, Compose, Nginx, migration and operating scripts.
2. Password authentication, opaque hashed sessions, logout, expiry and cashier/server/manager/owner authorization.
3. Catalog, variants, serving choices, toppings, recipes and manager-controlled availability.
4. Append-only inventory movements, receiving, waste, adjustments, physical counts and low-stock visibility.
5. Serialized business-day open/close, signed cash movements and immutable close snapshots.
6. Server-priced order quotes and atomic, idempotent checkout using integer ngwee.
7. Cash, manually confirmed mobile-money/card records, change calculation and payment validation.
8. Responsive cashier counter with search, customization, cart preservation and payment recovery.
9. Customer/provisional tickets, print styles, reprint flow and non-blocking printer failure handling.
10. Preparation queue, guarded `NEW -> PREPARING -> READY -> SERVED` transitions and SSE refresh.
11. Append-only audit history and controlled full refunds that preserve original sales and payments.
12. Daily sales, product, payment and cash-reconciliation reports.
13. Installable offline shell, cached live workspace, cash-only IndexedDB queue, automatic reconnect and idempotent replay.
14. Explicit provider, printer and fiscal adapter boundaries without unsupported compliance claims.
15. Automated full-flow browser acceptance coverage using a disposable database.

## Release verification — 2026-09-15

- API: 26 tests passed in 28.55 seconds. Coverage includes authorization, money and payment rules, rollback, idempotency, competing checkout/close operations, oversell prevention, immutable ledgers and records, refunds, reports, UTC persistence, migrations and CLI behavior. Two dependency deprecation warnings remain in FastAPI/Starlette test adapters; they do not affect runtime behavior.
- Web: 5 test files and 19 tests passed with Vitest 4.1.11.
- Browser: 4 Playwright/Chrome scenarios passed in 22.1 seconds. They cover automated WCAG A/AA checks, keyboard dialog focus return, 375 px reflow, live checkout through day close, printer failure, stock/report/audit effects, offline reload and one-time sync, and server-role restrictions.
- Production web build: TypeScript and Vite completed successfully; the application JavaScript is 337.04 kB (99.13 kB gzip), CSS is 34.35 kB (10.14 kB gzip), and the versioned offline shell was generated.
- Dependencies: the installed direct dependency tree resolved successfully. The preceding clean install reported zero known vulnerabilities.
- Operations: every shell script passed `bash -n`; `docker compose config --quiet` passed with an explicit test password; `git diff --check` passed; repeated SQLite migration checks passed.
- Source sync: the reviewed tree was copied to `/home/on3/DENNIS/Happy Cone POS` without generated dependencies, build output, browser artifacts or temporary databases, then verified with a zero-difference dry run.

## Release boundaries

The code-level MVP is complete. The later deployment-candidate section supersedes this original boundary: container, PostgreSQL, backup and restore smoke tests now pass. A real deployment still needs TLS, managed secrets, scheduled encrypted off-host backups, monitoring, production staff setup, organization-approved payment/ZRA decisions, and the manual assistive-technology/keyboard/zoom/printer review described in the project guide.

The implementation is maintained in Git with the repository's configured author identity; no fabricated identity is used.

## Deployment-candidate hardening — 2026-09-16

- Added production staff account administration, self-service password changes, session revocation and audited account changes.
- Added strict production configuration, trusted hosts, disabled production API docs, database readiness, structured request logs and correlation IDs.
- Added Nginx login throttling, production Compose/environment templates, CI, verified backup/restore scripts, a deployment preflight, an operations runbook and release-evidence template.
- Improved Settings and account wording around staff access, payment confirmation, tickets and fiscal status.
- Verification after these changes: 35 API tests, 22 web tests and 5 Playwright/axe browser scenarios. The production web build and focused Python correctness lint pass. The remaining environment gates are listed in the beyond-MVP readiness document.
- Built Docker images passed an isolated PostgreSQL/Nginx rehearsal: migration, four-role seed, database readiness, a server-priced K36.00 sale, report persistence, validated backup, guarded restore, and post-restore report verification. The disposable stack and volume were removed afterward.

## Full catalog and operational receipts — 2026-09-17

- Owners and managers can create and edit categories, customer-facing products, sellable variations, modifier groups and extras. They control descriptions, display colour, selling prices, choice limits, availability and recipe-level stock consumption from **Settings → Menu and stock recipes**.
- Permanent item codes preserve receipt and reporting references. Items are archived through availability instead of deleting business history. Cashier and server roles remain read-only for catalog data, with API authorization enforcing the boundary.
- Checkout now snapshots the cashier's name on the order. The redesigned operational receipt shows the order and sale reference, date/time, item and variation codes, quantities, unit prices, modifier details, total, payment/tender/change or provider reference, cashier, unit count and payment status.
- The receipt is styled for 58 mm and 80 mm thermal output and explicitly states that fiscal integration is not configured. It does not invent tax-invoice, TPIN, Smart Invoice/VSDC, signature or QR fields.
- API and web contracts cover the complete catalog administration surface, including validation for codes, prices, choice limits, recipe ingredients and positive quantities. Catalog mutations are audited.
- Final verification: 42 API tests and 28 web component tests passed; all 5 Playwright/Chrome journeys passed against the production build, including axe WCAG A/AA scans, 375 px reflow, the complete owner catalog workflow, all four staff-role boundaries, checkout, stock consumption, receipt and historical reprint, preparation, reporting, day close and offline recovery. Automated print-media evidence verifies that amount columns stay inside the receipt at 58 mm and 80 mm equivalent widths. TypeScript and Vite built successfully (349.65 kB JavaScript, 101.21 kB gzip; 46.16 kB CSS, 12.64 kB gzip). Migration replay, historic-order backfill, shell syntax, Python correctness lint and changed-file import lint passed.
- An isolated PostgreSQL 16 Compose volume migrated to `0002_order_cashier_name`; schema inspection confirmed `orders.cashier_name` is non-null. A real K42.00 checkout returned `A001`, cashier `Chipo Phiri`, and the expected server-owned total. The disposable container, network and volume were removed after verification.
