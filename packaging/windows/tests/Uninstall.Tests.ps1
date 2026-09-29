Describe 'Happy Cone uninstall contract' {
    BeforeAll { $script=Get-Content "$PSScriptRoot/../scripts/Uninstall-HappyCone.ps1" -Raw }

    It 'retains production data by default' {
        $script | Should -Match 'KeepData'
        $script | Should -Match 'RemoveData'
        $script | Should -Match 'ExpectedInstallIdentity'
        $script | Should -Not -Match 'Remove-Item \$DataRoot -Recurse -Force\s*\n\s*}'
    }

    It 'requires an exact installation identity before deleting data' {
        $script.IndexOf('ExpectedInstallIdentity -ne') | Should -BeLessThan $script.IndexOf('Remove-Item $DataRoot -Recurse -Force')
    }

    It 'removes services, firewall, scheduled task, shortcuts, and application files' {
        foreach($term in 'HappyConeApi','HappyConeWeb','HappyConePostgreSQL','Remove-NetFirewallRule','Unregister-ScheduledTask','Happy Cone POS.lnk','Remove-Item $InstallRoot'){$script|Should -Match ([regex]::Escape($term))}
    }
}
