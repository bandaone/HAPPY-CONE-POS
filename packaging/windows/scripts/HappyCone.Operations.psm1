Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-HappyConeBackupSpace {
    [CmdletBinding()]
    param([long]$FreeBytes, [long]$EstimatedBytes)
    $required = [math]::Max(100MB, $EstimatedBytes * 2)
    if ($FreeBytes -lt $required) { throw "Not enough free disk space for a safe backup. Required: $required bytes; available: $FreeBytes bytes." }
    $true
}

function Get-HappyConePruneList {
    [CmdletBinding()]
    param([object[]]$Archives, [ValidateRange(1,365)][int]$Keep = 30)
    @($Archives | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep)
}

function ConvertTo-HappyConeRedactedConfig {
    [CmdletBinding()]
    param([string]$Text)
    (($Text -split "`r?`n") | ForEach-Object {
        if ($_ -match '^(?<name>[^=]*(PASSWORD|SECRET|TOKEN|KEY|DATABASE_URL)[^=]*)=') { "$($matches.name)=[REDACTED]" } else { $_ }
    }) -join [Environment]::NewLine
}

function Test-HappyConeBackupArchive {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$ArchivePath)
    if (-not (Test-Path $ArchivePath -PathType Leaf)) { throw "Backup archive is missing: $ArchivePath" }
    $checksumPath = "$ArchivePath.sha256"
    if (-not (Test-Path $checksumPath -PathType Leaf)) { throw "Backup checksum is missing: $checksumPath" }
    $expected = ((Get-Content $checksumPath -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expected -ne $actual) { throw "Backup checksum failed for $ArchivePath" }
    $manifestPath = "$ArchivePath.json"
    if (Test-Path $manifestPath) {
        $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
        if ($manifest.schema -ne 1 -or $manifest.format -ne 'postgresql-custom') { throw 'Unsupported backup manifest.' }
        if ($manifest.sha256 -and ([string]$manifest.sha256).ToLowerInvariant() -ne $actual) { throw 'Backup manifest checksum does not match the archive.' }
    }
    $true
}

function Get-HappyConeDatabasePassword {
    [CmdletBinding()]
    param([string]$DataRoot)
    $environment = Get-Content (Join-Path $DataRoot 'api.env') -Raw
    $password = ([regex]::Match($environment, 'happycone:([^@]+)@')).Groups[1].Value
    if (-not $password) { throw 'The Happy Cone database credential could not be read.' }
    $password
}

function Invoke-HappyConePgCommand {
    [CmdletBinding()]
    param([string]$Executable, [string[]]$Arguments, [string]$Password)
    $old = $env:PGPASSWORD
    try {
        $env:PGPASSWORD = $Password
        & $Executable @Arguments
        if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($Executable)) failed with exit code $LASTEXITCODE." }
    } finally {
        if ($null -eq $old) { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue } else { $env:PGPASSWORD=$old }
    }
}

Export-ModuleMember -Function Assert-HappyConeBackupSpace,Get-HappyConePruneList,ConvertTo-HappyConeRedactedConfig,Test-HappyConeBackupArchive,Get-HappyConeDatabasePassword,Invoke-HappyConePgCommand
