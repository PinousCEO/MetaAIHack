# Depth AI

실제 코드·에셋을 공통 모듈 ID, 소스 근거, 관계, 설계 요약으로 이해하고 변경을 검토하는 Unity 데스크톱 프로토타입입니다. Checkout은 소스 연결 검증 예제이며 제품 자체가 쇼핑 앱이라는 뜻이 아닙니다.

**다음 CLI는 [2026-10-31 인수인계](docs/HANDOFF-2026-10-31.md)와 [AGENTS.md](AGENTS.md)를 먼저 읽으십시오.** 전체 구조 점검, 이번 구현·검증과 남은 작업이 정리되어 있습니다. 새 Unity EXE 빌드는 로컬 Package Manager/라이선스 IPC 오류로 막혀 있으며 이번 UI는 C# 참조 컴파일만 통과했습니다. 현재 PC 디자인의 최종 사용자 승인은 없습니다. [이전 실패 기록](docs/HANDOFF-2026-10-29.md)을 승인된 완성 상태로 해석하지 마십시오.

## 현재 화면과 동작

- 기본 `Spatial workspace`: 중앙 프리뷰 주변의 실제 소스 모듈, 선택 몸체의 전진·정면 회전, 소스 참조선, 눌렀을 때만 작동하는 카메라 드래그. `Overview`로 복귀, `Workbench`에서 기존 정면 편집뷰 사용.
- `Impact`: 공유 구현의 직접·간접 사용처와 파일/행 근거. `Show affected in space`는 같은 ID의 영향 모듈만 공간에서 보여줍니다. 실제 동작 변화나 코드 통합을 증명하는 기능은 아닙니다.
- `Changes`: 줄 번호와 추가·삭제 강조, 전체 파일 전환, 수정 선언·영향·해시·구문 검사. `Build & tests`에서 지정한 명령을 변경 복사본에 실행하고 로그·결과를 제안과 연결합니다. 필수 검증이 없거나 만료/실패하면 Apply를 거부합니다. 미설정/미실행 검사는 `not-run`이며 설정한 테스트의 통과도 행동 보존 증명이 아닙니다. 이번 UI의 실제 렌더링은 미검증입니다.
- `Impact → AI context`: 화면과 MCP/CLI/API 에이전트가 사용하는 revision 기반 문맥 패킷. 소스 해시, 발췌, 설계 기록 상태, 영향 경로, 생략 수를 확인합니다. 문맥은 최대 24,000자이며 토큰 절감 효과는 측정하지 않았습니다.
- `History`: 재시작 후 제안·이력을 복원하고, 중단된 적용의 원본 복구와 검토·검증을 거치는 되돌리기를 제공합니다. `Code`의 전체 소스 편집도 변경 검토로 연결했습니다. 이 UI들은 새 EXE에서 아직 검증하지 못했습니다.
- `New source`와 소스 편집의 삭제 선택으로 파일 생성·삭제도 검토할 수 있습니다. 변경 복사본의 검증과 적용/복구/undo를 공유합니다. 의미적 import 갱신과 Unity asset GUID 이동은 지원하지 않습니다. 캡처된 C# 컴파일 입력의 소스 목록 변경도 아직 제한됩니다.

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

최신 제품 기본은 **Meta Model API**입니다. `.env`의 `MODEL_API_KEY`로 Muse Spark의 코드·모듈 작업과 Muse Image의 이미지 생성을 사용합니다. SAM/Chameleon 설치는 필요하지 않습니다. `Modules`에서 수학적 분할·소스 계약을 확인하고 실제 파일 분리/두 프로젝트 통합을 제안합니다. 모듈의 개념·사용 이유·예시·코드 근거는 **초보자/중급자/숙련자** 수준으로 읽고, AI는 같은 기록의 압축 계약을 사용합니다. 생성 당시 기록한 이유와 소스에서 추정한 이유를 구분합니다. 변환은 빌드·행동 테스트 통과 후 검토 적용합니다. `Create asset`는 2D/3D 스타일 **PNG 이미지**를 생성·검토·가져옵니다. GLB 모델 생성과 구분합니다. **실제 Meta 호출은 세션 네트워크 연결 실패로, 최신 Unity EXE는 빌드 환경 제한으로 아직 미검증**입니다. [설정·수학 모델·정확한 범위](docs/META-MODULES.md)를 확인하십시오. MCP는 총 12개입니다.

설정 예시는 `.env.example`에 있습니다. `.env`는 Git에서 제외되며 서비스가 직접 읽습니다. 일반 터미널의 `scripts/check-meta.ps1`로 계정의 모델 목록을 확인하고, `-Probe`로 작은 텍스트 추론을 검사합니다. 키를 로그나 Git에 넣지 마십시오.

UI의 `Connections`/`Settings`에서 API 모드·모델을 설정합니다. CLI는 로컬 인증과 `DEPTH_CODEX_EXECUTABLE`의 네이티브 실행 파일을 사용합니다. 키는 세션 메모리에만 유지합니다. 실제 모델 계정과의 end-to-end 품질 검증은 남아 있습니다.

Depth MCP는 같은 실행 중인 workspace에 연결됩니다. 도구는 `modules.search`, `modules.get`, `source.read`, `modules.impact`, `modules.context`, `modules.record`, `changes.propose`, `changes.review`입니다. 제안에는 `modules.get`/공통 문맥에서 얻은 `projectId`와 `revision`이 필요합니다. CLI/API 작업 중 프로젝트나 소스가 바뀌면 이전 작업을 거부합니다. 변경 제안 도구는 소스를 적용하지 않습니다. 화면에서 검토 후 승인 적용합니다.

서비스는 기본 `127.0.0.1:43821`, `X-Depth-Token`을 사용합니다. 독립 실행 시 `DEPTH_PORT`, `DEPTH_TOKEN`, `DEPTH_STORAGE` 설정 가능. 새 HTTP 계약은 `POST /impact`, `POST /context/packet`, `GET /proposals/{id}`의 `assessment`입니다. 기존 import/view/source/property/agent/MCP 흐름은 유지합니다.

## 검증

최신 서비스 self-test는 **199 assertions**입니다. 직접 만든 두 .NET 프로젝트의 분리/통합/되돌리기를 3회 반복해 적용 전/후 실제 행동 사례를 **768회 실행**했고, 손상 PNG를 수락하던 결함을 수정했습니다. Meta 응답은 명시적 모의이며 실제 API 연결은 실패했습니다. 최신 Unity EXE도 Package Manager IPC 문제로 미검증입니다. [정확한 결과와 재현 명령](docs/ACCEPTANCE-2026-10-31.md)을 확인하십시오. `scripts/test-acceptance.ps1`은 기본 실제 Meta, `-Fixture`는 모의 응답입니다. 아래 118개 기록은 이전 단계입니다.

```sh
dotnet run --project src/Depth.Service -c Release -- --self-test
python tests/native_workspace.py
```

현재 서비스 118 assertions와 HTTP/stdio MCP, 복원·되돌리기, 실제 .NET 빌드/실행, Dart/Web 어댑터와 복사본 `tsc` 검증을 통과했습니다. 기존 macOS 화면 검증은 10월 30일 소스 기준입니다. API 도구 루프는 fake provider 검사이며 실제 CLI 호출은 이 실행 환경의 app-server 초기화 접근 거부로 실패했습니다. 자세한 근거와 재현 명령은 [검증 기록](docs/validation.md)과 [최신 인수인계](docs/HANDOFF-2026-10-31.md)를 확인하십시오.

C#은 Roslyn과 선택적 csproj 컴파일 입력 캡처, Dart는 resolved analyzer, 웹은 TypeScript compiler 어댑터를 사용합니다. Unity asmdef 전용 로딩, 범용 웹/앱/게임 프리뷰 연결, 행동 보존, 의미적 파일 이동/참조 자동 갱신, 실제 모듈 재구성·재사용, MR 실행은 남아 있습니다. 예전 프로토타입과 설계 설명은 [아키텍처](docs/architecture.md), `design/atlas/`, `design/assembly/`에 보존되어 있습니다.
