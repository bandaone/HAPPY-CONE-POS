# Install Happy Cone on the shop Windows computer

This is the supported setup for the 64-bit Windows 10 or Windows 11 shop computer with 4 GB RAM and 128 GB storage. It runs PostgreSQL, one Happy Cone API worker, and Caddy as automatic Windows services. The computer does not need Docker, WSL, Node.js, Git, compilers, or internet access.

## Before moving the release

On the Ubuntu development computer, build a numbered release:

```bash
./scripts/build-windows-bundle.sh \
  --version 1.0.0 \
  --cache /tmp/happycone-vendor-cache \
  --output build/windows
```

Copy the complete `HappyCone-Windows-1.0.0` folder to a USB drive. Do not copy individual files from inside it. `release-manifest.json` protects every application, installer, runtime, script, and configuration file with SHA-256.

## Prepare Windows

1. Sign in with a Windows administrator account.
2. Install all available Windows updates and restart.
3. Set the shop network to **Private** in **Settings → Network & internet → Properties**.
4. Keep at least 10 GB free on the Windows drive. Close unnecessary startup applications on the 4 GB computer.
5. Copy the release folder from USB to the Windows desktop.
6. Open **Windows PowerShell as Administrator**. Use Windows PowerShell 5.1, the blue Windows application included with Windows.

Run preflight from inside the copied release folder:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
cd "$HOME\Desktop\HappyCone-Windows-1.0.0"
.\scripts\Test-HappyConeComputer.ps1 -WebPort 8080
```

Do not continue if `CanInstall` is false. Correct every blocking error first. Preflight does not change Windows. A computer sold with 4 GB RAM may report less than 4.00 GiB after hardware reservation; the supported reported floor is 3.50 GiB.

## Install a clean production system

Choose the first owner’s real name and username. The password must contain 12 to 256 characters. It is read as a protected value and is never written to the installer log or command line.

```powershell
$ownerPassword = Read-Host 'First owner password' -AsSecureString
.\scripts\Install-HappyCone.ps1 `
  -BundleRoot (Get-Location).Path `
  -OwnerName 'Owner full name' `
  -OwnerUsername 'owner' `
  -OwnerPassword $ownerPassword `
  -WebPort 8080
```

A successful installation prints the address staff should open, such as `http://192.168.1.20:8080`. It creates one owner account and an empty production database. It does not create sample staff, sample menu items, opening stock, or sales.

The installer may be run again after an interruption. It records completed phases and never deletes an initialized database. If it finds database files without a matching completed phase, it stops for technical review instead of overwriting them.

## Fix the network address

Reserve the displayed IPv4 address for this computer in the shop router’s DHCP settings. Use the computer’s network-adapter MAC address. A reservation keeps staff bookmarks working after a router or computer restart.

Do not create router port forwarding. For later access outside the shop, use a reviewed VPN or HTTPS tunnel with named-user access.

## Connect staff devices

1. Connect the cashier computer, tablet, or phone to the same shop network.
2. Open the address printed by the installer.
3. Sign in as the owner.
4. Add named staff in **Settings → Staff accounts** and assign only the required role.
5. Set stand and receipt details in **Settings → Stand details** and **Receipt details**.
6. Create the menu, prices, variations, serving choices, extras, and stock recipes in **Stock → Menu and stock recipes**.
7. Receive opening stock before the first sale.

Use a separate named account for each person. Do not share the owner account at the counter.

Internet loss does not interrupt the local system while the shop computer and router are running. If the Happy Cone API stops while a cashier is completing a cash sale, the open counter saves that sale on the device and syncs it after the API returns. Keep that browser tab open during a server interruption: a staff device cannot open or reload the counter until the local server is available again. Never clear browser data while a sale shows **Pending sync**.

## Restart and daily checks

The database, API, and web entry point start automatically with Windows. After a restart, allow up to two minutes, then open Happy Cone. Check system condition at any time from Administrator PowerShell:

```powershell
& 'C:\Program Files\HappyCone\current\scripts\Get-HappyConeStatus.ps1'
```

The result should show all three services as `Running`, `Health` and `Ready` as `True`, schema `0008`, adequate free disk, and a recent backup. A daily backup runs at 02:00 and keeps the latest 30 successful local backups.

## Acceptance before real sales

Complete all of these on the actual shop computer:

- Restart Windows and confirm Happy Cone returns without manual commands.
- Disconnect the internet while leaving the shop router on; confirm another shop device can sign in and complete a cash sale.
- Test Owner administrator, Manager, and Cashier accounts.
- Create a real product variation and stock recipe, receive stock, sell it, and confirm stock reduces exactly once.
- Open and close a business day; check payments, reports, activity, receipt reprint, and cash reconciliation.
- Create a backup, export it encrypted, and complete a restore rehearsal.
- Commission the exact Xprinter model using [the printer checklist](xprinter-commissioning.md).
- Record idle and checkout memory use. On the 4 GB PC, close unrelated applications if Windows begins paging heavily.

A failed check blocks live sales until corrected.
