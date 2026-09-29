#requires -Version 5.1
#requires -RunAsAdministrator
[CmdletBinding()]
param(
    [switch]$KeepData,
    [switch]$RemoveData,
    [string]$ExpectedInstallIdentity,
    [string]$InstallRoot="$env:ProgramFiles\HappyCone",
    [string]$DataRoot="$env:ProgramData\HappyCone"
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

function Uninstall-HappyCone {
    [CmdletBinding()]
    param([switch]$KeepData,[switch]$RemoveData,[string]$ExpectedInstallIdentity,[string]$InstallRoot,[string]$DataRoot)
    if($KeepData -and $RemoveData){throw 'Choose either -KeepData or -RemoveData.'}
    if($RemoveData){
        $state=Get-Content (Join-Path $DataRoot 'install-state.json') -Raw|ConvertFrom-Json
        if($ExpectedInstallIdentity -ne $state.installIdentity){throw 'ExpectedInstallIdentity does not match this installation. Data was not removed.'}
    }
    foreach($name in 'HappyConeWeb','HappyConeApi'){
        $exe=Join-Path $InstallRoot "services\$name.exe"
        if(Get-Service $name -ErrorAction SilentlyContinue){Stop-Service $name -Force -ErrorAction SilentlyContinue;if(Test-Path $exe){& $exe uninstall|Out-Null}else{& sc.exe delete $name|Out-Null}}
    }
    if(Get-Service HappyConePostgreSQL -ErrorAction SilentlyContinue){Stop-Service HappyConePostgreSQL -Force -ErrorAction SilentlyContinue;& sc.exe delete HappyConePostgreSQL|Out-Null}
    Get-NetFirewallRule -DisplayName 'Happy Cone POS (Private network)' -ErrorAction SilentlyContinue|Remove-NetFirewallRule
    Unregister-ScheduledTask -TaskName 'Happy Cone Daily Backup' -Confirm:$false -ErrorAction SilentlyContinue
    $shortcuts=@((Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'Happy Cone POS.lnk'),(Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Happy Cone POS.lnk'))
    Remove-Item $shortcuts -Force -ErrorAction SilentlyContinue
    if(Test-Path $InstallRoot){Remove-Item $InstallRoot -Recurse -Force}
    if($RemoveData -and (Test-Path $DataRoot)){Remove-Item $DataRoot -Recurse -Force;Write-Host 'Happy Cone and its production data were removed.'}
    else{Write-Host "Happy Cone application files were removed. Database files and backups remain in $DataRoot."}
}
Uninstall-HappyCone -KeepData:$KeepData -RemoveData:$RemoveData -ExpectedInstallIdentity $ExpectedInstallIdentity -InstallRoot $InstallRoot -DataRoot $DataRoot
