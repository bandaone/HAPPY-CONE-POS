#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$ArchivePath,[Parameter(Mandatory)][string]$UsbPath,[string]$AgeRecipient,[string]$DataRoot="$env:ProgramData\HappyCone")
Import-Module (Join-Path $PSScriptRoot 'HappyCone.Operations.psm1') -Force

function Export-HappyConeBackup {
    [CmdletBinding()]
    param([string]$ArchivePath,[string]$UsbPath,[string]$AgeRecipient,[string]$DataRoot="$env:ProgramData\HappyCone")
    Test-HappyConeBackupArchive $ArchivePath | Out-Null
    if (-not (Test-Path $UsbPath -PathType Container)) { throw "The USB destination is not available: $UsbPath" }
    if (-not $AgeRecipient) {
        $policy = Get-Content (Join-Path $DataRoot 'backup-policy.json') -Raw | ConvertFrom-Json
        $AgeRecipient = $policy.age_recipient
    }
    if ($AgeRecipient -notmatch '^age1[0-9a-z]+$') { throw 'Set a valid age recipient before USB export.' }
    $age = "$env:ProgramFiles\HappyCone\runtime\age\age.exe"
    $destination = Join-Path $UsbPath ((Split-Path $ArchivePath -Leaf) + '.age')
    $temporary = "$destination.tmp"
    try {
        & $age -r $AgeRecipient -o $temporary $ArchivePath
        if ($LASTEXITCODE -ne 0) { throw 'Backup encryption failed.' }
        $sourceHash = (Get-FileHash $temporary -Algorithm SHA256).Hash.ToLowerInvariant()
        Move-Item $temporary $destination -Force
        $copiedHash = (Get-FileHash $destination -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($sourceHash -ne $copiedHash) { throw 'Encrypted USB backup checksum verification failed.' }
        [IO.File]::WriteAllText("$destination.sha256","$copiedHash  $(Split-Path $destination -Leaf)`r`n",(New-Object Text.UTF8Encoding($false)))
        [IO.File]::WriteAllText("$destination.json",(@{schema=1;encryptedWith='age';createdAt=[DateTime]::UtcNow.ToString('o');sha256=$copiedHash;source=(Split-Path $ArchivePath -Leaf)} | ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
        Get-Item $destination
    } finally { Remove-Item $temporary -Force -ErrorAction SilentlyContinue }
}

if ($MyInvocation.InvocationName -ne '.') { Export-HappyConeBackup @PSBoundParameters }
