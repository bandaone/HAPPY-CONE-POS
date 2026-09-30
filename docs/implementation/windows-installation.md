# Install Happy Cone on the shop Windows computer

This is the supported setup for the 64-bit Windows 10 or Windows 11 shop computer with 4 GB RAM and 128 GB storage. It runs PostgreSQL, one Happy Cone API worker, and Caddy as automatic Windows services. The computer does not need Docker, WSL, Node.js, Git, compilers, or internet access.

## Before moving the release

On the Ubuntu development computer, build a numbered release:

```bash
./scripts/build-windows-bundle.sh \
  --version 1.0.6 \
  --cache /tmp/happycone-vendor-cache \
  --output build/windows
```

Use the prepared `HappyCone-Windows-1.0.6.zip` and `HappyCone-Windows-1.0.6.zip.sha256` files. Copy both files to a USB drive. The ZIP is self-contained; the shop computer will not download any installation files. `release-manifest.json` protects every application, installer, runtime, script, and configuration file with SHA-256.

Before moving the USB, verify the transfer ZIP on Ubuntu:

```bash
cd /home/on3/Downloads
sha256sum --check HappyCone-Windows-1.0.6.zip.sha256
```

## Prepare Windows

1. Sign in with a Windows administrator account.
2. Install all available Windows updates and restart.
3. Set the shop network to **Private** in **Settings → Network & internet → Properties**.
4. Keep at least 10 GB free on the Windows drive. Close unnecessary startup applications on the 4 GB computer.
5. Copy both release files from USB to the Windows desktop. In Windows PowerShell, run `Get-FileHash "$HOME\Desktop\HappyCone-Windows-1.0.6.zip" -Algorithm SHA256` and confirm it equals `ec1edf228e054c7099bea5f93b48ae0c1e8865470bbf487488b66c1c1ebb9c52`.
6. Right-click the ZIP, select **Extract All**, keep the default destination, then open the extracted `HappyCone-Windows-1.0.6` folder. `START-HAPPY-CONE.cmd` must be directly inside that folder, beside `api`, `config`, `installers`, `runtime`, `scripts`, `web`, and `wheelhouse`.
7. Open **Windows PowerShell as Administrator**. Use Windows PowerShell 5.1, the blue Windows application included with Windows.

Run preflight from inside the extracted release folder:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
cd "$HOME\Desktop\HappyCone-Windows-1.0.6"
.\scripts\Test-HappyConeComputer.ps1 -WebPort 8080
```

Do not continue if `CanInstall` is false. Correct every blocking error first. Preflight does not change Windows. A computer sold with 4 GB RAM may report less than 4.00 GiB after hardware reservation; the supported reported floor is 3.50 GiB.

## Install or resume production setup

Double-click `START-HAPPY-CONE.cmd` in the extracted release folder and approve the Windows Administrator prompt. The guided setup runs preflight, asks for the first owner's real name, username and protected password, and then completes installation. The password must contain 12 to 256 characters and is never written to the installer log or command line.

If Windows blocks double-clicked command files, open Administrator PowerShell in the release folder and run:

```powershell
.\scripts\Start-HappyConeSetup.ps1
```

The setup is safe to run again after an interruption. Release 1.0.6 includes the early-install recovery added after 1.0.1, the pinned Microsoft Visual C++ x64 runtime, and the database-directory permission fixes verified in 1.0.5. It verifies PostgreSQL before initializing the database.

A successful installation prints the address staff should open, such as `http://192.168.1.20:8080`. It creates one owner account and an empty production database. It does not create sample staff, sample menu items, opening stock, or sales.

The installer may be run again after an interruption. It records completed phases and never deletes an initialized database. It removes only an incomplete cluster left before database initialization; if a database phase or service was recorded, it stops instead of overwriting data.

## Fix the network address

Reserve the displayed IPv4 address for this computer in the shop router’s DHCP settings. Use the computer’s network-adapter MAC address. A reservation keeps staff bookmarks working after a router or computer restart.

Do not create router port forwarding. For later access outside the shop, use a reviewed VPN or HTTPS tunnel with named-user access.

## Connect staff devices

1. Connect the cashier computer, tablet, or phone to the same shop network.
2. Open the address printed by the installer.
3. Sign in as the owner.
4. Add named staff in **Settings → Staff accounts** and assign only the required role.
5. Set stand and receipt details in **Settings → Stand details** and **Receipt details**.
6. Open **Menu**. Create categories and reusable choice sets such as Flavour, Serve in, and Toppings.
7. Add each menu item with its selling price. Attach only the choice sets it needs and set the required minimum and maximum. A simple item can have no choices; Double Scoop can require two Flavours and one Serve in choice.
8. Open a business day, make one small controlled sale with each payment method, and reprint a receipt from **Sales**.

Use a separate named account for each person. Do not share the owner account at the counter.

Internet loss does not interrupt the local system while the shop computer and router are running. If the Happy Cone API stops while a cashier is completing a cash sale, the open counter saves that sale on the device and syncs it after the API returns. Keep that browser tab open during a server interruption: a staff device cannot open or reload the counter until the local server is available again. Never clear browser data while a sale shows **Pending sync**.

## Restart and daily checks

The database, API, and web entry point start automatically with Windows. After a restart, allow up to two minutes, then open Happy Cone. Check system condition at any time from Administrator PowerShell:

```powershell
& 'C:\Program Files\HappyCone\current\scripts\Get-HappyConeStatus.ps1'
```

The result should show all three services as `Running`, `Health` and `Ready` as `True`, schema `0009`, adequate free disk, and a recent backup. A daily backup runs at 02:00 and keeps the latest 30 successful local backups.

## Acceptance before real sales

Complete all of these on the actual shop computer:

- Restart Windows and confirm Happy Cone returns without manual commands.
- Disconnect the internet while leaving the shop router on; confirm another shop device can sign in and complete a cash sale.
- Test Owner administrator, Manager, and Cashier accounts.
- Create a real menu item and price, attach any required choices, sell it, and confirm the sale and receipt show those choices.
- Confirm Cash shows change before confirmation, while Mobile money and Card each record the method with one tap and no provider/reference entry.
- Confirm sales do not change retained inventory balances in this release.
- Open and close a business day; check payments, reports, activity, receipt reprint, and cash reconciliation.
- Create a backup, export it encrypted, and complete a restore rehearsal.
- Commission the exact Xprinter model using [the printer checklist](xprinter-commissioning.md).
- Record idle and checkout memory use. On the 4 GB PC, close unrelated applications if Windows begins paging heavily.

A failed check blocks live sales until corrected.
