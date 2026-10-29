param([switch]$SkipRefresh)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$output = Join-Path $repo 'design/atlas/project-data.js'
if (!$SkipRefresh) {
    & dotnet run --project (Join-Path $repo 'src/Depth.Service') -- --export-view $repo $output
    if ($LASTEXITCODE -ne 0) { throw 'Could not export the project source snapshot.' }
}
Start-Process -FilePath (Join-Path $repo 'design/atlas/index.html')
