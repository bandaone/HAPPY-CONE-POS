# Happy Cone Windows Local Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a clean, offline-installable Happy Cone release that runs as lightweight Windows services on the 4 GB shop computer, serves authorised LAN devices without internet, protects and backs up production data, and prints correctly through the commissioned Xprinter driver.

**Architecture:** PostgreSQL runs as its native Windows service, the FastAPI API listens on loopback through WinSW, and Caddy exposes one same-origin web address to the Private shop network. Ubuntu builds a checksummed release folder containing static web assets, the API and Windows wheelhouse, pinned third-party installers, service templates, and PowerShell lifecycle commands; the target computer never needs development tools or an internet connection.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, Alembic, PostgreSQL 16, React/Vite, Caddy, WinSW, PowerShell 5.1+, Pester 5, GitHub Actions Windows runner

**Spec:** `docs/superpowers/specs/2026-09-29-windows-local-server-design.md`

## Global Constraints

- Target 64-bit Windows 10 or Windows 11, 128 GB storage, 4 GB RAM, and a Celeron processor; 8 GB remains an optional later upgrade.
- Do not install Docker Desktop, WSL, Node.js, npm, Git, compilers, or source-control tools on the shop computer.
- Runtime services are PostgreSQL, one Uvicorn worker on `127.0.0.1:8000`, and Caddy on one Private-network web port.
- The target installation must complete without downloading any dependency.
- A new installation creates a clean production database and first owner only; never run development seed commands.
- Expose only the Caddy entry point to Private networks. Keep PostgreSQL and the API loopback-only.
- Keep production trusted-host validation, security headers, login throttling, named user accounts, and secret-free logs.
- Create daily local PostgreSQL custom-format backups, keep the latest 30 successful backups, and support encrypted USB export and verified restore.
- Do not configure router port forwarding. Later internet access must use a reviewed VPN or HTTPS tunnel.
- Physical Xprinter verification remains a release gate. Never select the HP DesignJet PostScript driver for the Xprinter.

## Review Focus

- A rerun after a partially failed installation must resume or stop safely without deleting an existing database; Task 5 adds an interrupted-install preservation test.
- A changed local IP or host name must produce a useful status/configuration result rather than an unreachable or over-broad deployment; Task 4 tests exact trusted hosts and Private-network firewall arguments.
- A full or nearly full disk must fail backup before creating a corrupt archive and must leave the last valid backup untouched; Task 6 tests the low-space path.
- A modified or mismatched installer/archive must be rejected before execution; Task 3 tests checksum and release-manifest rejection.
- A long receipt with long names on the 58 mm profile must wrap inside the printable area without exposing application UI; Task 2 adds print-media browser coverage.

---

### Task 1: Preserve production security without Nginx

**Files:**
- Create: `apps/api/app/core/rate_limit.py`
- Modify: `apps/api/app/core/config.py`
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/pyproject.toml`
- Test: `apps/api/tests/test_production_readiness.py`
- Test: `apps/api/tests/identity/test_auth.py`

**Interfaces:**
- Consumes: ASGI request scopes and the existing `Settings` production validation.
- Produces: `LoginRateLimitMiddleware(app, requests: int, window_seconds: int, capacity: int)` and settings fields `login_rate_requests`, `login_rate_window_seconds`, and `login_rate_capacity`.

- [ ] **Step 1: Write failing production and authentication tests**

Add tests asserting that production can use an empty CORS list with an explicit LAN IP/host, local-only trusted hosts still fail, the 31st login request from one client in 60 seconds returns `429`, a different client is unaffected, expired buckets recover, and client tracking never exceeds the configured capacity.

- [ ] **Step 2: Run the focused API tests and verify failure**

Run: `cd apps/api && pytest tests/test_production_readiness.py tests/identity/test_auth.py -q`

Expected: FAIL because API-level login throttling and its settings do not exist.

- [ ] **Step 3: Implement the bounded ASGI login limiter**

Implement `LoginRateLimitMiddleware` for `POST /api/auth/login`, return the existing API error shape with status `429`, remove expired buckets, and evict the oldest bucket when `capacity` is reached. Register it in `create_app`; add production-safe defaults matching the current `30r/m` proxy policy.

- [ ] **Step 4: Add Windows timezone data**

Add `tzdata` as a pinned runtime dependency so `ZoneInfo('Africa/Lusaka')` works on Windows without system IANA timezone files.

- [ ] **Step 5: Run focused and full API verification**

Run: `cd apps/api && pytest tests/test_production_readiness.py tests/identity/test_auth.py -q && pytest -q`

Expected: all API tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/core/rate_limit.py apps/api/app/core/config.py apps/api/app/main.py apps/api/pyproject.toml apps/api/tests
git commit -m "Harden API for local Windows production"
```

### Task 2: Add explicit thermal-paper profiles

**Files:**
- Create: `apps/api/alembic/versions/0008_receipt_paper_width.py`
- Modify: `apps/api/app/models/stand_settings.py`
- Modify: `apps/api/app/schemas/stand_settings.py`
- Modify: `apps/api/app/domains/settings/service.py`
- Modify: `apps/api/tests/settings/test_stand_settings.py`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/features/StandSettings.tsx`
- Modify: `apps/web/src/features/Receipt.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/receipt.test.tsx`
- Modify: `apps/web/src/features/stand-settings.test.tsx`
- Modify: `apps/web/e2e/happy-cone.spec.ts`

**Interfaces:**
- Consumes: existing stand settings update/read endpoints and `Receipt`/`ReceiptModal` rendering.
- Produces: `receipt_paper_width: '58mm' | '80mm'` on `StandProfile`, defaulting to `80mm`; print roots receive `receipt-paper-58` or `receipt-paper-80`.

- [ ] **Step 1: Write failing API migration and settings tests**

Assert a new database defaults to `80mm`, manager/owner updates accept only `58mm` or `80mm`, and migration `0008` preserves all existing receipt settings.

- [ ] **Step 2: Run the settings tests and verify failure**

Run: `cd apps/api && pytest tests/settings/test_stand_settings.py -q`

Expected: FAIL because `receipt_paper_width` is absent.

- [ ] **Step 3: Implement the stored paper profile**

Add migration `0008`, model column, literal schema field, DTO mapping, update handling, and supplied default `80mm`.

- [ ] **Step 4: Write failing component and browser print tests**

Assert the receipt editor exposes a labelled 58/80 mm choice, the print root gets the saved profile class, only the receipt is visible in print media, 58 mm content is at most 48 mm, 80 mm content is at most 72 mm, and a long item list/name stays within the receipt boundary.

- [ ] **Step 5: Run the web tests and verify failure**

Run: `cd apps/web && npm test -- --run src/features/receipt.test.tsx src/features/stand-settings.test.tsx`

Expected: FAIL because the profile and print classes do not exist.

- [ ] **Step 6: Implement profile-aware receipt CSS and editor UI**

Use 48 mm printable content for the 58 mm profile and 72 mm for the 80 mm profile. Remove `@page size:auto`; keep zero page margin and require the commissioned Xprinter driver to own continuous-roll length and cutting. Prevent print-only elements from creating screen layout space.

- [ ] **Step 7: Run receipt, full web, and migration verification**

Run: `cd apps/web && npm test -- --run && npm run build`

Run: `cd apps/api && pytest -q && alembic upgrade head && alembic current`

Expected: web tests/build pass and Alembic reports `0008 (head)`.

- [ ] **Step 8: Commit**

```bash
git add apps/api apps/web
git commit -m "Support configured thermal receipt widths"
```

### Task 3: Build a reproducible offline Windows release folder

**Files:**
- Create: `packaging/windows/dependencies.lock.json`
- Create: `packaging/windows/bundle-layout.json`
- Create: `scripts/build_windows_bundle.py`
- Create: `scripts/build-windows-bundle.sh`
- Create: `scripts/tests/test_windows_bundle.py`
- Create: `packaging/windows/THIRD-PARTY-NOTICES.md`
- Modify: `.gitignore`
- Modify: `README.md`

**Interfaces:**
- Consumes: repository source, `apps/web/dist`, a local download cache, and exact URL/SHA-256 entries in `dependencies.lock.json`.
- Produces: `build/windows/HappyCone-Windows-<version>/release-manifest.json` plus `web/`, `api/`, `wheelhouse/`, `installers/`, `runtime/`, `scripts/`, and `config/` directories.

- [ ] **Step 1: Write failing bundle-builder tests**

Test `load_dependency_lock(path)`, `verify_sha256(path, expected)`, and `assemble_bundle(source_root, output_root, cache_root, version)`. Assert a valid fake cache produces the exact layout and manifest; missing files, path traversal, unexpected architecture, and altered checksums fail before assembly.

- [ ] **Step 2: Run tests and verify failure**

Run: `python -m pytest scripts/tests/test_windows_bundle.py -q`

Expected: FAIL because the builder does not exist.

- [ ] **Step 3: Implement the builder and locked dependency metadata**

Pin supported x64 Windows installers/executables and their vendor checksums. Build the React assets, copy only runtime API/migration files, download CPython 3.12 Windows wheels into the wheelhouse, add all lifecycle scripts/configuration, emit file checksums, and refuse an unclean or incomplete release.

- [ ] **Step 4: Exercise cache-only and download modes**

Run: `python scripts/build_windows_bundle.py --version test --cache /tmp/happycone-vendor-cache --output /tmp/happycone-build --cache-only`

Expected: a missing cache reports every required artifact without creating a partial release.

Run after populating the cache: `./scripts/build-windows-bundle.sh --version test --cache /tmp/happycone-vendor-cache --output /tmp/happycone-build`

Expected: release manifest and all file checksums verify.

- [ ] **Step 5: Run tests and commit**

Run: `python -m pytest scripts/tests/test_windows_bundle.py -q`

```bash
git add packaging/windows scripts .gitignore README.md
git commit -m "Build offline Windows release bundle"
```

### Task 4: Implement Windows preflight and configuration

**Files:**
- Create: `packaging/windows/scripts/HappyCone.Common.psm1`
- Create: `packaging/windows/scripts/Test-HappyConeComputer.ps1`
- Create: `packaging/windows/config/Caddyfile.template`
- Create: `packaging/windows/config/api.env.template`
- Create: `packaging/windows/config/postgresql-low-memory.conf`
- Create: `packaging/windows/tests/Common.Tests.ps1`
- Create: `packaging/windows/tests/Preflight.Tests.ps1`

**Interfaces:**
- Consumes: verified release manifest, Windows system facts, chosen web port, computer name, and detected private IPv4 address.
- Produces: `Test-HappyConePreflight(...)`, `Get-HappyConeNetworkIdentity()`, `New-HappyConeSecret()`, `Protect-HappyConeFile(path)`, `Write-HappyConeConfiguration(...)`, and a structured preflight result with blocking errors and warnings.

- [ ] **Step 1: Write failing Pester tests**

Cover 32-bit Windows, unsupported Windows, less than 4 GB RAM, insufficient disk, occupied ports, Public-only network, safe generated secrets, exact IP/host trusted-host JSON, empty same-origin CORS, and firewall parameters restricted to the Private profile.

- [ ] **Step 2: Run tests and verify failure on a Windows runner**

Run: `Invoke-Pester packaging/windows/tests/Common.Tests.ps1,packaging/windows/tests/Preflight.Tests.ps1 -Output Detailed`

Expected: FAIL because the module and preflight command do not exist.

- [ ] **Step 3: Implement common helpers and preflight**

Keep system discovery injectable for tests. Render production API configuration with PostgreSQL, `Africa/Lusaka`, exact allowed hosts, empty CORS, bounded logging, and one worker. Render Caddy with SPA fallback, loopback reverse proxy, current security headers, and bounded logs.

- [ ] **Step 4: Implement secure file and network behavior**

Apply administrator/service-only ACLs to secrets, generate firewall commands only for the selected TCP port and Private profile, and report the address other devices should open. Do not execute mutations from the preflight command.

- [ ] **Step 5: Run Pester and commit**

Run: `Invoke-Pester packaging/windows/tests/Common.Tests.ps1,packaging/windows/tests/Preflight.Tests.ps1 -Output Detailed`

```bash
git add packaging/windows
git commit -m "Add Windows deployment preflight"
```

### Task 5: Install and start a clean Windows production system

**Files:**
- Create: `packaging/windows/scripts/Install-HappyCone.ps1`
- Create: `packaging/windows/config/happycone-api-service.xml.template`
- Create: `packaging/windows/config/happycone-web-service.xml.template`
- Create: `packaging/windows/tests/Install.Tests.ps1`
- Create: `packaging/windows/tests/Service.Tests.ps1`

**Interfaces:**
- Consumes: Task 3 bundle, Task 4 preflight/configuration functions, first-owner name/username/SecureString password, and verified installers.
- Produces: `Install-HappyCone -BundleRoot <path> -WebPort <int>`, PostgreSQL/API/Caddy automatic services, a migrated empty database, one owner, desktop/start-menu shortcuts, and an installation state file.

- [ ] **Step 1: Write failing installer and service tests**

Mock external installers and service control. Assert order of operations, no seed invocation, password absence from logs/process arguments, service recovery configuration, loopback API binding, first-owner creation, and health/readiness/login-page gates. Simulate failure after database creation and assert a rerun neither drops nor recreates that database.

- [ ] **Step 2: Run tests and verify failure**

Run: `Invoke-Pester packaging/windows/tests/Install.Tests.ps1,packaging/windows/tests/Service.Tests.ps1 -Output Detailed`

Expected: FAIL because installer/service templates do not exist.

- [ ] **Step 3: Implement idempotent runtime installation**

Install missing Python/PostgreSQL components silently from the bundle, create versioned immutable application files and ProgramData state, install the wheelhouse into a dedicated virtual environment, configure low-memory PostgreSQL, create the restricted database role/database, and record completed phases in the state file.

- [ ] **Step 4: Implement migration, owner bootstrap, and services**

Pass the owner password through a temporary process environment variable, apply migrations before `create-user`, remove the variable immediately, install WinSW API/Caddy services under restricted identities, configure restart-on-failure, add Private firewall access, and create shortcuts.

- [ ] **Step 5: Implement installation success and rollback rules**

Poll service state plus `/health`, `/ready`, and the login page with deadlines. On failure remove newly registered services and incomplete version files, retain logs/configuration, and never delete any database that reached the creation phase.

- [ ] **Step 6: Run Pester and commit**

Run: `Invoke-Pester packaging/windows/tests/Install.Tests.ps1,packaging/windows/tests/Service.Tests.ps1 -Output Detailed`

```bash
git add packaging/windows
git commit -m "Install Happy Cone as Windows services"
```

### Task 6: Add status, backup, encrypted export, and restore

**Files:**
- Create: `packaging/windows/scripts/Get-HappyConeStatus.ps1`
- Create: `packaging/windows/scripts/New-HappyConeSupportBundle.ps1`
- Create: `packaging/windows/scripts/Backup-HappyCone.ps1`
- Create: `packaging/windows/scripts/Export-HappyConeBackup.ps1`
- Create: `packaging/windows/scripts/Restore-HappyCone.ps1`
- Create: `packaging/windows/scripts/Register-HappyConeBackupTask.ps1`
- Create: `packaging/windows/tests/Operations.Tests.ps1`
- Create: `packaging/windows/config/backup-policy.json`

**Interfaces:**
- Consumes: installed state/configuration, PostgreSQL tools, release manifest, age recipient, optional USB path, and the service controller.
- Produces: `Get-HappyConeStatus`, `New-HappyConeSupportBundle`, `New-HappyConeBackup`, `Export-HappyConeBackup`, `Test-HappyConeRestore`, and `Restore-HappyConeLive`; backup archives have adjacent JSON manifests and SHA-256 checksums.

- [ ] **Step 1: Write failing operations tests**

Mock PostgreSQL and service calls. Assert status reports service/readiness/schema/disk/backup state without secrets; support bundles contain bounded diagnostic logs and redacted configuration but exclude credentials, database contents, and backup archives; backups use custom format and atomic rename; 30 successful archives are retained; low disk leaves the last valid backup untouched; a missing USB does not affect local backup; checksum, encryption, schema, and restore failures stop before live replacement.

- [ ] **Step 2: Run tests and verify failure**

Run: `Invoke-Pester packaging/windows/tests/Operations.Tests.ps1 -Output Detailed`

Expected: FAIL because the lifecycle commands do not exist.

- [ ] **Step 3: Implement status and atomic local backup**

Render the plain-language status from bounded probes and build a redacted support archive from release metadata and rotated logs. Write the database archive and manifest to temporary names, validate `pg_restore --list`, calculate SHA-256, then rename atomically. Register a daily SYSTEM scheduled task and prune only after a new valid backup succeeds.

- [ ] **Step 4: Implement encrypted USB export and restore rehearsal**

Encrypt to the configured age recipient, verify the copied checksum, and never store the recovery identity beside exported backups. Restore rehearsal creates a separate validation database, checks the Alembic revision and `/ready` compatibility, then removes only that validation database.

- [ ] **Step 5: Implement guarded live restore**

Require an explicit `-ReplaceLiveDatabase` switch, a new safety backup, stopped API writes, valid archive/checksum, and confirmation of the expected installation identity. Restart and verify all services before declaring success.

- [ ] **Step 6: Run Pester and commit**

Run: `Invoke-Pester packaging/windows/tests/Operations.Tests.ps1 -Output Detailed`

```bash
git add packaging/windows
git commit -m "Add Windows backup and recovery tools"
```

### Task 7: Add safe updates and test-install removal

**Files:**
- Create: `packaging/windows/scripts/Update-HappyCone.ps1`
- Create: `packaging/windows/scripts/Uninstall-HappyCone.ps1`
- Create: `packaging/windows/tests/Update.Tests.ps1`
- Create: `packaging/windows/tests/Uninstall.Tests.ps1`

**Interfaces:**
- Consumes: a newer verified Task 3 bundle, Task 6 backup functions, current installation state, service control, and migration metadata.
- Produces: `Update-HappyCone -BundleRoot <path>` and `Uninstall-HappyCone -KeepData` with versioned application directories and an atomic active-version switch.

- [ ] **Step 1: Write failing update/removal tests**

Assert altered bundles, downgrades, missing pre-update backups, failed migrations, and failed readiness checks never switch the active release. Assert a successful update preserves the database and configuration. Assert uninstall defaults to retaining database files/backups and requires a separate explicit destructive flag to remove data.

- [ ] **Step 2: Run tests and verify failure**

Run: `Invoke-Pester packaging/windows/tests/Update.Tests.ps1,packaging/windows/tests/Uninstall.Tests.ps1 -Output Detailed`

Expected: FAIL because update/removal commands do not exist.

- [ ] **Step 3: Implement staged updates and rollback**

Verify the new release, require a successful pre-update backup, stop API writes, install into a new version directory, migrate once, start and verify, then atomically switch active-version state. Roll application files back on pre-switch failure and retain the failure log and backup.

- [ ] **Step 4: Implement conservative test-install removal**

Stop and remove Happy Cone services/firewall/shortcuts, remove immutable application versions, and retain ProgramData/database/backups by default. Make data deletion a separately named switch with an installation-identity check.

- [ ] **Step 5: Run Pester and commit**

Run: `Invoke-Pester packaging/windows/tests/Update.Tests.ps1,packaging/windows/tests/Uninstall.Tests.ps1 -Output Detailed`

```bash
git add packaging/windows
git commit -m "Support safe Windows updates and removal"
```

### Task 8: Add Windows CI, operating guides, and release evidence

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `docs/implementation/windows-installation.md`
- Create: `docs/implementation/windows-recovery.md`
- Create: `docs/implementation/xprinter-commissioning.md`
- Modify: `docs/implementation/deployment-runbook.md`
- Modify: `docs/implementation/release-evidence-template.md`
- Modify: `docs/implementation/progress.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: every command and acceptance gate from Tasks 1–7.
- Produces: Windows CI gates, an owner-operable installation/recovery procedure, an Xprinter checklist, and a completed release-evidence template ready for the target-PC trial.

- [ ] **Step 1: Add the Windows CI job**

Use a supported Windows runner with Python 3.12, Node 22, and Pester 5.5.0. Run all PowerShell tests, validate templates/manifests, create a bundle from a controlled fixture cache, install its Windows wheelhouse into a clean virtual environment, and run API import/timezone/migration smoke checks.

- [ ] **Step 2: Add owner-facing installation and recovery guides**

Document USB transfer, administrator launch, first-owner setup, DHCP reservation, device access, restart behavior, daily status, backup export, restore rehearsal, update, and support-bundle collection in direct operational language.

- [ ] **Step 3: Add the Xprinter commissioning record**

Require the exact `XP-...` model, connection, paper width, correct Xprinter driver, self-test, Windows test page, short/normal/long Happy Cone receipts, reprint, logo, wrapping, final feed, and cut/tear checks. Explicitly reject HP DesignJet PostScript.

- [ ] **Step 4: Run complete repository verification**

Run: `cd apps/api && pytest -q`

Run: `cd apps/web && npm test -- --run && npm run build`

Run on Windows: `Invoke-Pester packaging/windows/tests -Output Detailed`

Run: `python -m pytest scripts/tests/test_windows_bundle.py -q`

Expected: all checks pass and the bundle manifest verifies.

- [ ] **Step 5: Build the candidate offline release**

Run: `./scripts/build-windows-bundle.sh --version <release> --cache <verified-cache> --output build/windows`

Expected: one checksummed `HappyCone-Windows-<release>` folder ready to copy to USB.

- [ ] **Step 6: Perform the physical target-PC commissioning gate**

On the 4 GB Windows computer, record install time, idle and checkout memory, reboot recovery, disconnected-internet LAN access from another device, a complete owner/manager/cashier business flow, backup/restore rehearsal, and physical Xprinter results. Any failure blocks real sales use.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ci.yml docs README.md
git commit -m "Document and verify Windows operations"
```

