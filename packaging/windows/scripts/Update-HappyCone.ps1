#requires -Version 5.1
#requires -RunAsAdministrator
[CmdletBinding()]
param([Parameter(Mandatory)][string]$BundleRoot,[string]$InstallRoot="$env:ProgramFiles\HappyCone",[string]$DataRoot="$env:ProgramData\HappyCone")
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'HappyCone.Common.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'HappyCone.Operations.psm1') -Force
. (Join-Path $PSScriptRoot 'Backup-HappyCone.ps1')

function Invoke-UpdateCommand([string]$File,[string[]]$Arguments,[string]$WorkingDirectory=''){
    $old=Get-Location;try{if($WorkingDirectory){Set-Location $WorkingDirectory};& $File @Arguments;if($LASTEXITCODE -ne 0){throw "$([IO.Path]::GetFileName($File)) failed with exit code $LASTEXITCODE."}}finally{Set-Location $old}
}
function Wait-UpdateReady([int]$Seconds=90){$deadline=[DateTime]::UtcNow.AddSeconds($Seconds);do{try{if((Invoke-WebRequest 'http://127.0.0.1:8000/ready' -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200){return}}catch{Start-Sleep 2}}while([DateTime]::UtcNow -lt $deadline);throw 'The updated API did not become ready.'}
function Read-ApiEnvironment([string]$Path){$result=@{};Get-Content $Path|Where-Object{$_ -and -not $_.StartsWith('#')}|ForEach-Object{$parts=$_.Split('=',2);$result[$parts[0]]=$parts[1]};$result}
function Write-UpdateState($State,[string]$Path){$temp="$Path.tmp";$State.updatedAt=[DateTime]::UtcNow.ToString('o');[IO.File]::WriteAllText($temp,($State|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding($false)));Move-Item $temp $Path -Force}

function Update-HappyCone {
    [CmdletBinding()]
    param([string]$BundleRoot,[string]$InstallRoot="$env:ProgramFiles\HappyCone",[string]$DataRoot="$env:ProgramData\HappyCone")
    $manifest=Test-HappyConeReleaseManifest ([IO.Path]::GetFullPath($BundleRoot))
    $statePath=Join-Path $DataRoot 'install-state.json'
    $originalStateJson=Get-Content $statePath -Raw
    $state=$originalStateJson|ConvertFrom-Json
    $installedVersion=$null;$candidateVersion=$null
    if(-not [version]::TryParse([string]$state.version,[ref]$installedVersion) -or -not [version]::TryParse([string]$manifest.version,[ref]$candidateVersion)){throw 'Installed and candidate releases must use numeric versions such as 1.0.0.'}
    if($candidateVersion -le $installedVersion){throw "The update must be newer than the installed version $installedVersion."}

    $preUpdateBackup=New-HappyConeBackup -DataRoot $DataRoot
    if(-not $preUpdateBackup){throw 'The required pre-update backup failed.'}
    Test-HappyConeBackupArchive $preUpdateBackup.FullName|Out-Null

    $versionRoot=Join-Path $InstallRoot "versions\$($manifest.version)"
    if(Test-Path $versionRoot){throw "The candidate version directory already exists: $versionRoot"}
    $servicesRoot=Join-Path $InstallRoot 'services'
    $apiService=Join-Path $servicesRoot 'HappyConeApi.exe'
    $apiXml=Join-Path $servicesRoot 'HappyConeApi.xml'
    $previousApiXml=Get-Content $apiXml -Raw
    $current=Join-Path $InstallRoot 'current';$next=Join-Path $InstallRoot 'current.next';$previous=Join-Path $InstallRoot 'current.previous'
    $switched=$false;$previousMoved=$false;$environment=@{};$priorEnvironment=@{}
    try{
        New-Item $versionRoot -ItemType Directory|Out-Null
        foreach($directory in 'api','web','wheelhouse','scripts','config'){Copy-Item (Join-Path $BundleRoot $directory) $versionRoot -Recurse}
        $runtimePython=Join-Path $InstallRoot 'runtime\python\python.exe'
        $venv=Join-Path $versionRoot 'venv';Invoke-UpdateCommand $runtimePython @('-m','venv',$venv)
        $venvPython=Join-Path $venv 'Scripts\python.exe'
        $wheels=@(Get-ChildItem (Join-Path $versionRoot 'wheelhouse\*.whl')|ForEach-Object FullName)
        Invoke-UpdateCommand $venvPython (@('-m','pip','install','--no-index','--no-deps')+$wheels)
        $environment=Read-ApiEnvironment (Join-Path $DataRoot 'api.env')
        foreach($key in $environment.Keys){$priorEnvironment[$key]=[Environment]::GetEnvironmentVariable($key,'Process');[Environment]::SetEnvironmentVariable($key,$environment[$key],'Process')}

        Stop-Service HappyConeApi -Force
        Invoke-UpdateCommand $venvPython @('-m','app.cli','migrate') (Join-Path $versionRoot 'api')

        $template=Get-Content (Join-Path $versionRoot 'config\happycone-api-service.xml.template') -Raw
        $envXml=foreach($key in ($environment.Keys|Sort-Object)){$name=[Security.SecurityElement]::Escape($key);$value=[Security.SecurityElement]::Escape($environment[$key]);"<env name=`"$name`" value=`"$value`" />"}
        $newXml=$template.Replace('{{PYTHON_EXE}}',[Security.SecurityElement]::Escape($venvPython)).Replace('{{API_ROOT}}',[Security.SecurityElement]::Escape((Join-Path $versionRoot 'api'))).Replace('{{API_ENV_XML}}',($envXml -join "`r`n  ")).Replace('{{LOG_ROOT}}',[Security.SecurityElement]::Escape((Join-Path $DataRoot 'logs')))
        [IO.File]::WriteAllText("$apiXml.next",$newXml,(New-Object Text.UTF8Encoding($false)))

        if(Test-Path $next){Remove-Item $next -Force}
        Invoke-UpdateCommand "$env:SystemRoot\System32\cmd.exe" @('/d','/c','mklink','/J',$next,$versionRoot)
        if(Test-Path $previous){Remove-Item $previous -Force}
        Rename-Item $current (Split-Path $previous -Leaf)
        $previousMoved=$true
        Rename-Item $next (Split-Path $current -Leaf)
        $switched=$true
        Move-Item "$apiXml.next" $apiXml -Force
        Protect-HappyConeFile $apiXml -ServiceIdentity 'NT AUTHORITY\LOCAL SERVICE'
        Start-Service HappyConeApi
        Wait-UpdateReady
        & (Join-Path $current 'scripts\Register-HappyConeBackupTask.ps1') -DataRoot $DataRoot
        $state.version=[string]$manifest.version;$state.Complete=$true
        $state|Add-Member -NotePropertyName preUpdateBackup -NotePropertyValue $preUpdateBackup.FullName -Force
        $state|Add-Member -NotePropertyName lastUpdateAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
        Write-UpdateState $state $statePath
        Remove-Item $previous -Force -ErrorAction SilentlyContinue
        Write-Host "Happy Cone was updated to $($manifest.version)."
    }catch{
        $message=$_.Exception.Message
        if($previousMoved -and (Test-Path $previous)){Stop-Service HappyConeApi -Force -ErrorAction SilentlyContinue;if(Test-Path $current){Remove-Item $current -Force};Rename-Item $previous (Split-Path $current -Leaf);[IO.File]::WriteAllText($statePath,$originalStateJson,(New-Object Text.UTF8Encoding($false)))}
        if($previousApiXml){[IO.File]::WriteAllText($apiXml,$previousApiXml,(New-Object Text.UTF8Encoding($false)))}
        Start-Service HappyConeApi -ErrorAction SilentlyContinue
        if(Test-Path $versionRoot){Remove-Item $versionRoot -Recurse -Force}
        Add-Content (Join-Path $DataRoot 'logs\update-failures.log') "$(Get-Date -Format o) candidate=$($manifest.version) error=$message backup=$($preUpdateBackup.FullName)"
        throw
    }finally{foreach($key in $environment.Keys){[Environment]::SetEnvironmentVariable($key,$priorEnvironment[$key],'Process')};Remove-Item "$apiXml.next",$next -Force -ErrorAction SilentlyContinue}
}
Update-HappyCone @PSBoundParameters
