param([switch]$Fixture, [switch]$PythonHttps, [ValidateRange(1,5)][int]$Rounds = 3)
$ErrorActionPreference = 'Stop'
$depthRepo = Split-Path $PSScriptRoot -Parent
Push-Location $depthRepo
try {
    dotnet build src/Depth.Service -c Release --nologo --ignore-failed-sources -p:NuGetAudit=false -p:UseSharedCompilation=false --disable-build-servers
    if ($LASTEXITCODE -ne 0) { throw 'Service build failed.' }
    $depthArguments = @('src/Depth.Service/bin/Release/net8.0/Depth.Service.dll', '--acceptance-test', '--rounds', $Rounds)
    if ($Fixture) { $depthArguments += '--fixture'; Write-Output 'Explicit simulated Meta responses; real project builds and execution.' }
    else { Write-Output 'Live Meta API; no simulated fallback. This may consume model/image quota.' }
    if ($PythonHttps) { $depthArguments += '--python-https'; Write-Output 'Explicit live-test transport: Python verified HTTPS, same official API and proxy settings.' }
    & dotnet @depthArguments
    $depthResult = $LASTEXITCODE
    if ($depthResult -eq 2) { Write-Output 'BLOCKED: actual Meta connectivity failed. See the generated report.' }
    exit $depthResult
} finally { Pop-Location }
