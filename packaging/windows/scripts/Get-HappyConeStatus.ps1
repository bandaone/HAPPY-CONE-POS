#requires -Version 5.1
[CmdletBinding()]
param([string]$DataRoot="$env:ProgramData\HappyCone",[switch]$AsJson)
Import-Module (Join-Path $PSScriptRoot 'HappyCone.Operations.psm1') -Force

function Get-HappyConeStatus {
    [CmdletBinding()]
    param([string]$DataRoot="$env:ProgramData\HappyCone")
    $statePath=Join-Path $DataRoot 'install-state.json'
    $state=if(Test-Path $statePath){Get-Content $statePath -Raw|ConvertFrom-Json}else{$null}
    $services=@{}
    foreach($name in 'HappyConePostgreSQL','HappyConeApi','HappyConeWeb'){$service=Get-Service $name -ErrorAction SilentlyContinue;$services[$name]=if($service){[string]$service.Status}else{'Missing'}}
    $health=$false;$ready=$false
    try{$health=(Invoke-WebRequest 'http://127.0.0.1:8000/health' -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200}catch{}
    try{$ready=(Invoke-WebRequest 'http://127.0.0.1:8000/ready' -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200}catch{}
    $schema='Unavailable';$old=$null
    try{
        $password=Get-HappyConeDatabasePassword $DataRoot;$old=$env:PGPASSWORD;$env:PGPASSWORD=$password
        $psql="$env:ProgramFiles\HappyCone\runtime\postgresql\bin\psql.exe"
        $schema=(& $psql -h 127.0.0.1 -U happycone -d happycone -tAc 'SELECT version_num FROM alembic_version').Trim()
    }catch{}finally{if($null -eq $old){Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue}else{$env:PGPASSWORD=$old}}
    $latest=Get-ChildItem (Join-Path $DataRoot 'backups\*.dump') -ErrorAction SilentlyContinue|Sort-Object LastWriteTime -Descending|Select-Object -First 1
    $drive=Get-PSDrive -Name ([IO.Path]::GetPathRoot($DataRoot).TrimEnd('\').TrimEnd(':'))
    [pscustomobject]@{Installed=[bool]$state;Version=if($state){$state.version}else{$null};Address=if($state){$state.address}else{$null};Services=$services;Health=$health;Ready=$ready;Schema=$schema;FreeDiskGB=[math]::Round($drive.Free/1GB,1);LatestBackup=if($latest){$latest.FullName}else{$null};LatestBackupAt=if($latest){$latest.LastWriteTime}else{$null}}
}
$status=Get-HappyConeStatus -DataRoot $DataRoot
if($AsJson){$status|ConvertTo-Json -Depth 5}else{$status|Format-List}
