# Operations implementation report

**Updated:** 2026-09-16
**Scope:** Local orchestration, container packaging, deployment controls, backup recovery, and operational safety defaults.

## Delivered

- Added a PostgreSQL 16, FastAPI, and Nginx/React Compose stack with loopback-only published ports and a named PostgreSQL data volume.
- Added dependency-aware health checks. The API checks itself with Python's standard-library `urllib`; it does not assume `curl` exists in the image.
- Added a Python 3.12 API image that installs the application, contains migration assets, and runs the API as an unprivileged `happycone` user.
- Added a Node.js 22 multi-stage web build and Nginx runtime. Nginx supports SPA fallback, same-origin API/health proxying, a one-hour unbuffered SSE route, security headers, uncached API responses, and an explicitly uncached service worker.
- Added an environment template with local placeholders and no seeded or production credential.
- Added explicit PostgreSQL migration/seed helpers, a Compose launcher, and separate SQLite demo migration/seed/launcher commands. No launcher silently creates users or transactions.
- Replaced the planning-only README with run, seed, test, and scope instructions. Added a full project guide covering the product flow, roles, architecture, deployment, operations, and concrete accessibility release review requirements.
- Expanded `.gitignore` for local secrets, Python/Node caches, local databases, tests, builds, and editor/OS metadata.
- Added small Docker build contexts, exact production Python dependency pins, a strict production Compose override, staff bootstrap, readiness/correlation logging, CI, backup/restore automation and a production preflight.

## Operational decisions

The browser reaches API and SSE endpoints through Nginx on the same origin. The API remains published on loopback for local inspection, while PostgreSQL is also loopback-only. A hosted installation should place TLS termination in front of the Nginx port and must not expose the database or direct API port.

The application process never applies migrations or development seeds at startup. Operators can therefore back up and review a release before the explicit migration. The seed command requires a password of at least 12 characters through `HAPPYCONE_SEED_PASSWORD`; that value is intentionally absent from `.env.example`.

SQLite is labelled and isolated as a demonstration/development path. PostgreSQL remains the deployment database.

## Verification

Final local release-candidate verification:

- `bash -n scripts/*.sh`: passed.
- `git diff --check` for the owned files: passed.
- `POSTGRES_PASSWORD=<temporary value> docker compose config --quiet`: passed; the rendered configuration confirms loopback port bindings, health dependencies, and the named volume.
- API and Nginx images built successfully. The clean web image install reported zero known npm vulnerabilities.
- An isolated PostgreSQL 16 Compose stack migrated from empty, seeded test data explicitly, became healthy behind built Nginx, accepted a server-priced K36.00 cash sale, and reported one matching order and K36.00 net sales. The response carried a correlation ID.
- `scripts/backup.sh` created and validated a PostgreSQL custom-format dump and checksum. `scripts/restore.sh` stopped only the isolated application services, recreated the database, restored the dump, reapplied migrations and restarted healthy services. The restored report retained the order and K36.00 net sales.
- The isolated containers, network and database volume were removed after verification. The live localhost SQLite demonstration was not changed.

These results prove the supplied artifacts locally. A go-live still requires deployment-host TLS, monitoring, scheduled encrypted off-host backups, an actual-device accessibility/printer review and the business's payment/fiscal decisions.
