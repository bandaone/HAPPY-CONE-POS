#requires -Version 5.1
[CmdletBinding()]
param([string]$DataRoot="$env:ProgramData\HappyCone", [int]$Keep=30)
Import-Module (Join-Path $PSScriptRoot 'HappyCone.Operations.psm1') -Force

function New-HappyConeBackup {
    [CmdletBinding()]
    param([string]$DataRoot="$env:ProgramData\HappyCone", [int]$Keep=30)
    $installRoot = "$env:ProgramFiles\HappyCone"
    $backupRoot = Join-Path $DataRoot 'backups'
    New-Item $backupRoot -ItemType Directory -Force | Out-Null
    $databaseData = Join-Path $DataRoot 'postgresql\data'
    $estimated = (@(Get-ChildItem $databaseData -File -Recurse -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum)
    if (-not $estimated) { $estimated=100MB }
    $drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($backupRoot).TrimEnd('\').TrimEnd(':'))
    Assert-HappyConeBackupSpace -FreeBytes $drive.Free -EstimatedBytes $estimated | Out-Null

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $name = "happycone-$stamp.dump"
    $archive = Join-Path $backupRoot $name
    $temporaryArchive = "$archive.tmp"
    $temporaryManifest = "$archive.json.tmp"
    $temporaryChecksum = "$archive.sha256.tmp"
    $pgRoot = Join-Path $installRoot 'runtime\postgresql\bin'
    $password = Get-HappyConeDatabasePassword $DataRoot
    try {
        Invoke-HappyConePgCommand (Join-Path $pgRoot 'pg_dump.exe') @('-h','127.0.0.1','-U','happycone','-d','happycone','-Fc','-f',$temporaryArchive) $password
        Invoke-HappyConePgCommand (Join-Path $pgRoot 'pg_restore.exe') @('--list',$temporaryArchive) $password | Out-Null
        $hash = (Get-FileHash $temporaryArchive -Algorithm SHA256).Hash.ToLowerInvariant()
        $state = Get-Content (Join-Path $DataRoot 'install-state.json') -Raw | ConvertFrom-Json
        $manifest = [ordered]@{ schema=1; format='postgresql-custom'; database='happycone'; createdAt=[DateTime]::UtcNow.ToString('o'); sha256=$hash; bytes=(Get-Item $temporaryArchive).Length; appVersion=$state.version; migration='0009' }
        [IO.File]::WriteAllText($temporaryManifest,($manifest | ConvertTo-Json -Depth 4),(New-Object Text.UTF8Encoding($false)))
        [IO.File]::WriteAllText($temporaryChecksum,"$hash  $name`r`n",(New-Object Text.UTF8Encoding($false)))
        Move-Item $temporaryArchive $archive
        Move-Item $temporaryManifest "$archive.json"
        Move-Item $temporaryChecksum "$archive.sha256"
        foreach ($old in (Get-HappyConePruneList -Archives @(Get-ChildItem $backupRoot -Filter '*.dump') -Keep $Keep)) {
            Remove-Item $old.FullName,"$($old.FullName).json","$($old.FullName).sha256" -Force -ErrorAction SilentlyContinue
        }
        Get-Item $archive
    } catch {
        Remove-Item $temporaryArchive,$temporaryManifest,$temporaryChecksum -Force -ErrorAction SilentlyContinue
        throw
    }
}

if ($MyInvocation.InvocationName -ne '.') { New-HappyConeBackup -DataRoot $DataRoot -Keep $Keep }
