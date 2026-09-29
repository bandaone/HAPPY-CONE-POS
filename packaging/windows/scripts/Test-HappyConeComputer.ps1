#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateRange(1024,65535)][int]$WebPort = 8080,
    [switch]$PassThru
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'HappyCone.Common.psm1') -Force

function Test-PortAvailable([int]$Port) {
    -not ([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port -contains $Port)
}

$os = Get-CimInstance Win32_OperatingSystem
$computer = Get-CimInstance Win32_ComputerSystem
$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($env:SystemDrive)'"
try { $network = Get-HappyConeNetworkIdentity } catch { $network = [pscustomobject]@{ ComputerName=$env:COMPUTERNAME; IPv4=''; NetworkProfiles=@() } }
$facts = [pscustomobject]@{
    Is64Bit=[Environment]::Is64BitOperatingSystem
    WindowsBuild=[int]$os.BuildNumber
    TotalMemoryGB=[math]::Round($computer.TotalPhysicalMemory / 1GB, 2)
    FreeDiskGB=[math]::Round($disk.FreeSpace / 1GB, 2)
    WebPortAvailable=(Test-PortAvailable $WebPort)
    ApiPortAvailable=(Test-PortAvailable 8000)
    NetworkProfiles=$network.NetworkProfiles
    IPv4=$network.IPv4
    ComputerName=$network.ComputerName
}
$result = Test-HappyConePreflight -Facts $facts -WebPort $WebPort
if ($PassThru) { return $result }
$result | ConvertTo-Json -Depth 5
if (-not $result.CanInstall) { exit 2 }
