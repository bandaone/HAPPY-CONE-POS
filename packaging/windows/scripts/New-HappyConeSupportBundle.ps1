#requires -Version 5.1
[CmdletBinding()]
param([string]$DataRoot="$env:ProgramData\HappyCone",[string]$OutputPath=(Join-Path ([Environment]::GetFolderPath('Desktop')) "HappyCone-Support-$(Get-Date -Format yyyyMMdd-HHmmss).zip"))
Import-Module (Join-Path $PSScriptRoot 'HappyCone.Operations.psm1') -Force

function New-HappyConeSupportBundle {
    [CmdletBinding()]
    param([string]$DataRoot,[string]$OutputPath)
    $staging=Join-Path $env:TEMP "HappyCone-Support-$([Guid]::NewGuid())"
    New-Item $staging -ItemType Directory|Out-Null
    try{
        foreach($name in 'install-state.json','backup-policy.json'){if(Test-Path (Join-Path $DataRoot $name)){Copy-Item (Join-Path $DataRoot $name) $staging}}
        if(Test-Path (Join-Path $DataRoot 'api.env')){ConvertTo-HappyConeRedactedConfig (Get-Content (Join-Path $DataRoot 'api.env') -Raw)|Set-Content (Join-Path $staging 'api.redacted.env')}
        & (Join-Path $PSScriptRoot 'Get-HappyConeStatus.ps1') -DataRoot $DataRoot -AsJson | Set-Content (Join-Path $staging 'status.json')
        $logOut=Join-Path $staging 'logs';New-Item $logOut -ItemType Directory|Out-Null
        Get-ChildItem (Join-Path $DataRoot 'logs\*.log') -ErrorAction SilentlyContinue|Select-Object -First 10|ForEach-Object{Get-Content $_.FullName -Tail 2000|Set-Content (Join-Path $logOut $_.Name)}
        Compress-Archive (Join-Path $staging '*') $OutputPath -Force
        Get-Item $OutputPath
    }finally{Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue}
}
New-HappyConeSupportBundle -DataRoot $DataRoot -OutputPath $OutputPath
