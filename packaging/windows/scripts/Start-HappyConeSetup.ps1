#requires -Version 5.1
#requires -RunAsAdministrator
[CmdletBinding()]
param(
    [string]$BundleRoot = (Split-Path $PSScriptRoot -Parent),
    [ValidateRange(1024,65535)][int]$WebPort = 8080
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'Happy Cone guided setup' -ForegroundColor Magenta
Write-Host 'This setup can be safely run again after an interrupted installation.'
Write-Host ''

$preflight = & (Join-Path $PSScriptRoot 'Test-HappyConeComputer.ps1') -WebPort $WebPort -PassThru
if (-not $preflight.CanInstall) {
    $preflight.BlockingErrors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    throw 'This computer is not ready. Correct the listed item and run this setup again.'
}
Write-Host "Computer ready. Happy Cone will use $($preflight.Address)." -ForegroundColor Green

do { $ownerName = (Read-Host 'Owner full name').Trim() } while (-not $ownerName)
do { $ownerUsername = (Read-Host 'Owner username (3-40 letters, numbers, dot, dash or underscore)').Trim() } while ($ownerUsername -notmatch '^[a-zA-Z0-9._-]{3,40}$')
Write-Host 'Choose a password of at least 12 characters.'
do {
    $ownerPassword = Read-Host 'Owner password' -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ownerPassword)
    try { $passwordLength = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer).Length }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
    if ($passwordLength -lt 12 -or $passwordLength -gt 256) { Write-Warning 'The password must contain 12 to 256 characters. Please try again.' }
} while ($passwordLength -lt 12 -or $passwordLength -gt 256)

$installParameters = @{
    BundleRoot = [IO.Path]::GetFullPath($BundleRoot)
    OwnerName = $ownerName
    OwnerUsername = $ownerUsername
    OwnerPassword = $ownerPassword
    WebPort = $WebPort
}
& (Join-Path $PSScriptRoot 'Install-HappyCone.ps1') @installParameters

Write-Host ''
Write-Host 'Setup completed. Use the address printed above to open Happy Cone.' -ForegroundColor Green
