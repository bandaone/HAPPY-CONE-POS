# Happy Cone backup, recovery, and support

Run these commands from **Windows PowerShell as Administrator**. Production scripts live in `C:\Program Files\HappyCone\current\scripts` and production data stays in `C:\ProgramData\HappyCone`.

## Check system condition

```powershell
& 'C:\Program Files\HappyCone\current\scripts\Get-HappyConeStatus.ps1'
```

Check this after a power cut, Windows restart, failed checkout, or update. All services should be running, `/health` and `/ready` should pass, schema should be `0008`, and the latest backup should be recent.

During a server interruption, keep any already-open cashier tab open and do not clear its browser data. A cash payment that cannot reach the API is retained there as **Pending sync**. Restore service before opening or reloading Happy Cone on staff devices, then confirm every pending sale syncs before closing the business day.

## Create a backup now

```powershell
$backup = & 'C:\Program Files\HappyCone\current\scripts\Backup-HappyCone.ps1'
$backup.FullName
```

The command checks free disk first, writes a PostgreSQL custom-format archive to a temporary name, validates it with `pg_restore`, writes a JSON manifest and SHA-256 file, and only then publishes the backup. A failed or low-disk attempt does not remove the last valid backup. The daily scheduled task keeps 30 successful local backups.

## Configure encrypted USB export

Create the age recovery identity on a separate, protected owner computer. Keep that identity offline in two controlled places. Put only its public `age1...` recipient in `C:\ProgramData\HappyCone\backup-policy.json`. Never copy the recovery identity to the shop server or beside exported backups.

Insert the backup USB and run:

```powershell
& 'C:\Program Files\HappyCone\current\scripts\Export-HappyConeBackup.ps1' `
  -ArchivePath $backup.FullName `
  -UsbPath 'E:\HappyConeBackups'
```

The export fails without changing the local backup if the USB is absent. A successful export contains `.dump.age`, `.json`, and `.sha256` files. Store the USB away from the shop computer.

## Rehearse a restore

Choose a local unencrypted `.dump` backup with its adjacent `.json` and `.sha256` files:

```powershell
& 'C:\Program Files\HappyCone\current\scripts\Restore-HappyCone.ps1' `
  -ArchivePath 'C:\ProgramData\HappyCone\backups\happycone-YYYYMMDD-HHMMSS.dump'
```

The rehearsal verifies the checksum and archive, restores into a separate temporary database, checks migration `0008`, starts an isolated API on loopback, requires `/ready` to pass, and removes only the temporary database. It does not replace live sales data.

## Replace live data after an approved recovery decision

First read `installIdentity` from `C:\ProgramData\HappyCone\install-state.json`. Then run:

```powershell
& 'C:\Program Files\HappyCone\current\scripts\Restore-HappyCone.ps1' `
  -ArchivePath 'C:\ProgramData\HappyCone\backups\happycone-YYYYMMDD-HHMMSS.dump' `
  -ReplaceLiveDatabase `
  -ExpectedInstallIdentity 'paste-the-exact-install-identity'
```

The command rehearses the archive, creates a new safety backup, stops API writes, restores, restarts the API, and requires readiness before reporting success. Keep the safety backup and the selected recovery archive.

## Install an update

Copy the complete newer release folder from USB to Windows. Updates must use a higher numeric version such as `1.0.1`.

```powershell
& 'C:\Program Files\HappyCone\current\scripts\Update-HappyCone.ps1' `
  -BundleRoot 'D:\HappyCone-Windows-1.0.1'
```

The updater verifies every release checksum, creates and validates a pre-update backup, stages a separate version, stops writes, migrates, switches the active version, and checks `/ready`. A failure keeps the backup and failure log and restores the previous application files.

## Create a support bundle

```powershell
& 'C:\Program Files\HappyCone\current\scripts\New-HappyConeSupportBundle.ps1'
```

The ZIP contains installation metadata, status, redacted configuration, and bounded recent logs. It excludes credentials, the database, and backup archives.

## Remove a test installation

This keeps the database and backups:

```powershell
& 'C:\Program Files\HappyCone\current\scripts\Uninstall-HappyCone.ps1' -KeepData
```

Deleting production data is a separate destructive action. It requires `-RemoveData` and the exact `installIdentity`. Do not use it for routine repair or updates.
