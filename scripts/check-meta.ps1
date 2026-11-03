param([switch]$Probe)
$ErrorActionPreference = 'Stop'
$depthRepo = Split-Path $PSScriptRoot -Parent
$env:DEPTH_ENV_FILE = Join-Path $depthRepo '.env'
& dotnet build (Join-Path $depthRepo 'src/Depth.Service') -c Release --nologo --disable-build-servers -p:UseSharedCompilation=false
if ($LASTEXITCODE -ne 0) { throw 'Service build failed.' }
$depthArguments = @((Join-Path $depthRepo 'src/Depth.Service/bin/Release/net8.0/Depth.Service.dll'), '--check-meta')
if ($Probe) { $depthArguments += '--probe' }
& dotnet @depthArguments
if ($LASTEXITCODE -ne 0) { throw 'Meta connection check failed.' }
