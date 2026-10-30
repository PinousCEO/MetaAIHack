#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
UNITY_EDITOR="${DEPTH_UNITY_EDITOR:-/Applications/Unity/Hub/Editor/6000.3.13f1/Unity.app/Contents/MacOS/Unity}"
DOTNET_BIN="${DEPTH_DOTNET:-dotnet}"
if [[ -x artifacts/dotnet/dotnet && -z "${DEPTH_DOTNET:-}" ]]; then DOTNET_BIN="$PWD/artifacts/dotnet/dotnet"; fi
if [[ "$("$DOTNET_BIN" --version)" != 8.* ]]; then
  echo 'Use .NET SDK 8: set DEPTH_DOTNET to its dotnet executable.' >&2
  exit 1
fi
mkdir -p artifacts/macos
# Use the official host instead of a newly generated unsigned/ad-hoc apphost.
"$DOTNET_BIN" publish src/Depth.Service -c Release -r osx-arm64 --self-contained false -p:UseAppHost=false -o artifacts/macos/service
python3 scripts/package-macos-runtime.py
mkdir -p artifacts/macos/sample
cp -R samples/Checkout/. artifacts/macos/sample/
"$UNITY_EDITOR" -batchmode -quit -projectPath "$PWD/unity/Depth.Desktop" -executeMethod DepthMacBuild.Build -logFile "$PWD/artifacts/macos/build.log"
echo "Built: $PWD/artifacts/macos/Depth AI.app"
if [[ "${1:-}" == --smoke ]]; then
  open -n artifacts/macos/'Depth AI.app' --args --depth-smoke --depth-project "$PWD/artifacts/macos/sample" -logFile "$PWD/artifacts/macos/player.log"
fi
