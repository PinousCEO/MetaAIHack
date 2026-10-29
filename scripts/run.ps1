param([string]$ProjectPath = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
# Use native executables so process arguments never pass through cmd.exe.
$nativeCodex = Get-ChildItem (Join-Path $env:APPDATA 'npm/node_modules/@openai/codex') -Filter codex.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if ($nativeCodex -and !$env:DEPTH_CODEX_EXECUTABLE) { $env:DEPTH_CODEX_EXECUTABLE = $nativeCodex.FullName }
$dartCommand = Get-Command dart -ErrorAction SilentlyContinue
if ($dartCommand) {
    $dartNative = Join-Path (Split-Path $dartCommand.Source -Parent) 'cache/dart-sdk/bin/dart.exe'
    if ((Test-Path $dartNative) -and !$env:DEPTH_DART_EXECUTABLE) { $env:DEPTH_DART_EXECUTABLE = $dartNative }
}
$env:DEPTH_DART_ADAPTER = Join-Path $repo 'adapters/dart/bin/index.dart'
$exe = Join-Path $repo 'artifacts/windows/Depth AI.exe'
if (!(Test-Path $exe)) { throw 'Run scripts/build.ps1 first.' }
if ($ProjectPath) { & $exe --depth-project $ProjectPath } else { & $exe }
