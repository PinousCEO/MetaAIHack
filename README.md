# Depth AI

실제 코드·에셋을 공통 모듈 ID, 소스 근거, 관계, 설계 요약으로 이해하고 변경을 검토하는 Unity 데스크톱 프로토타입입니다. Checkout은 소스 연결 검증 예제이며 제품 자체가 쇼핑 앱이라는 뜻이 아닙니다.

**다음 CLI는 [2026-10-30 인수인계](docs/HANDOFF-2026-10-30.md)와 [AGENTS.md](AGENTS.md)를 먼저 읽으십시오.** 오늘의 구현, 실행 방법, 검증 근거, 남은 작업이 정리되어 있습니다. 현재 PC 디자인의 최종 사용자 승인은 아직 없습니다. [이전 실패 기록](docs/HANDOFF-2026-10-29.md)을 승인된 완성 상태로 해석하지 마십시오.

## 현재 화면과 동작

- 기본 `Spatial workspace`: 중앙 프리뷰 주변의 실제 소스 모듈, 선택 몸체의 전진·정면 회전, 소스 참조선, 눌렀을 때만 작동하는 카메라 드래그. `Overview`로 복귀, `Workbench`에서 기존 정면 편집뷰 사용.
- `Impact`: 공유 구현의 직접·간접 사용처와 파일/행 근거. `Show affected in space`는 같은 ID의 영향 모듈만 공간에서 보여줍니다. 실제 동작 변화나 코드 통합을 증명하는 기능은 아닙니다.
- `Changes → Impact & checks`: 수정 선언, 잠재 영향, revision·해시·C# 구문 검사. 검토 후 적용·백업·재분석. 대상 프로젝트 빌드·행동 테스트는 미실행으로 구분합니다.
- `Impact → AI context`: 화면과 MCP/CLI/API 에이전트가 사용하는 revision 기반 문맥 패킷. 소스 해시, 발췌, 설계 기록 상태, 영향 경로, 생략 수를 확인합니다. 문맥은 최대 24,000자이며 토큰 절감 효과는 측정하지 않았습니다.

[실제 영향 분석 화면](docs/screenshots/2026-10-30-impact/02-impact-space.png) · [실제 검토 화면](docs/screenshots/2026-10-30-impact/04-change-review.png) · [PC와 MR 참고 이미지 갤러리](design/references/mr-workspace-20261030/index.html).

MR 5장은 설계 참고입니다. 헤드셋 뷰어와 양안 렌더링·손 입력은 아직 구현하지 않았습니다. 일반 프로젝트는 소스/모듈 탐색을 제공하고, 동작 프리뷰에는 해당 프로젝트용 소스 매핑 어댑터가 필요합니다.

## 빌드와 실행

Unity **6000.3.13f1**, .NET **SDK 8**, Python 3.12+를 사용합니다. SDK 9/10 Roslyn을 net8에 직접 참조하지 마십시오.

macOS arm64:

```sh
bash scripts/build-macos.sh
open 'artifacts/macos/Depth AI.app'
```

`DEPTH_DOTNET`, `DEPTH_UNITY_EDITOR`로 도구 경로를 지정할 수 있습니다. 저장소의 `artifacts/dotnet/dotnet`이 있으면 우선 사용합니다. 빌드 스크립트는 공식 ASP.NET Core 8.0.33 arm64 런타임을 받아 공식 메타데이터의 SHA-512와 검증합니다. 앱 옆의 `service`, `runtime`, `sample` 폴더가 모두 필요합니다. 서명·공증된 배포 패키지는 아닙니다.

Windows:

```powershell
./scripts/build.ps1
./scripts/run.ps1 -ProjectPath 'C:/path/to/your/project'
```

결과는 `artifacts/windows/Depth AI.exe`. `Depth AI_Data`, `MonoBleedingEdge`, `service` 등 같은 폴더의 종속 파일도 필요합니다. 기존 PowerShell 스크립트의 framework-dependent 서비스는 .NET 8 / ASP.NET Core Runtime 8을 요구합니다. 이번 로컬 Windows 서비스 산출물은 별도로 self-contained publish했으며 Windows 실행은 검증하지 않았습니다. 모든 빌드 출력은 Git에서 제외합니다.

## 에이전트와 프로젝트 도구

UI의 `Connections`/`Settings`에서 API 모드·모델을 설정합니다. CLI는 로컬 인증과 `DEPTH_CODEX_EXECUTABLE`의 네이티브 실행 파일을 사용합니다. 키는 세션 메모리에만 유지합니다. 실제 모델 계정과의 end-to-end 품질 검증은 남아 있습니다.

Depth MCP는 같은 실행 중인 workspace에 연결됩니다. 도구는 `modules.search`, `modules.get`, `source.read`, `modules.impact`, `modules.context`, `modules.record`, `changes.propose`, `changes.review`입니다. 변경 제안 도구는 소스를 적용하지 않습니다. 화면에서 검토 후 승인 적용합니다.

서비스는 기본 `127.0.0.1:43821`, `X-Depth-Token`을 사용합니다. 독립 실행 시 `DEPTH_PORT`, `DEPTH_TOKEN`, `DEPTH_STORAGE` 설정 가능. 새 HTTP 계약은 `POST /impact`, `POST /context/packet`, `GET /proposals/{id}`의 `assessment`입니다. 기존 import/view/source/property/agent/MCP 흐름은 유지합니다.

## 검증

```sh
artifacts/dotnet/dotnet run --project src/Depth.Service -c Release -- --self-test
PATH="$PWD/artifacts/dotnet:$PATH" python3 tests/native_workspace.py
```

서비스 54 assertions, 실제 HTTP/stdio MCP 동일 문맥, 실제 macOS 앱의 격리 변경 적용·재분석 및 세 가지 해상도 검증을 통과했습니다. API 도구 루프는 fake provider 검사입니다. 자세한 근거와 미검증 범위는 [검증 기록](docs/validation.md)과 [최신 인수인계](docs/HANDOFF-2026-10-30.md)를 확인하십시오.

현재 C#은 Roslyn 분석, Dart는 선택적 analyzer 어댑터를 사용합니다. 전체 프로젝트 빌드 구성 로딩, 범용 웹/앱/게임 프리뷰 연결, 행동 보존, 실제 모듈 재구성·재사용, MR 실행은 남아 있습니다. 예전 프로토타입과 설계 설명은 [아키텍처](docs/architecture.md), `design/atlas/`, `design/assembly/`에 보존되어 있습니다.
