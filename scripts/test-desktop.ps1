param([switch]$Native)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
Push-Location $repo
try {
    if ($Native) {
        $exe = Join-Path $repo 'artifacts/desktop/Depth AI.exe'
        if (!(Test-Path $exe)) { throw 'Run scripts/build.ps1 first.' }
        $env:DEPTH_SMOKE_OUTPUT = Join-Path $repo ('artifacts/desktop-native-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
        $env:DEPTH_ENV_FILE = Join-Path $repo '.env'
        New-Item -ItemType Directory -Force -Path $env:DEPTH_SMOKE_OUTPUT | Out-Null
        Write-Output ('Native screenshots/report: ' + $env:DEPTH_SMOKE_OUTPUT)
        $process = Start-Process -FilePath $exe -ArgumentList '--smoke' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $env:DEPTH_SMOKE_OUTPUT 'stdout.log') -RedirectStandardError (Join-Path $env:DEPTH_SMOKE_OUTPUT 'stderr.log')
        if (!$process.WaitForExit(120000)) { $process.Kill(); throw 'Desktop test timed out.' }
        $report = Join-Path $env:DEPTH_SMOKE_OUTPUT 'report.json'
        if (!(Test-Path $report)) { throw ('Native execution failed before a report was produced. See ' + (Join-Path $env:DEPTH_SMOKE_OUTPUT 'stderr.log')) }
        if ($null -ne $process.ExitCode -and $process.ExitCode -ne 0) { throw ('Native execution failed. See ' + $report) }
        $result = Get-Content -Raw $report | ConvertFrom-Json
        if ($result.error) { throw $result.error }
        if ($result.status -ne 'passed') { throw ('Native runtime verification failed. See ' + $report) }
        Get-Content $report
        Write-Output ('Actual window/project captures: ' + $env:DEPTH_SMOKE_OUTPUT)
    } else {
        node desktop/dom-test.cjs
        if ($LASTEXITCODE -ne 0) { throw 'Desktop DOM test failed.' }
        node desktop/product-test.cjs
        if ($LASTEXITCODE -ne 0) { throw 'Desktop product workflow test failed.' }
    }
} finally { Pop-Location }
