param([string]$ProjectPath = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$env:DEPTH_ENV_FILE = Join-Path $repo '.env'
$exe = Join-Path $repo 'artifacts/desktop/Depth AI.exe'
if (!(Test-Path $exe)) { throw 'Run scripts/build.ps1 first.' }
if ($ProjectPath) { & $exe --project $ProjectPath } else { & $exe }
