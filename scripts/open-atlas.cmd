@echo off
setlocal
pushd "%~dp0.."
dotnet run --project src/Depth.Service -- --export-view "%CD%" "%CD%\design\atlas\project-data.js"
if errorlevel 1 (
  popd
  exit /b 1
)
start "" "%CD%\design\atlas\index.html"
popd
