param([string]$Unity = 'C:/Program Files/Unity/Hub/Editor/6000.3.13f1/Editor/Unity.exe')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
Push-Location $repo
try {
    dotnet publish src/Depth.Service -c Release -o artifacts/windows/service --nologo
    if ($LASTEXITCODE -ne 0) { throw 'Service build failed' }
    $buildLog = Join-Path $repo 'artifacts/unity-build.log'
    $arguments = @('-batchmode', '-nographics', '-quit', '-projectPath', ('"' + (Join-Path $repo 'unity/Depth.Desktop') + '"'), '-executeMethod', 'DepthBuild.Windows', '-logFile', ('"' + $buildLog + '"'))
    $buildProcess = Start-Process -FilePath $Unity -ArgumentList $arguments -PassThru -WindowStyle Hidden -Wait
    if ($buildProcess.ExitCode -ne 0) { throw "Unity build failed. See $buildLog" }
    Write-Output (Join-Path $repo 'artifacts/windows/Depth AI.exe')
} finally { Pop-Location }
