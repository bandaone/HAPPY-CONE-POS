# Happy Cone POS

Happy Cone is a responsive point-of-sale and stand-operations system for a quick-service ice-cream stand in Lusaka. One recorded sale drives payment status, the customer receipt, the live preparation queue, recipe-level stock consumption, business-day accounting, reporting, and audit history.

The application uses a React/Vite PWA, a FastAPI service, and PostgreSQL 16. Nginx serves the built web app and proxies `/api`, `/api/events`, `/health`, and `/ready` to the API on the same origin.

## Run with Docker Compose

Prerequisites: Docker Engine with the Compose plugin.

```bash
cp .env.example .env
# Replace POSTGRES_PASSWORD in .env with a unique, URL-safe local password.
./scripts/dev.sh -d
./scripts/migrate.sh
HAPPYCONE_SEED_PASSWORD='choose-a-dev-password' ./scripts/seed-dev.sh
```

The seed password must be at least 12 characters. The seed command creates development-only `manager`, `cashier`, `server`, and `owner` users with that password, plus the example catalog and opening stock. It does not create a business day or demo sales.

Open <http://localhost:8080>. The liveness check is at <http://localhost:8080/health> and the database readiness check is at <http://localhost:8080/ready>. All published ports bind to `127.0.0.1` by default.

Database migrations and development data are always explicit. Starting the stack does not seed users, sales, or stock. To stop the services without deleting the database volume:

```bash
docker compose down
```

## Run the SQLite demonstration mode

This mode is for local evaluation without PostgreSQL. It requires Python 3.12 and Node.js 22.

```bash
python3.12 -m venv apps/api/.venv
apps/api/.venv/bin/pip install -e './apps/api[dev]'
npm --prefix apps/web ci
./scripts/demo-migrate.sh
HAPPYCONE_SEED_PASSWORD='choose-a-dev-password' ./scripts/demo-seed.sh
./scripts/demo.sh
```

Open <http://127.0.0.1:5173>. The SQLite file, migration, and seed are separate from the PostgreSQL stack. `demo.sh` starts the API and Vite server; it does not initialize or seed data.

## Test and build

```bash
cd apps/api
.venv/bin/pytest

cd ../web
npm test
npm run build
```

With the Compose stack running, check the routed services with:

```bash
curl --fail http://localhost:8080/health
curl --include http://localhost:8080/api/catalog
```

The catalog call requires authentication in normal use, so an HTTP `401` confirms routing when no bearer token is supplied.

## Prepare a production host

The production override enables strict startup validation, disables interactive API documentation, restricts accepted hostnames, and keeps application ports on loopback for a TLS reverse proxy:

```bash
cp .env.production.example .env
# Replace every placeholder and set the public DNS name in ALLOWED_HOSTS.
chmod 600 .env
docker compose -f docker-compose.yml -f docker-compose.production.yml build
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d db
docker compose -f docker-compose.yml -f docker-compose.production.yml run --rm api python -m app.cli migrate
docker compose -f docker-compose.yml -f docker-compose.production.yml up -d api web
./scripts/production-check.sh
```

Create the first owner without installing demonstration data:

```bash
read -rsp 'Initial owner password: ' HAPPYCONE_BOOTSTRAP_PASSWORD
export HAPPYCONE_BOOTSTRAP_PASSWORD
docker compose -f docker-compose.yml -f docker-compose.production.yml run --rm api \
  python -m app.cli create-user --username owner --name 'Owner name' \
  --role OWNER_ADMIN --password-env HAPPYCONE_BOOTSTRAP_PASSWORD
unset HAPPYCONE_BOOTSTRAP_PASSWORD
```

After sign-in, an owner can create staff accounts, change roles and active status, reset passwords, and revoke sessions from **Settings → Staff accounts**. Owners and managers maintain the sellable menu in **Settings → Menu and stock recipes**: categories, product descriptions, variations, prices, serving choices, extras, availability, and the stock quantity consumed by each choice. Permanent item codes keep older receipts and reports understandable. Every live user can change their own password from the account menu.

Owners and managers can also edit the stand profile from **Settings**: business and stand names, location, display currency, timezone, payment and ticket instructions, receipt thank-you line, activity introduction, and the counter guide. These values are stored in the database and used by the signed-in workspace, money and date display, offline cache, counter guide, and customer receipts. Live connection state, the signed-in identity, audit entries, and fiscal-integration status remain system controlled.

Use `scripts/backup.sh` for verified PostgreSQL custom-format backups. Production scheduling must set `HAPPYCONE_BACKUP_AGE_RECIPIENT`, copy the encrypted backup and checksum off-host, and alert on failure. `scripts/restore.sh` requires an explicit confirmation value and should first be rehearsed on staging. The full procedure is in the [deployment and operations runbook](docs/implementation/deployment-runbook.md).

## Documentation

- [Project and operations guide](docs/implementation/project-guide.md)
- [Deployment and operations runbook](docs/implementation/deployment-runbook.md)
- [Release evidence template](docs/implementation/release-evidence-template.md)
- [Staff role access review and screenshots](docs/implementation/role-access-review.md)
- [Beyond-MVP production-readiness roadmap](docs/implementation/beyond-mvp-readiness.md)
- [API contract](docs/implementation/api-contract.md)
- [Approved system design](docs/superpowers/specs/2026-09-14-icecream-pos-design.md)
- [Implementation roadmap](docs/superpowers/plans/2026-09-14-icecream-pos-roadmap.md)
- [Implementation progress](docs/implementation/progress.md)

The system records cash and manual external-payment confirmations. Its printed document is an operational customer receipt and does not claim Zambia Revenue Authority fiscal compliance. Live mobile-money/card processing and certified fiscal integration require separately approved integrations.
