# Happy Cone implementation status

Current release: menu-and-sales mode, release candidate 1.0.6.

## Delivered system

1. Password authentication, hashed sessions, sign-out, expiry, self-service password changes, session revocation, and Cashier, Manager, and Owner administrator access.
2. A responsive cashier counter with menu search, product customization, cart recovery, server-priced totals, integer-ngwee accounting, and idempotent payment recovery.
3. Cash with change calculation, plus one-tap Mobile money and Card recording that stores only the method used.
4. Every accepted checkout becomes a completed sale immediately. There is no serving ticket, server notification, order-number workflow, or digital preparation workspace.
5. One receipt with legal business identity, location, TPIN, contact number, item choices, totals, payment method, cashier, cash/change values, and a small **Receipt No.** value. Tax treatment and external payment references are omitted.
6. Browser printing for 58 mm and 80 mm receipts, with saved-sale recovery and reprinting from **Sales** when printing is unavailable.
7. Cash-only offline capture with durable device storage, automatic synchronization, idempotent replay, and clear **Pending sync** status.
8. Categories, menu items, descriptions, prices, product-specific flavour/serving/topping sets, repeated choices, and availability managed from **Menu** by Managers and Owner administrators.
9. Existing inventory history retained without stock counting, enforcement, or sale deduction in the current operating mode.
10. Business-day opening and closing, signed cash movements, refunds, daily sales and payment reports, cash reconciliation, and append-only audit history.
11. Editable stand identity, receipt identity/footer/paper width, payment, activity, and counter-guide wording in **Settings**. Exact old supplied defaults migrate to menu-and-sales wording while owner-customized text is preserved.
12. Production configuration checks, PostgreSQL migrations, health and readiness endpoints, Docker and Nginx deployment files, backup and restore scripts, and operating documentation.

Existing database rows with the historic `SERVER` role remain visible to an Owner administrator for reassignment or deactivation. Those accounts receive an account-only explanation and cannot enter an operational workspace. New staff accounts can use only Cashier, Manager, or Owner administrator.

## Release verification — 2026-09-30

- API: 69 tests passed and the selected Ruff error checks passed. Coverage includes atomic menu administration, product-specific repeated choices, completed checkout and retry idempotency, method-only payments, disabled inventory tracking, settings migration, refunds, reports, roles, database readiness, and a populated `0008` to `0009` upgrade that preserves financial, catalog, inventory, and audit records. The populated upgrade also passed against PostgreSQL 16.
- Web: 13 Vitest files with 56 component and unit tests passed. TypeScript and the production Vite build completed successfully.
- Browser: 4 Playwright/Chromium journeys passed. They cover WCAG A/AA automated scans, phone reflow, password visibility, manager menu setup, Cash/Mobile money/Card checkout, receipt content and 58 mm/80 mm overflow, offline cash replay exactly once, receipt/stand settings, and staff access.
- Windows builder: 9 tests passed. The 1.0.6 offline folder was rebuilt from the verified cache, all 192 release-manifest file hashes and sizes matched, the manifest reports schema `0009`, and the 193-entry transfer ZIP passed CRC verification.
- Production dependency audit: no production web dependency vulnerabilities were reported by `npm audit --omit=dev`.
- GitHub Actions run `36694111489` passed the Windows PowerShell parser, Pester suite, offline wheelhouse installation and migration, as well as the API, web, browser, and container jobs. Physical-computer acceptance, disconnected-LAN operation, backup/restore rehearsal, and exact-model Xprinter output must still be recorded before real sales.

## Deployment boundary

The offline Windows package includes its database, web server, API, dependencies, service setup, backup tools, and first-owner setup. Real use still requires installation on the shop PC, named staff accounts, the real menu and prices, editable stand/receipt details, and the physical checks listed in the Windows guide. The receipt intentionally omits tax type, rate, treatment, and certification wording. A future certified Zambia Revenue Authority integration must be delivered and approved separately.

## Offline Windows shop server — 2026-09-30

The repository now includes a reproducible 64-bit Windows release folder for the 4 GB shop computer. It pins and checksums Python 3.12.10, PostgreSQL 16.14 portable binaries, Caddy 2.11.4, WinSW 2.12.0, age 1.3.2, and every Windows Python wheel. The target computer needs no internet, Docker, WSL, Node.js, Git, or compiler.

The Windows lifecycle includes preflight, exact Private-network firewall configuration, an idempotent clean installer, PostgreSQL/API/Caddy automatic services, low-memory PostgreSQL settings, first-owner bootstrap without demo data, daily atomic backups with 30-backup retention, encrypted USB export, separate-database restore rehearsal, guarded live restore, redacted support bundles, backup-gated updates, and data-preserving uninstall.

Receipt printing now stores an explicit 58 mm or 80 mm profile and constrains printable content to 48 mm or 72 mm. The Xprinter checklist rejects the incorrect HP DesignJet PostScript driver and requires the exact XP model, matching driver, short/normal/long physical receipts, final feed, and cut or tear verification.

Release `1.0.6` implements menu-and-sales mode and packages migration `0009`. The ready-to-transfer ZIP is 429,039,616 bytes with SHA-256 `ec1edf228e054c7099bea5f93b48ae0c1e8865470bbf487488b66c1c1ebb9c52`. It contains every offline dependency and extracts directly into one release folder. GitHub CI passed on the published application commit; the physical-computer gates remain.

Release `1.0.1` corrects Windows preflight for nominal 4 GB computers that report 3.50–3.99 GiB after hardware reservation. Lower-memory computers remain blocked, and preflight now reports the measured memory and free disk values.

Release 1.0.2 adds the pinned Microsoft Visual C++ 2015-2022 x64 runtime required by the portable PostgreSQL binaries. Guided setup now verifies PostgreSQL before database mutation and safely resumes an early failed 1.0.1 installation when no protected installation phase completed.

Release 1.0.3 resolves Windows PowerShell 5.1 guided-setup startup by resolving the release folder after script parameter binding. The double-click launcher and safe early-install recovery remain unchanged.

Release 1.0.4 grants the installing Windows identity temporary read access to initdb's password file. PostgreSQL launches initdb with a restricted token that does not retain access through the Administrators group; the temporary file is still deleted immediately after initialization.

Release 1.0.5 explicitly grants both the PostgreSQL service and the signed-in installer identity access to the database directory. This supports initdb's restricted Windows token while retaining ACL inheritance protection for the cluster.
