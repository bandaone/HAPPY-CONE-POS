#requires -Version 5.1
#requires -RunAsAdministrator
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BundleRoot,
    [Parameter(Mandatory)][string]$OwnerName,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9._-]{3,40}$')][string]$OwnerUsername,
    [Parameter(Mandatory)][Security.SecureString]$OwnerPassword,
    [ValidateRange(1024,65535)][int]$WebPort = 8080,
    [string]$InstallRoot = "$env:ProgramFiles\HappyCone",
    [string]$DataRoot = "$env:ProgramData\HappyCone"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'HappyCone.Common.psm1') -Force

function Save-HappyConeState([hashtable]$State, [string]$Path) {
    $temporary = "$Path.tmp"
    $State.updatedAt = [DateTime]::UtcNow.ToString('o')
    [IO.File]::WriteAllText($temporary, ($State | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
    Move-Item $temporary $Path -Force
}

function Invoke-HappyConeCommand([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory = '') {
    $old = Get-Location
    try {
        if ($WorkingDirectory) { Set-Location $WorkingDirectory }
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($FilePath)) failed with exit code $LASTEXITCODE." }
    } finally { Set-Location $old }
}

function ConvertFrom-HappyConeSecureString([Security.SecureString]$Value) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Expand-ZipSingleRoot([string]$Archive, [string]$Destination) {
    New-Item $Destination -ItemType Directory -Force | Out-Null
    Expand-Archive $Archive $Destination -Force
}

function Wait-HappyConeUri([string]$Uri, [int]$TimeoutSeconds = 90) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest $Uri -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { return $response }
        } catch { Start-Sleep -Seconds 2 }
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Timed out waiting for $Uri"
}

function Set-HappyConeDirectoryAcl([string]$Path, [string]$Identity) {
    & icacls.exe $Path '/inheritance:r' '/grant:r' 'SYSTEM:(OI)(CI)(F)' 'BUILTIN\Administrators:(OI)(CI)(F)' "$Identity`:(OI)(CI)(M)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not secure directory $Path" }
}

function New-HappyConeShortcut([string]$Path, [string]$Target, [string]$Arguments = '') {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($Path)
    $shortcut.TargetPath = $Target
    $shortcut.Arguments = $Arguments
    $shortcut.WorkingDirectory = Split-Path $Target -Parent
    $shortcut.Save()
}

function Install-HappyCone {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$BundleRoot,
        [Parameter(Mandatory)][string]$OwnerName,
        [Parameter(Mandatory)][string]$OwnerUsername,
        [Parameter(Mandatory)][Security.SecureString]$OwnerPassword,
        [int]$WebPort,
        [string]$InstallRoot,
        [string]$DataRoot
    )
    $bundle = [IO.Path]::GetFullPath($BundleRoot)
    $manifest = Test-HappyConeReleaseManifest $bundle
    $network = Get-HappyConeNetworkIdentity
    $preflightFacts = [pscustomobject]@{
        Is64Bit=[Environment]::Is64BitOperatingSystem
        WindowsBuild=[int](Get-CimInstance Win32_OperatingSystem).BuildNumber
        TotalMemoryGB=(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB
        FreeDiskGB=(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($env:SystemDrive)'").FreeSpace / 1GB
        WebPortAvailable=$true; ApiPortAvailable=$true
        NetworkProfiles=$network.NetworkProfiles; IPv4=$network.IPv4; ComputerName=$network.ComputerName
    }
    $listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port
    $preflightFacts.WebPortAvailable = (-not ($listeners -contains $WebPort)) -or [bool](Get-Service HappyConeWeb -ErrorAction SilentlyContinue)
    $preflightFacts.ApiPortAvailable = (-not ($listeners -contains 8000)) -or [bool](Get-Service HappyConeApi -ErrorAction SilentlyContinue)
    $preflight = Test-HappyConePreflight -Facts $preflightFacts -WebPort $WebPort
    if (-not $preflight.CanInstall) { throw ($preflight.BlockingErrors -join [Environment]::NewLine) }

    $statePath = Join-Path $DataRoot 'install-state.json'
    $state = @{}
    if (Test-Path $statePath) {
        $loaded = Get-Content $statePath -Raw | ConvertFrom-Json
        $loaded.psobject.Properties | ForEach-Object { $state[$_.Name] = $_.Value }
    } else {
        New-Item $DataRoot -ItemType Directory -Force | Out-Null
        $state = @{ schema=1; installIdentity=[Guid]::NewGuid().ToString(); DatabaseInitialized=$false; DatabaseCreated=$false; OwnerCreated=$false; ServicesInstalled=$false; Complete=$false }
        Save-HappyConeState $state $statePath
    }

    $version = [string]$manifest.version
    $versionRoot = Join-Path $InstallRoot "versions\$version"
    $runtimeRoot = Join-Path $InstallRoot 'runtime'
    $logsRoot = Join-Path $DataRoot 'logs'
    $postgresData = Join-Path $DataRoot 'postgresql\data'
    $newVersion = -not (Test-Path $versionRoot)
    $installedServices = New-Object Collections.Generic.List[string]
    try {
        New-Item (Split-Path $versionRoot -Parent),$runtimeRoot,$logsRoot,(Join-Path $DataRoot 'backups') -ItemType Directory -Force | Out-Null
        Set-HappyConeDirectoryAcl $logsRoot 'NT AUTHORITY\LOCAL SERVICE'
        if ($newVersion) {
            New-Item $versionRoot -ItemType Directory | Out-Null
            Copy-Item (Join-Path $bundle 'api'),(Join-Path $bundle 'web'),(Join-Path $bundle 'wheelhouse'),(Join-Path $bundle 'scripts'),(Join-Path $bundle 'config') $versionRoot -Recurse
            New-Item (Join-Path $versionRoot 'services') -ItemType Directory | Out-Null
        }

        $pythonRoot = Join-Path $runtimeRoot 'python'
        $python = Join-Path $pythonRoot 'python.exe'
        if (-not (Test-Path $python)) {
            $pythonInstaller = Get-ChildItem (Join-Path $bundle 'installers\python-*-amd64.exe') | Select-Object -First 1
            $process = Start-Process $pythonInstaller.FullName -ArgumentList '/quiet','InstallAllUsers=1','PrependPath=0','Include_test=0','Include_launcher=0',"TargetDir=$pythonRoot" -Wait -PassThru
            if ($process.ExitCode -ne 0) { throw "Python installation failed with exit code $($process.ExitCode)." }
        }

        $postgresRoot = Join-Path $runtimeRoot 'postgresql'
        $pgCtl = Join-Path $postgresRoot 'bin\pg_ctl.exe'
        if (-not (Test-Path $pgCtl)) {
            $archive = Get-ChildItem (Join-Path $bundle 'installers\postgresql-*-windows-x64-binaries.zip') | Select-Object -First 1
            $unpack = Join-Path $runtimeRoot 'postgresql-unpack'
            Expand-ZipSingleRoot $archive.FullName $unpack
            $pgsql = Get-ChildItem $unpack -Directory -Recurse | Where-Object Name -eq 'pgsql' | Select-Object -First 1
            if (-not $pgsql) { throw 'The PostgreSQL archive did not contain pgsql.' }
            Move-Item $pgsql.FullName $postgresRoot
            Remove-Item $unpack -Recurse -Force
        }

        $caddyRoot = Join-Path $runtimeRoot 'caddy'
        $caddy = Join-Path $caddyRoot 'caddy.exe'
        if (-not (Test-Path $caddy)) {
            Expand-ZipSingleRoot (Get-ChildItem (Join-Path $bundle 'runtime\caddy-*.zip') | Select-Object -First 1).FullName $caddyRoot
        }
        $ageRoot = Join-Path $runtimeRoot 'age'
        if (-not (Test-Path (Join-Path $ageRoot 'age.exe'))) {
            $ageUnpack = Join-Path $runtimeRoot 'age-unpack'
            Expand-ZipSingleRoot (Get-ChildItem (Join-Path $bundle 'runtime\age-*.zip') | Select-Object -First 1).FullName $ageUnpack
            $ageExe = Get-ChildItem $ageUnpack -Filter 'age.exe' -Recurse | Select-Object -First 1
            $ageKeygen = Get-ChildItem $ageUnpack -Filter 'age-keygen.exe' -Recurse | Select-Object -First 1
            New-Item $ageRoot -ItemType Directory -Force | Out-Null
            Copy-Item $ageExe.FullName,$ageKeygen.FullName $ageRoot
            Remove-Item $ageUnpack -Recurse -Force
        }

        $venv = Join-Path $versionRoot 'venv'
        if (-not (Test-Path (Join-Path $venv 'Scripts\python.exe'))) { Invoke-HappyConeCommand $python @('-m','venv',$venv) }
        $venvPython = Join-Path $venv 'Scripts\python.exe'
        $wheels = @(Get-ChildItem (Join-Path $versionRoot 'wheelhouse\*.whl') | ForEach-Object FullName)
        Invoke-HappyConeCommand $venvPython (@('-m','pip','install','--no-index','--no-deps') + $wheels)

        $apiEnvironmentPath = Join-Path $DataRoot 'api.env'
        $adminSecretPath = Join-Path $DataRoot 'database-admin.secret'
        if (-not (Test-Path $apiEnvironmentPath)) {
            $appDbPassword = New-HappyConeSecret
            $configuration = Write-HappyConeConfiguration -InstallRoot $InstallRoot -DataRoot $DataRoot -PublicHost $network.ComputerName -IPv4 $network.IPv4 -DatabasePassword $appDbPassword -WebPort $WebPort
            Protect-HappyConeFile $configuration.ApiEnvironmentPath -ServiceIdentity 'NT AUTHORITY\LOCAL SERVICE'
        } else {
            $configuration = [pscustomobject]@{ ApiEnvironmentPath=$apiEnvironmentPath; CaddyfilePath=(Join-Path $DataRoot 'Caddyfile'); FirewallParameters=(Get-HappyConeFirewallParameters $WebPort) }
            $appDbPassword = ([regex]::Match((Get-Content $apiEnvironmentPath -Raw), 'happycone:([^@]+)@')).Groups[1].Value
            if (-not $appDbPassword) { throw 'Could not read the application database credential.' }
        }

        if (-not $state.DatabaseInitialized) {
            if ((Test-Path $postgresData) -and (Get-ChildItem $postgresData -Force | Select-Object -First 1)) { throw 'Refusing to initialize over an existing PostgreSQL data directory.' }
            New-Item $postgresData -ItemType Directory -Force | Out-Null
            Set-HappyConeDirectoryAcl (Split-Path $postgresData -Parent) 'NT AUTHORITY\NETWORK SERVICE'
            $postgresAdminPassword = New-HappyConeSecret
            $passwordFile = Join-Path $DataRoot 'initdb-password.tmp'
            try {
                [IO.File]::WriteAllText($passwordFile, $postgresAdminPassword, (New-Object Text.UTF8Encoding($false)))
                Protect-HappyConeFile $passwordFile
                Invoke-HappyConeCommand (Join-Path $postgresRoot 'bin\initdb.exe') @('-D',$postgresData,'--username=postgres','--auth=scram-sha-256',"--pwfile=$passwordFile",'--encoding=UTF8','--locale=C')
            } finally { Remove-Item $passwordFile -Force -ErrorAction SilentlyContinue }
            Copy-Item (Join-Path (Split-Path $PSScriptRoot -Parent) 'config\postgresql-low-memory.conf') $postgresData
            Add-Content (Join-Path $postgresData 'postgresql.conf') "include = 'postgresql-low-memory.conf'"
            [IO.File]::WriteAllText($adminSecretPath, $postgresAdminPassword, (New-Object Text.UTF8Encoding($false)))
            Protect-HappyConeFile $adminSecretPath
            Invoke-HappyConeCommand $pgCtl @('register','-N','HappyConePostgreSQL','-D',$postgresData,'-S','auto','-U','NT AUTHORITY\NetworkService')
            $state.DatabaseInitialized = $true
            Save-HappyConeState $state $statePath
        }
        if ((Get-Service HappyConePostgreSQL -ErrorAction SilentlyContinue).Status -ne 'Running') { Start-Service HappyConePostgreSQL }

        $postgresAdminPassword = Get-Content $adminSecretPath -Raw
        if (-not $state.DatabaseCreated) {
            $env:PGPASSWORD = $postgresAdminPassword
            try {
                $psql = Join-Path $postgresRoot 'bin\psql.exe'
                $roleExists = & $psql -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='happycone'"
                if (-not $roleExists) { "CREATE ROLE happycone LOGIN PASSWORD '$appDbPassword';" | & $psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -q }
                $dbExists = & $psql -h 127.0.0.1 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='happycone'"
                if (-not $dbExists) { & (Join-Path $postgresRoot 'bin\createdb.exe') -h 127.0.0.1 -U postgres -O happycone happycone }
                if ($LASTEXITCODE -ne 0) { throw 'Database or restricted role creation failed.' }
            } finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
            $state.DatabaseCreated = $true
            Save-HappyConeState $state $statePath
        }

        $environment = @{}
        Get-Content $apiEnvironmentPath | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object {
            $parts = $_.Split('=',2); $environment[$parts[0]]=$parts[1]
        }
        $previous = @{}
        try {
            foreach ($key in $environment.Keys) { $previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process'); [Environment]::SetEnvironmentVariable($key,$environment[$key],'Process') }
            Invoke-HappyConeCommand $venvPython @('-m','app.cli','migrate') (Join-Path $versionRoot 'api')
            if (-not $state.OwnerCreated) {
                $plainOwnerPassword = ConvertFrom-HappyConeSecureString $OwnerPassword
                [Environment]::SetEnvironmentVariable('HAPPYCONE_BOOTSTRAP_PASSWORD',$plainOwnerPassword,'Process')
                try { Invoke-HappyConeCommand $venvPython @('-m','app.cli','create-user','--username',$OwnerUsername,'--name',$OwnerName,'--role','OWNER_ADMIN','--password-env','HAPPYCONE_BOOTSTRAP_PASSWORD') (Join-Path $versionRoot 'api') }
                finally { [Environment]::SetEnvironmentVariable('HAPPYCONE_BOOTSTRAP_PASSWORD',$null,'Process'); Remove-Item Env:HAPPYCONE_BOOTSTRAP_PASSWORD -ErrorAction SilentlyContinue; $plainOwnerPassword=$null }
                $state.OwnerCreated = $true
                Save-HappyConeState $state $statePath
            }
        } finally {
            [Environment]::SetEnvironmentVariable('HAPPYCONE_BOOTSTRAP_PASSWORD',$null,'Process')
            foreach ($key in $environment.Keys) { [Environment]::SetEnvironmentVariable($key,$previous[$key],'Process') }
        }

        $current = Join-Path $InstallRoot 'current'
        if (Test-Path $current) { Remove-Item $current -Force }
        Invoke-HappyConeCommand "$env:SystemRoot\System32\cmd.exe" @('/d','/c','mklink','/J',$current,$versionRoot)
        $backupPolicy = Join-Path $DataRoot 'backup-policy.json'
        if (-not (Test-Path $backupPolicy)) { Copy-Item (Join-Path $current 'config\backup-policy.json') $backupPolicy }

        $servicesRoot = Join-Path $versionRoot 'services'
        $winswSource = (Get-ChildItem (Join-Path $bundle 'runtime\WinSW-*-x64.exe') | Select-Object -First 1).FullName
        $apiService = Join-Path $servicesRoot 'HappyConeApi.exe'
        $webService = Join-Path $servicesRoot 'HappyConeWeb.exe'
        Copy-Item $winswSource $apiService -Force; Copy-Item $winswSource $webService -Force
        $envXml = foreach ($key in ($environment.Keys | Sort-Object)) {
            $name=[Security.SecurityElement]::Escape($key); $value=[Security.SecurityElement]::Escape($environment[$key]); "<env name=`"$name`" value=`"$value`" />"
        }
        $apiXml = Get-Content (Join-Path (Split-Path $PSScriptRoot -Parent) 'config\happycone-api-service.xml.template') -Raw
        $apiXml = $apiXml.Replace('{{PYTHON_EXE}}',[Security.SecurityElement]::Escape($venvPython)).Replace('{{API_ROOT}}',[Security.SecurityElement]::Escape((Join-Path $versionRoot 'api'))).Replace('{{API_ENV_XML}}',($envXml -join "`r`n  ")).Replace('{{LOG_ROOT}}',[Security.SecurityElement]::Escape($logsRoot))
        $webXml = Get-Content (Join-Path (Split-Path $PSScriptRoot -Parent) 'config\happycone-web-service.xml.template') -Raw
        $webXml = $webXml.Replace('{{CADDY_EXE}}',[Security.SecurityElement]::Escape($caddy)).Replace('{{CADDYFILE}}',[Security.SecurityElement]::Escape($configuration.CaddyfilePath)).Replace('{{RUNTIME_ROOT}}',[Security.SecurityElement]::Escape($runtimeRoot)).Replace('{{LOG_ROOT}}',[Security.SecurityElement]::Escape($logsRoot))
        [IO.File]::WriteAllText((Join-Path $servicesRoot 'HappyConeApi.xml'),$apiXml,(New-Object Text.UTF8Encoding($false)))
        [IO.File]::WriteAllText((Join-Path $servicesRoot 'HappyConeWeb.xml'),$webXml,(New-Object Text.UTF8Encoding($false)))
        Protect-HappyConeFile (Join-Path $servicesRoot 'HappyConeApi.xml') -ServiceIdentity 'NT AUTHORITY\LOCAL SERVICE'

        foreach ($service in @($apiService,$webService)) {
            $serviceName = [IO.Path]::GetFileNameWithoutExtension($service)
            if (-not (Get-Service $serviceName -ErrorAction SilentlyContinue)) { Invoke-HappyConeCommand $service @('install'); $installedServices.Add($service) }
        }
        $existingRule = Get-NetFirewallRule -DisplayName $configuration.FirewallParameters.DisplayName -ErrorAction SilentlyContinue
        if (-not $existingRule) { $firewallParameters=$configuration.FirewallParameters; New-NetFirewallRule @firewallParameters | Out-Null }
        if ((Get-Service HappyConeApi).Status -eq 'Running') { Invoke-HappyConeCommand $apiService @('restart') } else { Invoke-HappyConeCommand $apiService @('start') }
        Wait-HappyConeUri 'http://127.0.0.1:8000/health' | Out-Null
        Wait-HappyConeUri 'http://127.0.0.1:8000/ready' | Out-Null
        if ((Get-Service HappyConeWeb).Status -eq 'Running') { Invoke-HappyConeCommand $webService @('restart') } else { Invoke-HappyConeCommand $webService @('start') }
        $page = Wait-HappyConeUri "http://127.0.0.1:$WebPort/"
        if ($page.Content -notmatch 'id="root"') { throw 'The Happy Cone login page index.html did not load.' }
        & (Join-Path $current 'scripts\Register-HappyConeBackupTask.ps1') -DataRoot $DataRoot

        $desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
        $programs = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'
        New-HappyConeShortcut (Join-Path $desktop 'Happy Cone POS.lnk') "$env:SystemRoot\System32\cmd.exe" "/c start http://$($network.IPv4):$WebPort"
        New-HappyConeShortcut (Join-Path $programs 'Happy Cone POS.lnk') "$env:SystemRoot\System32\cmd.exe" "/c start http://$($network.IPv4):$WebPort"
        $state.ServicesInstalled=$true; $state.Complete=$true; $state.version=$version; $state.address="http://$($network.IPv4):$WebPort"
        Save-HappyConeState $state $statePath
        Write-Host "Happy Cone is ready at $($state.address)"
    } catch {
        foreach ($service in $installedServices) { try { Invoke-HappyConeCommand $service @('uninstall') } catch {} }
        if ($newVersion -and (Test-Path $versionRoot)) { Remove-Item $versionRoot -Recurse -Force }
        $state.Complete=$false; $state.lastError=$_.Exception.Message
        Save-HappyConeState $state $statePath
        throw
    }
}

Install-HappyCone @PSBoundParameters
