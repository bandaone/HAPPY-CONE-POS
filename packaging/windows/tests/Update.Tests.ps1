Describe 'Happy Cone update contract' {
    BeforeAll { $script=Get-Content "$PSScriptRoot/../scripts/Update-HappyCone.ps1" -Raw }

    It 'verifies the bundle and rejects non-upgrades before backup or mutation' {
        $script | Should -Match 'Test-HappyConeReleaseManifest'
        $script | Should -Match 'newer than the installed version'
        $script.IndexOf('Test-HappyConeReleaseManifest') | Should -BeLessThan $script.IndexOf('New-HappyConeBackup')
    }

    It 'requires a successful backup before stopping writes and migrating' {
        $script.IndexOf('New-HappyConeBackup') | Should -BeLessThan $script.IndexOf('Stop-Service HappyConeApi')
        $script.IndexOf('Stop-Service HappyConeApi') | Should -BeLessThan $script.IndexOf("@('-m','app.cli','migrate')")
    }

    It 'switches active application files only after migration' {
        $script.IndexOf("@('-m','app.cli','migrate')") | Should -BeLessThan $script.IndexOf("mklink','/J'")
        $script | Should -Match '/ready'
        $script | Should -Match 'previousApiXml'
        $script | Should -Match 'preUpdateBackup'
        $script | Should -Match 'Protect-HappyConeFile \$apiXml'
    }
}
