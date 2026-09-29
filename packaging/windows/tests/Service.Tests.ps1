Describe 'Happy Cone Windows service contract' {
    BeforeAll {
        $api = Get-Content "$PSScriptRoot/../config/happycone-api-service.xml.template" -Raw
        $web = Get-Content "$PSScriptRoot/../config/happycone-web-service.xml.template" -Raw
    }

    It 'binds the API to loopback with one worker' {
        $api | Should -Match '--host 127\.0\.0\.1'
        $api | Should -Match '--workers 1'
    }

    It 'runs services under restricted Windows identities' {
        $api | Should -Match 'LocalService'
        $web | Should -Match 'LocalService'
    }

    It 'restarts failed services with bounded logs' {
        $api | Should -Match '<onfailure action="restart"'
        $web | Should -Match '<onfailure action="restart"'
        $api | Should -Match '<log mode="roll-by-size"'
        $web | Should -Match '<log mode="roll-by-size"'
    }
}
