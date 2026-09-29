# Happy Cone Windows local server

**Date:** 29 September 2026  
**Status:** Approved conversational design; written specification for owner review  
**Scope:** Offline Windows installation, shop-network access, backups, printer commissioning, and a safe path to later internet access

## 1. Purpose

Happy Cone needs to move from the current Ubuntu development computer to a new 64-bit Windows 10 or Windows 11 computer with a 128 GB drive, 4 GB of RAM, and a Celeron processor. The Windows computer will be the shop's application and database server as well as a cashier workstation. Other authorised phones, tablets, and computers must be able to use Happy Cone over the shop's private network. Normal sales must continue when the internet is unavailable.

The initial installation must start with a clean production database. It must not copy demonstration users, products, stock, business days, or sales from the Ubuntu development environment. Setup creates the first owner account, after which that owner configures staff, receipt identity, the sellable menu, recipes, and opening stock through the application.

The solution must fit the limited hardware, start without technical intervention after a Windows restart, preserve completed sales, provide tested backup and recovery, and leave a controlled route to secure remote access later.

## 2. Chosen deployment approach

Happy Cone will run as lightweight native Windows services. Docker Desktop and a general-purpose WSL virtual machine are excluded from the shop installation because their baseline memory use is unsuitable for a 4 GB computer. A separate Linux server remains a future hardware option but is not required for this deployment.

The runtime has three parts:

1. PostgreSQL stores production data and runs as its normal Windows service.
2. The Happy Cone FastAPI application runs through a Windows service wrapper and listens only on `127.0.0.1:8000`.
3. Caddy runs as a Windows service, serves the prebuilt React application, forwards `/api/*`, `/health`, and `/ready` to the API, and listens on the shop network.

The browser, Node.js development server, npm, Git, compilers, and source-control tools are not runtime dependencies on the shop computer. The web application is built on Ubuntu and installed as static files.

The local service uses a single same-origin address. The Windows firewall exposes only the web entry point on networks marked **Private**. PostgreSQL and the API are never exposed directly to the LAN.

## 3. Resource limits

The target is usable on 4 GB RAM, with 8 GB recommended if the computer can later be upgraded.

- PostgreSQL will use conservative settings appropriate for a single stand: a small shared buffer allocation, a low per-query working-memory limit, and a limited connection count.
- The API will run one Uvicorn worker. The expected workload does not justify multiple Python worker processes on this processor.
- Caddy will serve already compressed production assets and will not perform application builds.
- Logs will rotate and retain a bounded history.
- Backups and temporary installation files will have retention limits so the 128 GB drive cannot fill silently.
- The commissioning checklist will disable unnecessary vendor startup applications and confirm that Windows still has adequate free memory with Happy Cone and one browser session open.

## 4. Offline installation bundle

Ubuntu will produce a versioned folder named like `HappyCone-Windows-<version>`. It will contain:

- the production React build;
- the API application, migrations, and an offline Windows Python wheelhouse;
- a supported 64-bit Python installer;
- a supported PostgreSQL Windows installer;
- the Caddy Windows executable;
- the Windows service wrapper;
- PowerShell scripts for installation, status, start, stop, update, backup, restore, and removal of an unsuccessful test installation;
- configuration templates, release metadata, third-party notices, and SHA-256 checksums;
- an owner-facing installation and recovery guide.

The bundle must install without downloading packages on the Windows computer. The Ubuntu preparation command verifies each external binary against a pinned checksum before adding it to the release. Release artifacts are versioned and immutable; an update produces a new folder rather than modifying an old release in place.

## 5. Windows installation

`Install-HappyCone.ps1` is run once from an Administrator PowerShell window. It performs preflight checks before changing the machine:

- Windows is supported and 64-bit;
- at least 4 GB RAM and sufficient free disk space are available;
- required ports are not occupied;
- the computer is connected to the intended private shop network;
- installation files pass their recorded checksums;
- an existing Happy Cone installation is detected and handled as an update rather than overwritten.

The installer then:

1. installs missing runtime components from the offline bundle;
2. creates `C:\Program Files\Happy Cone` for immutable application files and `C:\ProgramData\Happy Cone` for configuration, logs, web assets, and backups;
3. generates a random database credential and stores it in an access-controlled service environment file;
4. creates a fresh Happy Cone PostgreSQL database and restricted application database user;
5. applies all Alembic migrations explicitly;
6. prompts for the first owner's display name, username, and a password of at least 12 characters, without recording the password in command history or logs;
7. installs the API and Caddy as automatic, restart-on-failure Windows services;
8. creates a Private-network firewall rule for the selected web port only;
9. creates shortcuts for **Open Happy Cone**, **Happy Cone status**, **Back up Happy Cone**, and the operating guide;
10. starts the services and refuses to report success until `/health`, `/ready`, the login page, and an owner login pass.

Development seed commands are not run. A failed installation leaves a readable log and rolls back service registrations and incomplete application files where safe. It never deletes a pre-existing database during rollback.

## 6. Local-network operation

The Windows computer receives a stable address through a router DHCP reservation. The installer displays the address users should open, initially in the form `http://<fixed-private-IP>:<port>`. The host workstation shortcut may use `http://localhost:<port>`.

The deployment configuration permits only the expected local hostname and private address. Cross-origin browser access is unnecessary because the web application and API share one origin. The firewall rule applies to Private networks and must not automatically open the service on Public networks.

If the router is replaced or the address changes, the status tool reports the current address and the operating guide explains how to update the DHCP reservation and allowed host. Sales already stored in PostgreSQL remain unaffected by an address change.

The existing browser-side offline cash queue remains a short interruption safeguard. It is not the primary offline architecture: when the internet is down but the shop network and Windows computer are running, all connected devices continue using the local server normally, including stock deduction, reports, staff access, and database persistence.

## 7. Security

The API remains in production mode: interactive API documentation is disabled, PostgreSQL is required, trusted host validation is active, and secrets are absent from the source tree and release logs.

Windows file permissions restrict database credentials, backup encryption material, and service configuration to administrators and the service identity. Staff use named Happy Cone accounts; shared passwords are not created. Session revocation and owner-managed staff permissions continue to work as implemented.

The local web entry point receives the existing security headers. Login throttling must remain effective after replacing Nginx; it will be enforced at an application or supported proxy boundary covered by automated tests, rather than lost during Windows packaging.

No router port forwarding will be configured. Internet access is a later deployment stage using an authenticated VPN for staff-only access or a reviewed HTTPS tunnel and public hostname when broader access is required. That stage must add TLS, upstream access controls, monitoring, and a separate remote-access test without changing local operation.

## 8. Backups and recovery

PostgreSQL backups use `pg_dump` custom format and include a manifest with the Happy Cone release, migration revision, creation time, database version, file size, and SHA-256 checksum.

- A scheduled task creates one local backup every day and retains the latest 30 successful daily backups.
- An owner-triggered command creates a backup before updates, major catalogue changes, or hardware maintenance.
- A separate export command copies an encrypted backup to a designated USB drive. Its recovery key is stored separately from the Windows computer and USB drive.
- Backup success or failure is visible in the status tool. A missing USB drive does not stop sales or erase the local backup.
- Restore defaults to a new validation database. Replacing the live database requires an explicit recovery command, a current safety backup, stopped application writes, checksum verification, migration compatibility checks, and a final readiness check.

A backup is not considered operational until a restore rehearsal on an empty database succeeds. The commissioning record captures the elapsed backup and restore time.

## 9. Updates and rollback

Updates are built on Ubuntu as new signed or checksummed release bundles. The Windows update script:

1. verifies the bundle and target version;
2. checks that no browser-held cash sales are waiting to sync;
3. creates and verifies a pre-update database backup;
4. stops the API service while leaving PostgreSQL available;
5. installs the new application and static assets into a versioned directory;
6. applies forward database migrations once;
7. starts services and runs health, readiness, login-page, and schema checks;
8. switches the active version only after the checks pass.

Application files can roll back to the previous version when the database schema remains compatible. A migration that cannot safely roll back requires restoration from the pre-update backup and is labelled accordingly in its release notes.

## 10. Xprinter commissioning and receipt output

The current HP DesignJet PostScript association is invalid for an Xprinter thermal receipt printer. It sends a large-format PostScript job to an ESC/POS-class device, which accounts for unreadable output and excessive paper feeding. The Windows installation guide requires the exact Xprinter model and the corresponding Xprinter receipt/bill driver. The HP DesignJet driver must not be selected for this device.

Before Happy Cone prints a receipt, commissioning must pass these steps:

1. clear the Windows queue and remove the incorrect printer association;
2. print the Xprinter hardware self-test and record the model, interface, firmware information, and supported paper width;
3. install the matching Xprinter Windows driver from the manufacturer package;
4. configure the actual 58 mm or 80 mm continuous receipt paper and make the Xprinter the cashier's intended receipt printer;
5. print the driver's Windows test page without garbage text or uncontrolled feeding;
6. print Happy Cone short, normal, and long receipts and confirm readable totals, logo behaviour, correct wrapping, one final feed, and cutting or manual tear position;
7. reprint a saved sale from **Sales** and confirm the content matches the original business record.

The application print stylesheet will use an explicit supported receipt profile instead of one fixed 72 mm layout with an unconstrained driver-dependent page. Automated tests will cover print-only visibility, 58 mm and 80 mm content width, long item names, long receipts, and the absence of non-receipt interface content. Physical-printer verification remains a release gate because browser screenshots cannot validate a Windows driver or ESC/POS device.

Initial production printing continues through the browser print workflow because the exact Xprinter model is not yet recorded. Automatic silent printing or raw ESC/POS output requires a model-specific print adapter and is outside this installation until the printer model and connection are confirmed.

## 11. Observability and owner controls

The **Happy Cone status** tool shows, in plain language:

- whether the database, API, and web entry point are running;
- the local address for other devices;
- installed release and database migration revision;
- free disk space;
- latest successful backup and most recent backup error;
- log locations and a safe command to create a support bundle that excludes passwords and database contents.

Windows services restart after transient failure and after reboot. Repeated failure remains visible in Windows Event Log and the application log rather than entering an endless silent restart loop.

## 12. Verification

Automated release checks will cover:

- production API tests and web tests;
- production web build;
- Windows PowerShell syntax and static analysis;
- offline wheel installation in a clean 64-bit Windows test environment;
- clean database migration to Alembic head;
- first-owner bootstrap with no demo records;
- service installation, automatic startup, restart-on-failure, and uninstall safety;
- same-origin LAN access, trusted-host rejection, and Private-network firewall scope;
- login throttling and security headers;
- backup creation, checksum validation, encrypted USB export, and restore into an empty database;
- an update from the previous release while preserving data;
- receipt print layout tests.

The physical commissioning checklist will test owner, manager, and cashier sign-in; business-day open and close; catalogue and recipe setup; stock receipt and count; cash and manually confirmed payments; receipt print and reprint; refund; reports; audit history; reboot recovery; internet-disconnected LAN use; backup and restore; and the actual Xprinter.

## 13. Acceptance criteria

The Windows deployment is ready for real use when all of the following are true:

- a clean offline bundle installs on the target computer without downloading dependencies;
- no demonstration records exist and the first owner can complete business setup;
- Happy Cone starts automatically after a full Windows restart;
- at least one other device can sign in over the private shop network while the internet is disconnected;
- the Celeron/4 GB computer remains responsive through a realistic checkout and reporting trial;
- completed sales, payments, stock movements, staff actions, and reports persist through restart;
- a verified backup restores successfully to an empty database;
- only the intended private-network web port is exposed;
- the correctly driven Xprinter produces short and long Happy Cone receipts without garbage output or uncontrolled paper feeding;
- the owner has the installation bundle, recovery key, operating guide, and recorded recovery rehearsal.

