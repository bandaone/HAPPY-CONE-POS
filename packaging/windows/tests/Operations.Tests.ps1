BeforeAll {
    Import-Module "$PSScriptRoot/../scripts/HappyCone.Operations.psm1" -Force
}

Describe 'Happy Cone backup and recovery helpers' {
    It 'rejects low disk space before backup work begins' {
        { Assert-HappyConeBackupSpace -FreeBytes 99MB -EstimatedBytes 100MB } | Should -Throw '*free disk*'
        { Assert-HappyConeBackupSpace -FreeBytes 201MB -EstimatedBytes 100MB } | Should -Not -Throw
    }

    It 'keeps the newest 30 successful archives' {
        $files = 1..35 | ForEach-Object { [pscustomobject]@{ FullName="backup-$_.dump"; LastWriteTime=([datetime]'2026-01-01').AddDays($_) } }
        $prune = Get-HappyConePruneList -Archives $files -Keep 30
        $prune.Count | Should -Be 5
        $prune[0].FullName | Should -Be 'backup-5.dump'
    }

    It 'redacts configuration secrets' {
        $text = "DATABASE_URL=postgresql://user:secret@localhost/db`nLOG_LEVEL=WARNING"
        $redacted = ConvertTo-HappyConeRedactedConfig $text
        $redacted | Should -Not -Match 'secret'
        $redacted | Should -Match 'DATABASE_URL=\[REDACTED\]'
        $redacted | Should -Match 'LOG_LEVEL=WARNING'
    }

    It 'requires a matching archive checksum' {
        $archive = Join-Path $TestDrive 'sale.dump'
        Set-Content $archive 'valid'
        $hash = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        Set-Content "$archive.sha256" "$hash  sale.dump"
        { Test-HappyConeBackupArchive $archive } | Should -Not -Throw
        Set-Content $archive 'altered'
        { Test-HappyConeBackupArchive $archive } | Should -Throw '*checksum*'
    }
}

Describe 'Happy Cone operations script contracts' {
    It 'creates custom-format backups through a temporary path before atomic rename' {
        $script = Get-Content "$PSScriptRoot/../scripts/Backup-HappyCone.ps1" -Raw
        $script | Should -Match "'-Fc'"
        $script | Should -Match 'pg_restore'
        $script | Should -Match "pg_restore\.exe'.+\| Out-Null"
        $script | Should -Match '\.tmp'
        $script.IndexOf('Assert-HappyConeBackupSpace') | Should -BeLessThan $script.IndexOf("'-Fc'")
        $script.IndexOf('Move-Item $temporaryArchive') | Should -BeLessThan $script.IndexOf('Get-HappyConePruneList')
    }

    It 'never places the age recovery identity beside exports' {
        $script = Get-Content "$PSScriptRoot/../scripts/Export-HappyConeBackup.ps1" -Raw
        $script | Should -Match 'AgeRecipient'
        $script | Should -Not -Match 'AgeIdentity'
        $script | Should -Match 'Get-FileHash'
    }

    It 'guards live replacement with identity and safety backup' {
        $script = Get-Content "$PSScriptRoot/../scripts/Restore-HappyCone.ps1" -Raw
        $script | Should -Match 'ReplaceLiveDatabase'
        $script | Should -Match 'ExpectedInstallIdentity'
        $script.IndexOf('Stop-Service HappyConeApi') | Should -BeLessThan $script.LastIndexOf('New-HappyConeBackup')
        $script | Should -Match "--single-transaction','--exit-on-error"
    }

    It 'installs permanent operations scripts and registers the daily backup' {
        $script = Get-Content "$PSScriptRoot/../scripts/Install-HappyCone.ps1" -Raw
        $script | Should -Match "Join-Path.*'scripts'"
        $script | Should -Match 'Register-HappyConeBackupTask.ps1'
        $script | Should -Match 'backup-policy.json'
    }
}
