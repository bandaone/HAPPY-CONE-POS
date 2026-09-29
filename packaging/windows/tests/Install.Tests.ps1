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
}
