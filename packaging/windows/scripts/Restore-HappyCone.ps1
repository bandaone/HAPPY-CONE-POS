#requires -Version 5.1
#requires -RunAsAdministrator
[CmdletBinding(DefaultParameterSetName='Test')]
param(
    [Parameter(Mandatory)][string]$ArchivePath,
    [Parameter(ParameterSetName='Live',Mandatory)][switch]$ReplaceLiveDatabase,
    [Parameter(ParameterSetName='Live',Mandatory)][string]$ExpectedInstallIdentity,
    [string]$DataRoot="$env:ProgramData\HappyCone"
)
Import-Module (Join-Path $PSScriptRoot 'HappyCone.Operations.psm1') -Force
. (Join-Path $PSScriptRoot 'Backup-HappyCone.ps1')

function Get-HappyConeAdminPassword([string]$Root){(Get-Content (Join-Path $Root 'database-admin.secret') -Raw).Trim()}
function Invoke-HappyConeAdminPg([string]$Executable,[string[]]$Arguments,[string]$DataRoot){Invoke-HappyConePgCommand $Executable $Arguments (Get-HappyConeAdminPassword $DataRoot)}

function Test-HappyConeRestore {
    [CmdletBinding()]
    param([string]$ArchivePath,[string]$DataRoot="$env:ProgramData\HappyCone")
    Test-HappyConeBackupArchive $ArchivePath|Out-Null
    $pg="$env:ProgramFiles\HappyCone\runtime\postgresql\bin"
    Invoke-HappyConeAdminPg (Join-Path $pg 'pg_restore.exe') @('--list',$ArchivePath) $DataRoot
    $validation="happycone_validation_$(Get-Date -Format yyyyMMddHHmmss)"
    $apiProcess=$null;$environment=@{};$previous=@{}
    try{
        Invoke-HappyConeAdminPg (Join-Path $pg 'createdb.exe') @('-h','127.0.0.1','-U','postgres','-O','happycone',$validation) $DataRoot
        $password=Get-HappyConeDatabasePassword $DataRoot;$old=$env:PGPASSWORD;$env:PGPASSWORD=$password
        try{
            & (Join-Path $pg 'pg_restore.exe') -h 127.0.0.1 -U happycone -d $validation --no-owner --exit-on-error $ArchivePath
            if($LASTEXITCODE -ne 0){throw 'Validation restore failed.'}
            $revision=(& (Join-Path $pg 'psql.exe') -h 127.0.0.1 -U happycone -d $validation -tAc 'SELECT version_num FROM alembic_version').Trim()
        }finally{if($null -eq $old){Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue}else{$env:PGPASSWORD=$old}}
        if($revision -ne '0008'){throw "Backup schema $revision is not compatible with this release (expected 0008)."}
        Get-Content (Join-Path $DataRoot 'api.env')|Where-Object{$_ -and -not $_.StartsWith('#')}|ForEach-Object{$parts=$_.Split('=',2);$environment[$parts[0]]=$parts[1]}
        $environment.DATABASE_URL=$environment.DATABASE_URL -replace '/happycone$',(('/'+$validation))
        foreach($key in $environment.Keys){$previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process');[Environment]::SetEnvironmentVariable($key,$environment[$key],'Process')}
        $state=Get-Content (Join-Path $DataRoot 'install-state.json') -Raw|ConvertFrom-Json
        $python="$env:ProgramFiles\HappyCone\versions\$($state.version)\venv\Scripts\python.exe"
        $apiRoot="$env:ProgramFiles\HappyCone\versions\$($state.version)\api"
        $apiProcess=Start-Process $python -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8001','--workers','1','--no-access-log' -WorkingDirectory $apiRoot -PassThru -WindowStyle Hidden
        $deadline=[DateTime]::UtcNow.AddSeconds(60);$ready=$false
        do{try{$ready=(Invoke-WebRequest 'http://127.0.0.1:8001/ready' -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200}catch{Start-Sleep 2}}while(-not $ready -and [DateTime]::UtcNow -lt $deadline)
        if(-not $ready){throw 'The restored database did not pass the application readiness check.'}
        [pscustomobject]@{Valid=$true;Schema=$revision;Archive=$ArchivePath}
    }finally{
        if($apiProcess){Stop-Process $apiProcess.Id -Force -ErrorAction SilentlyContinue}
        foreach($key in $environment.Keys){[Environment]::SetEnvironmentVariable($key,$previous[$key],'Process')}
        try{Invoke-HappyConeAdminPg (Join-Path $pg 'dropdb.exe') @('-h','127.0.0.1','-U','postgres','--if-exists',$validation) $DataRoot}catch{}
    }
}

function Restore-HappyConeLive {
    [CmdletBinding()]
    param([string]$ArchivePath,[string]$ExpectedInstallIdentity,[switch]$ReplaceLiveDatabase,[string]$DataRoot="$env:ProgramData\HappyCone")
    if(-not $ReplaceLiveDatabase){throw 'Live restore requires -ReplaceLiveDatabase.'}
    $state=Get-Content (Join-Path $DataRoot 'install-state.json') -Raw|ConvertFrom-Json
    if($ExpectedInstallIdentity -ne $state.installIdentity){throw 'The expected installation identity does not match this computer.'}
    Test-HappyConeRestore -ArchivePath $ArchivePath -DataRoot $DataRoot|Out-Null
    $safety=New-HappyConeBackup -DataRoot $DataRoot
    if(-not $safety){throw 'The safety backup did not complete.'}
    $pg="$env:ProgramFiles\HappyCone\runtime\postgresql\bin"
    Stop-Service HappyConeApi -Force
    try{
        Invoke-HappyConePgCommand (Join-Path $pg 'pg_restore.exe') @('-h','127.0.0.1','-U','happycone','-d','happycone','--clean','--if-exists','--no-owner','--exit-on-error',$ArchivePath) (Get-HappyConeDatabasePassword $DataRoot)
        Start-Service HappyConeApi
        $deadline=[DateTime]::UtcNow.AddSeconds(90);$ready=$false
        do{try{$ready=(Invoke-WebRequest 'http://127.0.0.1:8000/ready' -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200}catch{Start-Sleep 2}}while(-not $ready -and [DateTime]::UtcNow -lt $deadline)
        if(-not $ready){throw 'The live database was restored, but the application readiness check failed.'}
        [pscustomobject]@{Restored=$true;Archive=$ArchivePath;SafetyBackup=$safety.FullName}
    }catch{Start-Service HappyConeApi -ErrorAction SilentlyContinue;throw}
}

if($PSCmdlet.ParameterSetName -eq 'Live'){Restore-HappyConeLive @PSBoundParameters}else{Test-HappyConeRestore -ArchivePath $ArchivePath -DataRoot $DataRoot}
