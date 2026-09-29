BeforeAll {
    Import-Module "$PSScriptRoot/../scripts/HappyCone.Common.psm1" -Force
}

Describe 'Happy Cone common deployment functions' {
    It 'generates URL-safe secrets with enough entropy' {
        $secret = New-HappyConeSecret
        $secret.Length | Should -BeGreaterOrEqual 43
        $secret | Should -Match '^[A-Za-z0-9_-]+$'
        $secret | Should -Not -Be (New-HappyConeSecret)
    }

    It 'renders exact trusted hosts and same-origin CORS' {
        $root = Join-Path $TestDrive 'install'
        $data = Join-Path $TestDrive 'data'
        $result = Write-HappyConeConfiguration -InstallRoot $root -DataRoot $data -PublicHost 'HAPPY-CONE' -IPv4 '192.168.1.20' -DatabasePassword 'db_safe' -WebPort 8080 -WhatIfMode
        $result.ApiEnvironment | Should -Match 'ALLOWED_HOSTS=\["HAPPY-CONE","192.168.1.20","localhost"\]'
        $result.ApiEnvironment | Should -Match 'CORS_ORIGINS=\[\]'
        $result.ApiEnvironment | Should -Match 'BRANCH_TIMEZONE=Africa/Lusaka'
        $result.ApiEnvironment | Should -Match 'WEB_CONCURRENCY=1'
    }

    It 'returns a private-only firewall rule' {
        $rule = Get-HappyConeFirewallParameters -WebPort 8080
        $rule.Profile | Should -Be 'Private'
        $rule.Protocol | Should -Be 'TCP'
        $rule.LocalPort | Should -Be 8080
        $rule.Direction | Should -Be 'Inbound'
    }
}
