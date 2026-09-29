#requires -Version 5.1
#requires -RunAsAdministrator
[CmdletBinding()]
param([string]$At='02:00',[string]$DataRoot="$env:ProgramData\HappyCone")
$script=Join-Path $PSScriptRoot 'Backup-HappyCone.ps1'
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -DataRoot `"$DataRoot`""
$trigger=New-ScheduledTaskTrigger -Daily -At $At
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName 'Happy Cone Daily Backup' -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force
