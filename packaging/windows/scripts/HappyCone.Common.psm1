Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function New-HappyConeSecret {
    [CmdletBinding()]
    param([ValidateRange(32, 128)][int]$Bytes = 32)
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+','-').Replace('/','_')
}

function Get-HappyConeFirewallParameters {
    [CmdletBinding()]
    param([ValidateRange(1024,65535)][int]$WebPort)
    @{
        DisplayName = 'Happy Cone POS (Private network)'
        Direction = 'Inbound'
        Action = 'Allow'
        Protocol = 'TCP'
        LocalPort = $WebPort
        Profile = 'Private'
    }
}

function Test-HappyConePrivateIPv4 {
    param([string]$Address)
    $parsed = $null
    if (-not [System.Net.IPAddress]::TryParse($Address, [ref]$parsed)) { return $false }
    $bytes = $parsed.GetAddressBytes()
    if ($bytes.Length -ne 4) { return $false }
    ($bytes[0] -eq 10) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168) -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31)
}

function Get-HappyConeNetworkIdentity {
    [CmdletBinding()]
    param()
    $privateAliases = @(Get-NetConnectionProfile -ErrorAction Stop | Where-Object NetworkCategory -eq 'Private' | Select-Object -ExpandProperty InterfaceAlias)
    $address = Get-NetIPAddress -AddressFamily IPv4 -Type Unicast -ErrorAction Stop |
        Where-Object { $_.InterfaceAlias -in $privateAliases -and (Test-HappyConePrivateIPv4 $_.IPAddress) } |
        Sort-Object InterfaceMetric, SkipAsSource |
        Select-Object -First 1
    if (-not $address) { throw 'No private IPv4 address was found on a Windows Private network.' }
    [pscustomobject]@{ ComputerName=$env:COMPUTERNAME; IPv4=$address.IPAddress; NetworkProfiles=@('Private') }
}

function Test-HappyConeReleaseManifest {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$BundleRoot)
    $root = [IO.Path]::GetFullPath($BundleRoot)
    $manifestPath = Join-Path $root 'release-manifest.json'
    if (-not (Test-Path $manifestPath -PathType Leaf)) { throw 'release-manifest.json is missing.' }
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.schema -ne 1 -or $manifest.architecture -ne 'win_amd64') { throw 'Unsupported release manifest.' }
    foreach ($entry in $manifest.files) {
        $candidate = [IO.Path]::GetFullPath((Join-Path $root ([string]$entry.path)))
        if (-not $candidate.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe manifest path: $($entry.path)" }
        if (-not (Test-Path $candidate -PathType Leaf)) { throw "Release file is missing: $($entry.path)" }
        $actual = (Get-FileHash $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne ([string]$entry.sha256).ToLowerInvariant()) { throw "Release checksum failed: $($entry.path)" }
    }
    $manifest
}

function Protect-HappyConeFile {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Path, [string]$ServiceIdentity = 'SYSTEM')
    if (-not (Test-Path $Path -PathType Leaf)) { throw "Cannot protect missing file: $Path" }
    $grants = @('SYSTEM:(F)', 'BUILTIN\Administrators:(F)')
    if ($ServiceIdentity -ne 'SYSTEM') { $grants += "$ServiceIdentity`:(R)" }
    & icacls.exe $Path '/inheritance:r' '/grant:r' $grants | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not secure $Path" }
}

function Expand-HappyConeTemplate {
    param([string]$Template, [hashtable]$Values)
    $rendered = $Template
    foreach ($key in $Values.Keys) { $rendered = $rendered.Replace("{{$key}}", [string]$Values[$key]) }
    if ($rendered -match '\{\{[^}]+\}\}') { throw 'A configuration template contains unresolved values.' }
    $rendered
}

function Write-HappyConeConfiguration {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$InstallRoot,
        [Parameter(Mandatory)][string]$DataRoot,
        [Parameter(Mandatory)][string]$PublicHost,
        [Parameter(Mandatory)][string]$IPv4,
        [Parameter(Mandatory)][string]$DatabasePassword,
        [ValidateRange(1024,65535)][int]$WebPort = 8080,
        [switch]$WhatIfMode
    )
    if ($PublicHost -notmatch '^[A-Za-z0-9.-]+$') { throw 'The computer name contains unsupported characters.' }
    if (-not (Test-HappyConePrivateIPv4 $IPv4)) { throw 'The server address must be a private IPv4 address.' }
    $templateRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'config'
    $allowedHosts = '["' + (($PublicHost, $IPv4, 'localhost', '127.0.0.1') -join '","') + '"]'
    $values = @{
        INSTALL_ROOT=$InstallRoot.Replace('\','/'); DATA_ROOT=$DataRoot.Replace('\','/'); PUBLIC_HOST=$PublicHost
        IPV4=$IPv4; WEB_PORT=$WebPort; DATABASE_PASSWORD=$DatabasePassword
        ALLOWED_HOSTS=$allowedHosts
    }
    $api = Expand-HappyConeTemplate (Get-Content (Join-Path $templateRoot 'api.env.template') -Raw) $values
    $caddy = Expand-HappyConeTemplate (Get-Content (Join-Path $templateRoot 'Caddyfile.template') -Raw) $values
    $postgres = Get-Content (Join-Path $templateRoot 'postgresql-low-memory.conf') -Raw
    $result = [pscustomobject]@{ ApiEnvironment=$api; Caddyfile=$caddy; PostgreSql=$postgres; FirewallParameters=(Get-HappyConeFirewallParameters $WebPort) }
    if ($WhatIfMode) { return $result }
    New-Item $DataRoot -ItemType Directory -Force | Out-Null
    $apiPath = Join-Path $DataRoot 'api.env'
    $caddyPath = Join-Path $DataRoot 'Caddyfile'
    $postgresPath = Join-Path $DataRoot 'postgresql-low-memory.conf'
    [IO.File]::WriteAllText($apiPath, $api, (New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText($caddyPath, $caddy, (New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText($postgresPath, $postgres, (New-Object Text.UTF8Encoding($false)))
    Protect-HappyConeFile $apiPath
    [pscustomobject]@{ ApiEnvironmentPath=$apiPath; CaddyfilePath=$caddyPath; PostgreSqlPath=$postgresPath; FirewallParameters=$result.FirewallParameters }
}

function Test-HappyConePreflight {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$Facts, [ValidateRange(1024,65535)][int]$WebPort = 8080)
    $errors = New-Object Collections.Generic.List[string]
    $warnings = New-Object Collections.Generic.List[string]
    if (-not $Facts.Is64Bit) { $errors.Add('A 64-bit Windows installation is required.') }
    if ([int]$Facts.WindowsBuild -lt 19044) { $errors.Add('Windows 10 21H2 or newer Windows is required.') }
    if ([double]$Facts.TotalMemoryGB -lt 3.5) { $errors.Add('At least 4 GB installed memory is required; Windows reported too little usable memory.') }
    if ([double]$Facts.FreeDiskGB -lt 10) { $errors.Add('At least 10 GB free disk space is required.') }
    if (-not $Facts.WebPortAvailable) { $errors.Add("The web port $WebPort is already in use.") }
    if (-not $Facts.ApiPortAvailable) { $errors.Add('The API port 8000 is already in use.') }
    if (@($Facts.NetworkProfiles) -notcontains 'Private') { $errors.Add('Connect the computer to a Windows Private network before installation.') }
    if (-not (Test-HappyConePrivateIPv4 ([string]$Facts.IPv4))) { $errors.Add('A private IPv4 server address is required.') }
    if ([double]$Facts.TotalMemoryGB -lt 8) { $warnings.Add('4 GB is supported; close other applications while Happy Cone is running.') }
    [pscustomobject]@{
        CanInstall=($errors.Count -eq 0); BlockingErrors=@($errors); Warnings=@($warnings)
        Address="http://$($Facts.IPv4):$WebPort"; ComputerName=$Facts.ComputerName; IPv4=$Facts.IPv4
        TotalMemoryGB=[double]$Facts.TotalMemoryGB; FreeDiskGB=[double]$Facts.FreeDiskGB
        FirewallParameters=(Get-HappyConeFirewallParameters $WebPort)
    }
}

Export-ModuleMember -Function New-HappyConeSecret,Get-HappyConeFirewallParameters,Get-HappyConeNetworkIdentity,Test-HappyConeReleaseManifest,Protect-HappyConeFile,Write-HappyConeConfiguration,Test-HappyConePreflight
