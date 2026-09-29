Describe 'Happy Cone installer contract' {
    BeforeAll { $script = Get-Content "$PSScriptRoot/../scripts/Install-HappyCone.ps1" -Raw }

    It 'never invokes development seed data' {
        $script | Should -Not -Match "app\.cli seed"
        $script | Should -Match "app\.cli.+migrate"
        $script | Should -Match "app\.cli.+create-user"
    }

    It 'passes the owner password through a temporary environment variable' {
        $script | Should -Match 'HAPPYCONE_BOOTSTRAP_PASSWORD'
        $script | Should -Not -Match '--password\s'
        $script | Should -Match 'Remove-Item Env:HAPPYCONE_BOOTSTRAP_PASSWORD'
    }

    It 'preserves initialized data across interruption and rerun' {
        $script | Should -Match 'DatabaseInitialized'
        $script | Should -Match 'Refusing to initialize over an existing PostgreSQL data directory'
        $script | Should -Not -Match 'Remove-Item.+postgresql.+data'
    }

    It 'requires health readiness and login page success' {
        $script | Should -Match '/health'
        $script | Should -Match '/ready'
        $script | Should -Match 'index.html'
    }

    It 'migrates before creating the owner and starts services only afterwards' {
        $script.IndexOf("@('-m','app.cli','migrate')") | Should -BeLessThan $script.IndexOf("@('-m','app.cli','create-user'")
        $script.IndexOf("@('-m','app.cli','create-user'") | Should -BeLessThan $script.IndexOf("$apiService @('start')")
    }

    It 'passes top-level default paths and port into the installer function' {
        $script | Should -Match 'Install-HappyCone -BundleRoot \$BundleRoot.+-WebPort \$WebPort.+-InstallRoot \$InstallRoot.+-DataRoot \$DataRoot'
        $script | Should -Not -Match 'Install-HappyCone @PSBoundParameters'
    }

    It 'quotes the Python target under Program Files' {
        $script | Should -Match 'TargetDir=`"\$pythonRoot`"'
    }

    It 'requires the update command for a different release after installation' {
        $script | Should -Match 'state\.Complete.+Use Update-HappyCone\.ps1'
        $script | Should -Match 'targetVersion'
    }

    It 'installs and verifies the pinned Visual C++ runtime before PostgreSQL starts' {
        $script | Should -Match 'VC_redist\.x64-.+\.exe'
        $script | Should -Match '/install.+/quiet.+/norestart'
        $script.IndexOf('VC_redist.x64-') | Should -BeLessThan $script.IndexOf("@('--version')")
        $script.IndexOf("@('--version')") | Should -BeLessThan $script.IndexOf("--username=postgres")
    }

    It 'allows a newer repair release only before any installation phase completed' {
        $script | Should -Match 'completedPhases'
        $script | Should -Match '\[version\]::TryParse'
        $script | Should -Match 'repairVersion -le \$interruptedVersion'
        $script | Should -Match 'interrupted installation.+newer repair release'
        $script | Should -Match 'targetVersion=\$version'
    }

    It 'grants the restricted installer identity access to the database directory' {
        $script | Should -Match 'Set-HappyConeDirectoryAcl\(\[string\]\$Path, \[string\[\]\]\$Identities\)'
        $script | Should -Match 'foreach \(\$identity in \$Identities\)'
        $script | Should -Match "Set-HappyConeDirectoryAcl.+-Identities @\('NT AUTHORITY\\NETWORK SERVICE',\$installerIdentity\)"
    }

    It 'keeps the temporary initdb password readable by the restricted installer user' {
        $script | Should -Match 'WindowsIdentity\]::GetCurrent\(\)\.Name'
        $script | Should -Match 'Protect-HappyConeFile \$passwordFile -ServiceIdentity \$installerIdentity'
        $script.IndexOf('Protect-HappyConeFile $passwordFile -ServiceIdentity $installerIdentity') | Should -BeLessThan $script.IndexOf("'--username=postgres'")
    }

    It 'removes only an incomplete new database cluster before retrying initdb' {
        $script | Should -Match 'state\.DatabaseInitialized'
        $script | Should -Match 'state\.DatabaseCreated'
        $script | Should -Match 'Get-Service HappyConePostgreSQL'
        $script | Should -Match 'Remove-Item \$postgresData -Recurse -Force'
    }

    It 'ships a guided setup entry point for the operator' {
        Test-Path "$PSScriptRoot/../scripts/Start-HappyConeSetup.ps1" | Should -BeTrue
        $setup = Get-Content "$PSScriptRoot/../scripts/Start-HappyConeSetup.ps1" -Raw
        $setup | Should -Match 'Test-HappyConeComputer\.ps1'
        $setup | Should -Not -Match 'BundleRoot = \(Split-Path \$PSScriptRoot'
        $setup | Should -Match 'IsNullOrWhiteSpace\(\$BundleRoot\)'
        $setup | Should -Match '\$BundleRoot = Split-Path \$PSScriptRoot -Parent'
        $setup | Should -Match '-PassThru'
        $setup | Should -Match 'preflight\.CanInstall'
        $setup | Should -Match 'Install-HappyCone\.ps1'
        $setup | Should -Match 'Read-Host'
        $setup | Should -Match 'at least 12 characters'
        $setup | Should -Match 'passwordLength -gt 256'
        $setup | Should -Not -Match '\$LASTEXITCODE'
        $launcherPath = Join-Path $PSScriptRoot '../START-HAPPY-CONE.cmd'
        Test-Path $launcherPath | Should -BeTrue
        $launcher = Get-Content $launcherPath -Raw
        $launcher | Should -Match 'Start-Process.+RunAs'
        $launcher | Should -Match 'Start-HappyConeSetup\.ps1'
    }
}
