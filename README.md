# Depth AI

**2026-10-29 작업 중단: 현재 EXE는 사용자가 요청한 레퍼런스 디자인 재현에 실패한 상태입니다. 다음 작업 전에 [인수인계와 실패 기록](docs/HANDOFF-2026-10-29.md), [목표 이미지와 실제 EXE 비교](docs/visual-handoff.html), [작업 재개 지침](AGENTS.md)을 먼저 확인하십시오. 현재 UI는 승인된 완성 디자인이 아닙니다.**

새 네이티브 클라이언트는 `unity/Depth.Desktop/Assets/Scripts/DepthWorkbench.cs`입니다. 실제 소스 인덱스·구성 조회·속성 변경 검토·재분석, MCP 컨텍스트 도구, API 에이전트 연결 코드가 들어갔습니다. 현재 Checkout은 실제 C# 소스를 연결한 기능 검증 예제이며 제품 자체가 쇼핑 앱이라는 뜻이 아닙니다. API/CLI의 실제 모델 계정 응답은 검증하지 않았습니다. 생성한 역할별 아이콘도 아직 적용하지 못했습니다.

로컬 실행 파일은 `artifacts/windows/Depth AI.exe`이며 빌드 출력은 Git에 포함하지 않습니다. 아래에는 이전 시안과 초기 프로토타입의 설명도 남아 있으므로 현재 구현 범위는 인수인계를 기준으로 확인하십시오.

조립·분해 기반의 새 3D 시안: `design/assembly/index.html`. `scripts/open-assembly.cmd`로 현재 소스를 재분석한 뒤 열 수 있습니다. 실제 3D 부품 선택, 결합·분해 전환, 기능별 강조와 원본 코드 탐색을 제공합니다. [설계 근거와 한계](docs/assembly-design.md).

현재 실제 소스를 연결한 공간형 탐색 시안: `design/atlas/index.html`을 브라우저에서 여십시오. `scripts/open-atlas.cmd`는 현재 저장소의 소스를 재분석한 뒤 화면을 엽니다. 기능 구역 확대, 모듈·심볼 선택, 원본 코드·관계 조회, 검색을 지원합니다. 이 시안의 기능 분류는 설계 제안이며 Unity EXE와는 별도입니다. [설계와 연결 범위](docs/atlas-design.md).

Unity 6 Windows 클라이언트 + 독립 .NET 분석 서비스로 시작하는 소프트웨어 이해·개발 플랫폼 프로토타입입니다. 실제 소스를 읽으며 데모 그래프로 대체하지 않습니다.

## 실행

요구 환경: Windows, Unity **6000.3.13f1**, .NET **8 SDK / ASP.NET Core Runtime 8**. 현재 EXE는 .NET 런타임을 포함하지 않는 개발용 배포입니다.

```powershell
./scripts/build.ps1
./scripts/run.ps1 -ProjectPath 'C:/path/to/your/project'
```

빌드 결과는 `artifacts/windows/Depth AI.exe`입니다. `service`, `Depth AI_Data`, `MonoBleedingEdge` 등 같은 폴더의 파일도 함께 필요합니다. EXE만 옮기면 실행되지 않습니다.

1. 경로 입력 → **Import project**: 실제 `.cs`, `.dart` 소스 스냅샷 생성.
2. 영역 선택 → 구성 심볼·근거·관계·원본 코드 조회. 검색, 선택 주변 필터, 18개 단위 페이지 제공.
3. **Ask Codex for a proposal**: 로컬 Codex가 읽기 전용으로 실제 소스를 조사하고 코드 수정 또는 기능 모듈 분류를 제안.
4. 검토 화면에서 원본·수정본·이유를 확인하고 **Approve and apply**.
5. 승인된 변경 적용 및 재분석. 외부 편집도 5초 주기로 재분석. 충돌 시 변경안을 다시 생성해야 합니다.

`scripts/run.ps1`은 npm으로 설치된 Codex의 네이티브 실행 파일을 찾아 설정합니다. 다른 설치 방식은 `DEPTH_CODEX_EXECUTABLE`에 실제 `codex.exe` 경로를 지정하십시오. 로컬 CLI 로그인이 필요합니다. 사용자 CLI 설정과 MCP 설정을 상속하므로 신뢰하는 설정으로 실행해야 합니다. Depth 자체 MCP 서버 및 API 키 설정 UI는 아직 없습니다.

Flutter AST 분석 활성화:

```powershell
cd adapters/dart
dart pub get
cd ../..
./scripts/run.ps1 -ProjectPath 'C:/path/to/flutter/project'
```

Dart 설치 경로가 자동 인식되지 않으면 `DEPTH_DART_EXECUTABLE`에 네이티브 `dart.exe`, `DEPTH_DART_ADAPTER`에 `adapters/dart/bin/index.dart`의 절대 경로를 설정합니다. 어댑터가 없으면 파일 해시만 기록하고 미분석 상태를 진단에 표시합니다.

## 구현 범위

| 기능 | 현재 상태 |
|---|---|
| Windows Unity 앱, 실제 프로젝트 가져오기 | 구현·빌드·실행 검증 대상 |
| C# 분석 | Roslyn 선언/멤버/partial 타입/해석된 호출·생성·상속. 프로젝트 빌드 구성 전체 로딩은 미구현 |
| Dart 분석 | analyzer AST 클래스/메서드/필드/함수. 의미적 호출 해석·위젯 추적 미구현 |
| 초기 모듈 | 디렉터리 기반 영역이며 **기능적 모듈로 검증된 것으로 표시하지 않음** |
| AI 기능 모듈 | Codex가 전체 엔티티의 기능별 분류를 제안, 검토 후 적용. 실제 모델 응답 검증은 별도 필요 |
| 코드 변경 | 기존 인덱싱 파일의 전체 텍스트 교체, 승인·해시 충돌 검사·백업·변경 기록·재분석 |
| 원본 동작 보존 | 자동 보장 없음. 대상 Unity/Flutter 빌드·행동 테스트 실행기는 미구현 |
| 실행 객체 연결 | 선택적 Unity Editor Play Mode 어댑터. 3D Collider 클릭/Hierarchy 선택 → 컴포넌트 소스 경로 |
| 자연어 새 프로젝트 생성·프로젝트 통합 | 설계 단계. 초기 프로토타입은 기존 소스 분석·수정에 집중 |
| MR·여러 사용자·마켓플레이스 | 설계 단계 |

## 런타임 선택 어댑터

`unity/Depth.Desktop/Assets/Editor/DepthRuntimeBridge.cs`를 대상 Unity 프로젝트의 `Assets/Editor`에 복사합니다. Depth에 그 프로젝트를 가져온 뒤 대상 에디터에서 **Depth → Runtime source bridge**를 엽니다.

Depth 서비스 토큰은 `%USERPROFILE%/AppData/LocalLow/Depth AI/Depth AI/service/service.token`에 있습니다. 연결 후 Play Mode에서 `MainCamera`의 Game View 안에 있는 3D Collider를 클릭하거나 Hierarchy 객체를 선택합니다. 스크립트가 붙은 자식·부모도 조사합니다. 이 결과는 **선택 순간의 컴포넌트 소속 관찰**이며 행동 원인이나 데이터 흐름을 증명하지 않습니다. 씬 전용 객체·동적 객체는 session + instance ID로 구분합니다. 변경 후에는 새 스냅샷에 다시 연결해야 합니다. 패키지 소스, 2D Collider, UI EventSystem, standalone 게임 주입은 미지원입니다.

## 서비스 및 검증

```powershell
dotnet run --project src/Depth.Service -- --self-test
python tests/integration.py
cd adapters/dart
dart analyze
```

서비스는 loopback `127.0.0.1:43821`에만 바인딩하고 `X-Depth-Token`을 요구합니다. 브라우저 Origin 요청을 거부합니다. API: `/import`, `/graph`, `/refresh`, `/search?q=`, `/source/{id}`, `/propose`, `/proposals/{id}`, `/apply`, `/runtime/select`, `/runtime/selection`.

독립 실행 시 `DEPTH_PORT`, `DEPTH_TOKEN`, `DEPTH_STORAGE`를 설정할 수 있습니다. Unity 앱은 세션 토큰을 생성해 자식 서비스에 전달합니다. 초기 버전은 앱 인스턴스 하나만 지원합니다.

설계와 제한 사항은 [아키텍처](docs/architecture.md), 실제 실행 결과는 [검증 기록](docs/validation.md)을 참고하십시오.
