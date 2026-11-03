param([string]$DotnetRoot = 'C:/Program Files/dotnet')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
Push-Location $repo
try {
    dotnet publish src/Depth.Service -c Release --self-contained false -o artifacts/desktop-service --nologo --ignore-failed-sources -p:NuGetAudit=false -p:UseSharedCompilation=false
    if ($LASTEXITCODE -ne 0) { throw 'Service build failed.' }
    Push-Location desktop
    try {
        npm.cmd ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Desktop dependency install failed.' }
        node node_modules/electron/install.js
        if ($LASTEXITCODE -ne 0) { throw 'Electron runtime install failed.' }
    } finally { Pop-Location }
    $runtime = Join-Path $repo 'artifacts/desktop/resources/runtime'
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $DotnetRoot 'dotnet.exe') -Destination $runtime -Force
    foreach ($family in @('shared/Microsoft.NETCore.App','shared/Microsoft.AspNetCore.App','host/fxr')) {
        $version = Get-ChildItem (Join-Path $DotnetRoot $family) -Directory | Where-Object Name -Like '8.0.*' | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
        if (!$version) { throw "Install the .NET 8 runtime: $family is missing." }
        $destination = Join-Path $runtime $family
        New-Item -ItemType Directory -Path $destination -Force | Out-Null
        Copy-Item -LiteralPath $version.FullName -Destination $destination -Recurse -Force
    }
    foreach ($license in @('LICENSE.txt','ThirdPartyNotices.txt')) { if (Test-Path (Join-Path $DotnetRoot $license)) { Copy-Item -LiteralPath (Join-Path $DotnetRoot $license) -Destination $runtime -Force } }
    node desktop/package.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Desktop packaging failed.' }
} finally { Pop-Location }
