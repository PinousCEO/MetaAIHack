$ErrorActionPreference = 'Stop'
$lensRoot = $PSScriptRoot
$lensRepo = Split-Path -Parent $lensRoot
$lensOutput = [System.IO.Path]::GetFullPath((Join-Path $lensRepo 'artifacts/depth-lens'))
if (-not $lensOutput.StartsWith((Join-Path $lensRepo 'artifacts') + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Invalid package destination.' }
dotnet publish (Join-Path $lensRoot 'windows/DepthLens.csproj') -c Release --self-contained false --ignore-failed-sources --nologo -v:q -o $lensOutput
if ($LASTEXITCODE -ne 0) { throw 'Native publish failed.' }
$lensService = Join-Path $lensOutput 'lens'
$lensRuntime = Join-Path $lensOutput 'runtime'
New-Item -ItemType Directory -Path $lensService,$lensRuntime -Force | Out-Null
$lensFiles = @('package.json','analyzer.cjs','core.cjs','meta.cjs','protocol.cjs','server.cjs','bridge.cjs','client.cjs','cli.cjs','sessions.cjs','work-view.cjs','companion-probe.cjs')
foreach ($lensFile in $lensFiles) { Copy-Item -LiteralPath (Join-Path $lensRoot $lensFile) -Destination (Join-Path $lensService $lensFile) -Force }
$lensTypeScript = Join-Path $lensRepo 'adapters/web/node_modules/typescript'
if (-not (Test-Path -LiteralPath $lensTypeScript)) { throw 'TypeScript compiler dependency is missing.' }
New-Item -ItemType Directory -Path (Join-Path $lensService 'node_modules') -Force | Out-Null
Copy-Item -LiteralPath $lensTypeScript -Destination (Join-Path $lensService 'node_modules') -Recurse -Force
Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $lensRuntime 'node.exe') -Force
if (Test-Path -LiteralPath (Join-Path $lensRoot 'README.html')) { Copy-Item -LiteralPath (Join-Path $lensRoot 'README.html') -Destination (Join-Path $lensOutput 'README.html') -Force }
$lensManifest = @()
foreach ($lensFile in $lensFiles) { $lensManifest += [pscustomobject]@{path="lens/$lensFile";sha256=(Get-FileHash -LiteralPath (Join-Path $lensService $lensFile) -Algorithm SHA256).Hash.ToLower()} }
$lensManifest += [pscustomobject]@{path='Depth Lens.exe';sha256=(Get-FileHash -LiteralPath (Join-Path $lensOutput 'Depth Lens.exe') -Algorithm SHA256).Hash.ToLower()}
$lensManifest | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $lensOutput 'package-manifest.json')
Write-Output "Packaged: $lensOutput"
