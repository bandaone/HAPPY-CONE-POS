# Happy Cone deployment and operations runbook

This is the operating runbook for the owner and trusted technical administrator. It covers the supplied single-host Docker deployment. Record the real host, DNS name, backup location, responsible people and test dates in the private operations record; do not commit credentials or recovery keys.

## Release gate

Do not move a release to the live stand until all of these checks are recorded:

- CI passes API tests, web tests, the production web build, shell syntax and container builds.
- The release is exercised through built Nginx and PostgreSQL on staging, including migration, sign-in, catalog creation and price edit, sale, receipt, preparation, refund, stock effect, day close and report.
- A backup is created, copied off-host, decrypted and restored into an empty staging database within the agreed recovery time.
- TLS, DNS, host firewall, disk alerts, container restart alerts and `/ready` uptime monitoring are active.
- Owner, manager, cashier and server accounts are tested; shared production passwords are prohibited.
- Keyboard-only, 200% zoom, narrow-screen, screen-reader, offline-cash and physical-printer checks pass on the devices used at the stand. Test both 58 mm and 80 mm paper if both widths will be used.
- The chosen payment procedure is approved. Any direct provider integration must separately pass provider sandbox, webhook and reconciliation tests.
- The ZRA workflow has been confirmed for the business. The current customer receipt says fiscal integration is not configured and must not be represented as a certified fiscal invoice.

## Host and secrets

Use a supported Linux host with Docker Engine and the Compose plugin. Keep PostgreSQL and the direct API port bound to loopback. Expose only a managed TLS reverse proxy that forwards to `127.0.0.1:8080`, preserves the original host and scheme, and permits long-lived `/api/events` responses.

Create `.env` from `.env.production.example`, replace every placeholder, set `APP_ENV=production`, and put the public DNS hostname in `ALLOWED_HOSTS`. Use a unique URL-safe database password from the business password manager. Set file mode `600`. Never run the development seed against production.

The API refuses to start in production with SQLite, only local allowed hosts, or insecure/local CORS origins. API documentation routes are disabled in production. Nginx limits login attempts per source address; upstream firewall or identity controls should provide broader abuse protection when the service is internet-accessible.

## First deployment

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.production.yml build
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d db
docker compose -f docker-compose.yml -f docker-compose.production.yml run --rm api python -m app.cli migrate
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d api web
./scripts/production-check.sh
```

Create the first `OWNER_ADMIN` with `python -m app.cli create-user` and the `--password-env` option. The owner creates each remaining account in **Settings → Staff accounts**. Require each person to change the temporary password after their first sign-in. Keep at least two active owner accounts for recovery, assigned to separate trusted people.

## Release deployment

1. Announce the maintenance window and confirm no offline orders remain on any counter device.
2. Close the business day if the release could interrupt service.
3. Run an encrypted backup and verify its checksum and off-host copy.
4. Pull or check out the reviewed release tag and build immutable images.
5. Run the migration command once, then replace the API and web services. The current migration adds the cashier name snapshot used by historical receipts; confirm migration `0002_order_cashier_name` is at head.
6. Run `./scripts/production-check.sh` through the TLS URL by setting `HAPPYCONE_BASE_URL`.
7. Complete a signed-in smoke test: create or edit a test product variation and recipe as a manager, make a low-value controlled sale, and confirm the receipt, preparation queue, stock movement, report and activity log. Archive the test item afterward if it is not part of the live menu.
8. Record release version, operator, start/end time, migration result, backup identifier and smoke-test result.

## Backups and restore rehearsal

Install `age` on the host and store the decryption identity outside the application host. Schedule:

```bash
HAPPYCONE_BACKUP_AGE_RECIPIENT='age1...' \
HAPPYCONE_BACKUP_DIR='/srv/happycone-backups' \
HAPPYCONE_BACKUP_RETENTION_DAYS=30 \
./scripts/backup.sh
```

Copy both the `.dump.age` file and its `.sha256` file to access-controlled off-host storage. Alert on a missed schedule, nonzero exit, low disk space, or stale newest backup. A Docker volume is not a backup.

At least quarterly, restore the newest backup to an empty staging installation. Verify the checksum, provide `HAPPYCONE_BACKUP_AGE_IDENTITY`, set `HAPPYCONE_RESTORE_CONFIRM=restore-happycone`, and run `scripts/restore.sh BACKUP.dump.age`. Record elapsed time and verify user sign-in, recent orders, stock balances, the last closed day and reports.

## Manual external-payment procedure

Until a direct provider integration is approved, the cashier completes mobile-money or card payment on the provider device first. They confirm the successful amount and recipient, enter the provider name and unique transaction reference in Happy Cone, then complete the sale. A pending, failed or unverifiable provider transaction is not marked paid. The manager reconciles Happy Cone payment totals and references against provider settlement at day close and investigates every mismatch before sign-off.

Refunding an order in Happy Cone records the accounting reversal; it does not automatically send money through an external provider. The manager must complete the provider refund separately, retain its reference in the operating record and reconcile both sides.

## Monitoring and incidents

Monitor `/health` for process liveness and `/ready` for database readiness. Collect JSON API logs and Nginx/container logs in a central system. Search by `X-Request-ID` when tracing a failed request. Alert on repeated restarts, HTTP 5xx rates, readiness failures, disk pressure, PostgreSQL connection/storage problems, failed backups and certificate expiry.

If service fails during trading, stop network-payment entry in Happy Cone. Signed-in devices may record cash orders offline; keep that browser and its data intact until every queued order is accepted. Record provider payments outside the application under the approved fallback procedure. When service returns, sync one device at a time, review rejected orders against money received, and do not close the day until the queue is clear.

For a suspected account compromise, an owner deactivates the account or revokes its sessions, resets the password, reviews the activity log and preserves relevant request IDs and server logs. For owner lockout, a trusted host administrator uses the CLI `create-user` recovery path after verifying authorization; every use must be documented.

## Rollback

Application rollback is safe only when the previous image supports the migrated schema. Prefer forward fixes for additive migrations. If a release corrupts data or requires an incompatible schema rollback, stop API and web services, preserve the failed database, and restore the pre-release backup using the rehearsed restore procedure. Never delete the PostgreSQL volume as a rollback method.
