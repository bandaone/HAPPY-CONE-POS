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
}
