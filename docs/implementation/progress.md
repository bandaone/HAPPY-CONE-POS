# Happy Cone implementation status

Current release: operations and remote reporting release candidate 1.1.0.

## Delivered system

1. Password authentication with named Cashier, Manager and Owner administrator accounts, visible-password control, session expiry, password changes and account deactivation.
2. A fast cashier counter with menu search, product choices, cart recovery, server-priced totals and idempotent checkout.
3. Cash with change calculation, plus one-tap Mobile money and Card recording. No provider, card or mobile transaction details are collected.
4. One compact customer receipt with business name, location, TPIN, phone, items, totals, payment method and cashier. It omits the old icon header, tax-treatment line, serving ticket and order-number workflow.
5. Menu items, descriptions, prices, options and availability managed by permitted staff from the Menu workspace.
6. Optional stock tracking. A manager enters opening quantities once and links simple ingredient/packaging quantities to menu items. Checkout then records exact recipe consumption without blocking a sale.
7. Prepared-item waste recording with quantity, required reason, optional comment and selling-price value.
8. The Cashier or Manager can reverse and correct only the latest completed sale, only before another sale is recorded. The original, reason, stock return and replacement remain auditable.
9. Detailed daily reporting for items sold, quantities, sales value, payment methods, refunds, corrections, stock used, waste, cash movements, expected cash, actual cash and variance.
10. Business-day opening and closing, receipt reprint, append-only activity history and editable stand/receipt details.
11. A transactional reporting outbox that never blocks local checkout. It retries remote delivery and displays backlog and last-success status.
12. A read-only Owner dashboard for internet reporting with its own sign-in, stale-data warning, sales trends, product performance, payment mix, waste and reconciliation.
13. PostgreSQL migrations through `0013`, production readiness checks, Docker deployment, backup/restore tools and an offline Windows installer/updater.

## Release verification — 2026-10-18

- API: 85 tests passed and the complete Ruff check passed. Coverage includes latest-sale correction rules, stock activation and recipe consumption, correction returns, waste valuation, reconciliation, reporting outbox retries, migration preservation and role access.
- Web: 62 Vitest tests and the production build passed. Five Playwright journeys cover sign-in and accessibility, cashier payment and receipt flows, offline replay, menu/settings access, and the complete stock → sale → correction → waste → close-day report flow.
- Owner dashboard: 2 tests and the production build passed.
- Windows builder: 11 tests passed. The builder derives the Alembic head, excludes Python caches, validates the manifest, creates the transfer archive and rejects altered files.
- Windows release: `HappyCone-Windows-1.1.0.zip` is 428,910,783 bytes with SHA-256 `a486eb5b650bb91749929c6f72dfd374ef22e15bd319bc273a2965c1253681c9`. All 145 manifest files match, the manifest reports schema `0013`, and the ZIP passed CRC verification.
- Migration preservation passed in both the automated SQLite fixture and a populated PostgreSQL 16 database upgraded from `0008` through `0013`; user, sale, payment, menu, stock and audit counts and legacy payment details were preserved.
- PowerShell 5.1 parser/Pester checks and the physical Windows install, update, disconnected-LAN, printer and backup/restore gates must still be recorded on Windows before real sales. PowerShell is not available on this Ubuntu development computer.

## Deployment boundary

The offline Windows package contains the database, API, web application, dependencies, service setup, backup tools and first-owner setup. A new shop computer needs no internet during installation. An existing Happy Cone computer must use the updater so its users, menu, settings and sales remain intact.

Local checkout continues when the internet is unavailable. Other devices on the same local network can use the shop computer while the router/LAN is operating. Internet reporting resumes automatically when the connection returns. Remote reporting does not replace the shop database and never becomes a checkout dependency.

Before live sales, complete the named-staff setup, real menu and prices, receipt identity, Xprinter commissioning, disconnected-LAN test, Windows restart test, backup/export/restore rehearsal and physical accessibility review in the release-evidence checklist. The receipt is not represented as a ZRA Smart Invoice or fiscal certification; any certified ZRA integration remains a separate project.
