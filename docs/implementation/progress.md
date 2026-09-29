# Happy Cone implementation status

Current release: cashier-only checkout, completed 2026-09-28.

## Delivered system

1. Password authentication, hashed sessions, sign-out, expiry, self-service password changes, session revocation, and Cashier, Manager, and Owner administrator access.
2. A responsive cashier counter with menu search, product customization, cart recovery, server-priced totals, integer-ngwee accounting, and idempotent payment recovery.
3. Cash and manually confirmed mobile-money or card payments with change calculation and provider references.
4. Every accepted checkout becomes a completed sale immediately. There is no serving ticket, server notification, order-number workflow, or digital preparation workspace.
5. One customer receipt with legal business identity, location, TPIN, contact number, Turnover Tax (TOT) details, item quantities, payment details, cashier, and a small **Receipt No.** value.
6. Browser printing for 58 mm and 80 mm receipts, with saved-sale recovery and reprinting from **Sales** when printing is unavailable.
7. Cash-only offline capture with durable device storage, automatic synchronization, idempotent replay, and clear **Pending sync** status.
8. Categories, products, descriptions, variations, prices, serving choices, extras, availability, and stock recipes managed from **Stock → Menu and stock recipes** by Managers and Owner administrators.
9. Append-only stock movements, receiving, waste, adjustments, physical counts, low-stock visibility, and recipe-level deduction exactly once per sale.
10. Business-day opening and closing, signed cash movements, refunds, daily sales and payment reports, cash reconciliation, and append-only audit history.
11. Editable stand, receipt, tax, payment, activity, and counter-guide wording in **Settings**. Exact old supplied defaults migrate to cashier-only wording while owner-customized text is preserved.
12. Production configuration checks, PostgreSQL migrations, health and readiness endpoints, Docker and Nginx deployment files, backup and restore scripts, and operating documentation.

Existing database rows with the historic `SERVER` role remain visible to an Owner administrator for reassignment or deactivation. Those accounts receive an account-only explanation and cannot enter an operational workspace. New staff accounts can use only Cashier, Manager, or Owner administrator.

## Release verification — 2026-09-28

- API: 53 checks passed across the local test environment and the production API image. Coverage includes checkout completion and retry idempotency, one-time stock deduction, role reassignment and session revocation, catalog and recipe controls, refunds, reports, settings migration, database readiness, and production documentation settings.
- Web: 10 Vitest files and 43 component/unit tests passed.
- Browser: 4 Playwright/Chrome journeys passed. They cover WCAG A/AA scans, phone reflow, password visibility, live and offline checkout, one printable receipt, receipt reprint, 58 mm and 80 mm overflow, stock deduction, reports, day close, editable stand and receipt settings, catalog editing, and supported staff creation.
- Build: TypeScript and Vite completed successfully and generated the versioned offline shell.
- Production API image: built successfully with the PostgreSQL driver; strict production startup disables interactive API documentation as required.

## Deployment boundary

The repository is ready for deployment after the operator supplies production secrets, a PostgreSQL database, TLS termination, scheduled encrypted off-host backups, monitoring, real staff accounts, and the organization’s approved payment and Zambia Revenue Authority integrations. The current receipt records Turnover Tax information but does not claim Smart Invoice or fiscal certification.

## Offline Windows shop server — 2026-09-29

The repository now includes a reproducible 64-bit Windows release folder for the 4 GB shop computer. It pins and checksums Python 3.12.10, PostgreSQL 16.14 portable binaries, Caddy 2.11.4, WinSW 2.12.0, age 1.3.2, and every Windows Python wheel. The target computer needs no internet, Docker, WSL, Node.js, Git, or compiler.

The Windows lifecycle includes preflight, exact Private-network firewall configuration, an idempotent clean installer, PostgreSQL/API/Caddy automatic services, low-memory PostgreSQL settings, first-owner bootstrap without demo data, daily atomic backups with 30-backup retention, encrypted USB export, separate-database restore rehearsal, guarded live restore, redacted support bundles, backup-gated updates, and data-preserving uninstall.

Receipt printing now stores an explicit 58 mm or 80 mm profile and constrains printable content to 48 mm or 72 mm. The Xprinter checklist rejects the incorrect HP DesignJet PostScript driver and requires the exact XP model, matching driver, short/normal/long physical receipts, final feed, and cut or tear verification.

Automated implementation verification is complete on Ubuntu, including a real PowerShell runtime and Pester. Physical installation on the actual Windows computer, disconnected-internet LAN testing, measured memory, backup/restore rehearsal, and exact-model Xprinter printing remain required before live sales.

Release `1.0.0` candidate evidence: 67 API tests, 45 web tests, four Chromium journeys, 28 Pester tests, six bundle-builder tests, production web build, migration `0008`, 186 release-manifest entries, and the 391 MB transfer ZIP integrity check all passed. The transfer ZIP SHA-256 is recorded beside the artifact; Windows CI and the physical-computer gates must still pass on the published commit.
