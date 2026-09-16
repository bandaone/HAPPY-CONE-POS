# Happy Cone beyond-MVP production readiness

**Assessment date:** 16 September 2026
**Current verdict:** The core single-stand system and deployment controls are implemented as a release candidate. The built API/Nginx images, PostgreSQL migration, live transaction path, backup and restore have passed an isolated Compose rehearsal. Go-live still requires deployment-host TLS/monitoring, scheduled encrypted off-host backups, the physical accessibility/printer review, and the business's ZRA/payment decisions.

## Readiness work completed on 16 September 2026

- Owner-only staff creation, role/status changes, password resets and session revocation, with audit records and last-owner protection.
- Self-service password change for every live user, preserving the current session and revoking other sessions.
- Production startup rejection for SQLite, missing public hostnames and insecure/local CORS origins; production API documentation is disabled.
- Trusted-host enforcement, database `/ready` checks, request correlation IDs and structured request logs.
- Nginx login throttling and same-origin propagation of request IDs.
- CI jobs for API tests/lint, web tests/build, Playwright/axe flows, shell validation and container builds.
- Verified backup generation, optional age encryption, checksums, retention, guarded restore automation and production preflight checks.
- A first-owner CLI bootstrap path, deployment/incident/payment runbook and per-release evidence template.
- Automated owner account-administration browser coverage in addition to the cashier, server and offline workflows.
- Built API and Nginx images verified against PostgreSQL 16 through migration, sign-in, checkout, inventory/report persistence, backup, destructive restore and post-restore validation.

## What is already real

- Four server-enforced roles with database-backed sessions.
- Server-priced sales, integer-ngwee accounting, idempotent checkout, immutable sales history and audited refunds.
- Recipe-level inventory consumption and an append-only stock ledger.
- Explicit business-day opening, cash control, close and variance records.
- Customer tickets, preparation queue, daily reporting and audit history.
- Offline cash-order capture with idempotent synchronization.
- Responsive branded PWA with automated accessibility, component, API and end-to-end coverage.
- PostgreSQL, Alembic, Docker, Nginx and deployment-script foundations.

## Design work still required

### 1. Agree the production operating policy

Document the exact rules staff will follow for drawer ownership, shifts, discounts, manager overrides, cancellations before payment, partial and full refunds, closed-day corrections, stock returned after a refund, cash drops, lost connectivity and end-of-day handover. These decisions must be approved before their screens and permission rules are built.

### 2. Validate the service flow at the stand

Run observed trials with the actual counter and preparation staff during realistic busy periods. Measure order-entry time, error recovery, ticket legibility, queue visibility, device reach, sunlight/glare, glove or wet-hand use, and the handoff from cashier to server. Use the findings to adjust control size, information density, wording and device placement.

### 3. Choose the production hardware and network

Select the counter device, preparation display, receipt width, printer connection, cash drawer behavior, router, backup connectivity and power/UPS strategy. The current browser-print design cannot be finalized until the exact 58 mm or 80 mm printer is tested.

### 4. Decide the integration path

Choose whether mobile-money/card payments remain operator-confirmed or become direct provider integrations. Confirm the ZRA Smart Invoice path, taxpayer/device registration and certification/UAT process with ZRA. Select whether customer and kitchen tickets use browser print, a local ESC/POS bridge or a network printer.

### 5. Extend the design system

Turn the current visual language into documented tokens and reusable patterns for permissions, warnings, destructive actions, charts, exports, long tables, loading, stale/offline data and integration failures. Complete manual keyboard, screen-reader, 200% zoom, reduced-motion and physical-printer reviews on the chosen devices.

## Implementation work by priority

### P0 — required before real production use

1. **Create a production release baseline.** CI is implemented. The owner still needs to commit the repository under the correct identity, protect release tags, connect CI, and establish staging and production environments.
2. **Harden production configuration.** Strict `APP_ENV=production` validation and loopback service bindings are implemented. The deployment still needs managed secrets, TLS, host firewall rules, image/dependency update policy and documented key rotation.
3. **Prove PostgreSQL deployment.** Image build, empty migration, Nginx routing, readiness, authentication, server-priced checkout and persisted reporting passed against an isolated PostgreSQL 16 stack. The deployment environment still needs the full acceptance suite, production-like data migration, concurrent-terminal and SSE-reconnect tests.
4. **Implement backup and recovery.** Backup validation and a full destructive restore rehearsal passed on the isolated PostgreSQL stack. Production must schedule age-encrypted backups, copy them off-host, alert on failures and record a timed staging restore. The Docker volume is persistence, not a backup.
5. **Add operational visibility.** Readiness checks, structured request logs, correlation identifiers and an incident runbook are implemented. The deployment must connect central logs/error reporting and uptime, disk, database, certificate and backup alerts.
6. **Build production account administration.** Implemented and covered by API, component and browser tests. The first owner can be bootstrapped through the CLI; subsequent staff administration is available in Settings.
7. **Complete fiscal readiness.** Replace the no-op fiscal adapter with the selected ZRA workflow, persist request/response status and identifiers, retry safely, expose rejected/pending states, render required invoice data, and complete sandbox/UAT before making compliance claims. Current tickets explicitly state that a fiscal invoice is not configured.
8. **Complete the chosen payment workflow.** The manual-confirmation procedure and reconciliation responsibilities are documented. The business must approve that process or select a provider; direct integrations still require adapters, callbacks/webhooks, reconciliation and provider refunds.
9. **Prove ticket printing.** Test the real printer, grayscale output and both receipt widths; add a monitored print queue and reprint history if browser print is insufficient. Implement a local/network ESC/POS adapter only after the hardware choice.
10. **Complete the release accessibility review.** Record manual keyboard, screen-reader, zoom, contrast, offline, validation and printed-ticket results for the actual production devices and remediate every release-blocking defect.

### P1 — operational maturity immediately after the first deployment

1. Add full catalog, price, variant, modifier, recipe and inventory-item administration with effective dates and audit history. The current UI controls product availability only.
2. Add cancellation/void rules before payment, partial or item-level refunds, explicit stock-return decisions and controlled corrections for closed days.
3. Add shifts or drawer assignments if more than one cashier shares a business day, including per-operator reconciliation and manager handover.
4. Add pagination and server-side filters to orders, movements, counts and audit history so record growth does not load the full history into every browser.
5. Add CSV/PDF exports, date ranges, hourly sales, variant/modifier performance, waste, margin/COGS and owner summaries.
6. Improve offline operations with an explicit queue detail view, stale-catalog warnings, device identity, sync-failure recovery and owner visibility across devices.
7. Add application-update messaging so an installed PWA can safely reload after a new release without interrupting an in-progress order.
8. Add data-retention, privacy, access-review and breach-response procedures for staff identities, sessions, audit logs and any future customer data.

### P2 — growth features after the stand is stable

- Suppliers, purchase orders, goods receiving and cost history.
- Promotions, discounts and manager approval policies.
- Multi-branch administration, branch-scoped roles and stock transfers.
- Customer accounts, loyalty and digital receipts if the business chooses to collect customer data.
- Delivery, QR self-ordering and online ordering.
- Forecasting and advanced analytics after enough clean operational data exists.

## Recommended delivery sequence

1. Production policy and hardware decisions.
2. Release baseline, CI and production configuration.
3. PostgreSQL/Nginx staging deployment with backup, restore and monitoring.
4. Production account administration and security hardening.
5. Fiscal, payment and printer integrations as separate reviewed workstreams.
6. Staff pilot, accessibility/device audit and operating runbook.
7. Controlled go-live with a documented fallback process.
8. P1 operational improvements driven by real usage data.

Each integration is an independent subproject and should receive its own approved design and executable implementation plan before code changes begin.

## External compliance references

- [ZRA Smart Invoice overview and registration](https://www.zra.org.zm/smart-invoice-learn-more/)
- [ZRA VSDC API specification](https://www.zra.org.zm/wp-content/uploads/2024/06/Smart_Invoice_VSDC_API_Specification_1.0.4.pdf)
- [Zambia Data Protection Commission](https://www.dataprotection.gov.zm/)
- [Data Protection Act No. 3 of 2021](https://www.dataprotection.gov.zm/wp-content/uploads/2024/06/Act-No.-3-The-Data-Protection-Act-2021_0-2.pdf)

The owner should confirm the business's exact tax and data-protection obligations with the relevant authorities and professional advisers; this document is a technical readiness assessment.
