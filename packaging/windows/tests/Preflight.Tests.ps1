BeforeAll {
    Import-Module "$PSScriptRoot/../scripts/HappyCone.Common.psm1" -Force
}

Describe 'Happy Cone Windows preflight' {
    function GoodFacts {
        [pscustomobject]@{ Is64Bit=$true; WindowsBuild=19045; TotalMemoryGB=4; FreeDiskGB=20; WebPortAvailable=$true; ApiPortAvailable=$true; NetworkProfiles=@('Private'); IPv4='192.168.1.20'; ComputerName='HAPPY-CONE' }
    }

    It 'accepts the minimum supported private-network computer' {
        $result = Test-HappyConePreflight -Facts (GoodFacts) -WebPort 8080
        $result.CanInstall | Should -BeTrue
        $result.Address | Should -Be 'http://192.168.1.20:8080'
        $result.FirewallParameters.Profile | Should -Be 'Private'
    }

    It 'blocks unsupported architecture, Windows, memory, disk, and occupied ports' {
        $cases = @(
            @{ Name='architecture'; Change={ param($f) $f.Is64Bit=$false } },
            @{ Name='Windows'; Change={ param($f) $f.WindowsBuild=17763 } },
            @{ Name='memory'; Change={ param($f) $f.TotalMemoryGB=3.9 } },
            @{ Name='disk'; Change={ param($f) $f.FreeDiskGB=9.9 } },
            @{ Name='web port'; Change={ param($f) $f.WebPortAvailable=$false } },
            @{ Name='API port'; Change={ param($f) $f.ApiPortAvailable=$false } }
        )
        foreach ($case in $cases) {
            $facts = GoodFacts
            & $case.Change $facts
            $result = Test-HappyConePreflight -Facts $facts -WebPort 8080
            $result.CanInstall | Should -BeFalse
            ($result.BlockingErrors -join ' ') | Should -Match $case.Name
        }
    }

    It 'blocks a Public-only network' {
        $facts = GoodFacts
        $facts.NetworkProfiles = @('Public')
        $result = Test-HappyConePreflight -Facts $facts -WebPort 8080
        $result.CanInstall | Should -BeFalse
        ($result.BlockingErrors -join ' ') | Should -Match 'Private network'
    }
}
