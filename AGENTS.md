# Depth AI 작업 재개 지침

## 2026-11-03 최신 — CLI 옆 동반 패널 0.2.0, 현재 작업 자동 표시

- 사용자가 핵심을 다시 정정했다: **CLI가 작업하면 그 실제 CLI 창 옆에서 방금 바꾼 모듈·노드·연결·이유가 보여야 한다.** 0.1.0의 별도 전체 프로젝트 지도는 이 요구를 충족하지 않았다. 새 진입점은 `deliverables/2026-11-03/implementation/companion.html`, 실행 파일은 같은 `artifacts/depth-lens/Depth Lens.exe`의 **0.2.0**이다. 이전 제품 기능을 자동 재개하지 않는다.
- `windows/Companion.cs`, `NativeWindows.cs`에 실제 프로세스/시작 시간/HWND 식별, 단일 창 자동 연결, Link CLI의 명시적 창·연결 선택, 오른쪽/왼쪽 배치, 이동·크기·최소화·복원 추적, 포커스 유지, 위치 추적 중지/분리, 창 종료 복구를 구현했다. 여유 공간이 없으면 겹침 모드를 명시하고 CLI 크기를 바꾸지 않는다. 패널 헤더를 직접 끌면 위치 추적이 중지된다. 모호한 창이나 터미널 활성 탭을 자동 식별했다고 주장하지 않는다.
- `sessions.cjs`가 MCP bridge/명령 어댑터의 실제 로컬 프로세스 세션을 등록·갱신·종료하고 action에 transport ID를 연결한다. `work-view.cjs`와 `/work`는 현재 작업의 변경 파일과 직접 관계만 펼치며 추가/수정/삭제·사라진 관계를 유지한다. 여러 저장을 한 작업에 누적하고, 실패 명령의 마지막 부분 저장도 조정한다. 보고 없는 변경은 unknown, 다른 CLI의 보고는 구분한다. Live work와 Overview를 구별한다. 작업 이유 공간을 넓혔고 작업 전체 Explain 버튼도 연결했다. CLI 자체의 미보고 도구 호출을 가로채는 기능은 아니다.
- 새 서비스 검사 **9개**는 `artifacts/lens-companion-test-1793687465866/report.json`, 기존 통합 **16개**는 `artifacts/lens-test-1793687465902/report.json`이다. 별도 실제 stdio MCP/구독/소스/CLI 어댑터 회귀 **9개**와 내부 Queue 실행 **3개**는 `artifacts/lens-companion-regression-20261103/`에 있다. 합산하지 않는다.
- 최신 네이티브 검수는 `artifacts/lens-companion-native-20261103-final-package/companion-result.json`: **17개**, 실제 Node 명령 어댑터와 별도 WPF 검수용 출력 호스트의 HWND를 자동 연결했다. 실제 CLI 창 좌표 (20,25,600,800)에 패널 (630,25,570,800), 이동 후 (45,45,520,760)에 패널 (575,45,570,760)을 확인했다. 이 호스트는 실제 subprocess stdout/stderr를 표시하며 Windows Terminal/Codex 자체가 아니다. CLI 시작 폴더가 대상 프로젝트 밖이어도 보고의 projectId로 연결하는 경로를 검수했다.
- 같은 작업의 실제 Meta **muse-spark-1.3** 설명을 새 Explain 동작으로 생성했다. 최신 작업 ID는 위 report에 있고 **6개 claim 근거 ID**를 확인했다. 이번 수정 중 다른 성공 검수 `-final`, `-release2`, `-package`와 중단된 `-release`의 pending 설명도 남아 있다. 중단 결과를 성공으로 합산하지 않는다. 실제 호출을 fixture로 대체하지 않았고 키를 출력/배포하지 않았다.
- 최종 WPF 원본 PNG **5장**을 직접 확인했다. 서비스 12개 원본·배포 해시, 실제 검사에 쓰인 DLL/서비스 해시, PNG 복사 해시는 `implementation/companion-verification.json`에 있다. 예전 `verify-delivery.cjs`는 0.1.0 전용으로 가드하고 현재 검증기는 `node lens/verify-companion.cjs`다. HTML 내부 링크 검사는 브라우저 픽셀 검수가 아니다.
- 일반 cmd 콘솔의 실제 표시 검수 `-a`~`-d`는 visible HWND를 얻지 못해 실패했다. 콘솔 생성/연결은 됐지만 GetConsoleWindow 반환 핸들을 보이는 창으로 사용할 수 없었다. 이를 일반 CLI 성공으로 쓰지 않는다. WPF 검수 호스트의 실제 좌표/행동과 OS 바탕화면 합성 캡처는 별개다. 후자는 회귀에서도 invalid handle로 실패했다. **사용자의 실제 Windows Terminal/Codex 연결, Link CLI 대화상자의 물리 클릭, 활성 탭 자동 식별, 다중 모니터/DPI, 물리 단축키 및 시각 승인은 미완료**다. 권한·샌드박스·사용자 전역 MCP 설정을 변경하지 않았다.

## 2026-11-03 최신 — Depth Lens 실제 구현 0.1.0, 실행·MCP·Meta 검증

- 사용자는 설계 예제에서 멈춘 것을 거부하고 **실제 작업 완료**를 요구했다. `lens/`에 새 독립 구현을 만들었다. 기존 Depth AI/Unity/MR 소스는 보관한 채 새 Node 분석 서비스와 Windows WPF 투명 패널을 구현했다. 새 실행 파일은 **`artifacts/depth-lens/Depth Lens.exe`**, 안내는 `lens/README.html`, 전달 진입점은 `deliverables/2026-11-03/implementation/index.html`이다.
- 실제 JS/TS 컴파일러 선언·타입/호출/참조/import, 파일 감시·hash reconciliation, 파일/멤버 그래프, 이동/범위별 배치·검색/줌/카드 회피 경로, 소스·근거·라이트/다크·투명 배경·고정·클릭 통과/트레이/단축키 복구를 연결했다. 최대 1,600파일/24MB, 화면 최대60노드와 표시 수. JSON/CSS/HTML은 파일 노드다. 전 언어·실행 추적·탐색기 진입 자동 감지를 완료로 주장하지 않는다.
- `bridge.cjs`는 실제 stdio MCP, `protocol.cjs`는 도구·resource·구독, `cli.cjs`는 명시적 명령 어댑터다. 실제 프로젝트·작업·세션·revision·근거 ID를 유지하고 CLI 보고와 관찰을 분리한다. MCP만 연결해 모든 도구를 자동 감청하거나 CLI 문서 사용을 강제하지 않는다. 앱 **MCP** 버튼으로 실행 환경의 설정을 제공한다. 현재 대화/사용자 전역 CLI 설정을 임의로 변경하지 않았다.
- `core.cjs`에 지속 journal·스냅샷·중복 보고 검사·충돌 귀속·재시작 복구·오래된 설명 제외·문맥 문자 예산·생략량·작업 이력을 구현했다. `Export memory`가 프로젝트 `.depth-lens/`에 JSON과 사람이 읽는 문서를 내보낸다. 앱 내부 기록은 기본 `%LOCALAPPDATA%/DepthLens`, 검수는 저장소 artifacts에 격리했다. 파생 문서는 감시에서 제외한다.
- 실제 Meta 연결 및 소스 변경 설명을 **muse-spark-1.3**으로 확인했다. `artifacts/lens/meta-connectivity.json`과 `artifacts/lens-live-1793684259305/report.json`. 6개 claim 근거 ID 검증과 문맥 재조회. 모델 의미 전체를 자동 증명한 것은 아니다. 코드에서 확인된 사실/명시 목적/설계 해석을 구분하고 초보·중급·숙련 설명을 저장한다. 키는 기존 비공개 `.env`에서 읽으며 배포하지 않는다. 실제 Meta 호출과 fixture를 구별한다.
- 최종 통합 **16개**는 `artifacts/lens-test-1793685794786/report.json` (실제 파서·파일 감시·인증HTTP/MCP 처리·표본 코드 실행·rename/delete·동시 귀속·메모리 복구; Meta fixture). 배포 EXE의 별도 실제 stdio MCP/구독/파일 변경/보고/문맥/CLI 검수 **9개**와 그 안의 실제 Queue node:test **3개**는 `artifacts/lens-final-native-20261103/mcp-native-result.json`, `cli-adapter-tests.log`. 수치를 합산하지 않는다. 최종 native PID14832. Node의 pipe 기반 child spawn 검사는 EPERM이 있었고, 실제 WPF acceptance에서 표준 ProcessStartInfo로 bridge/명령 어댑터를 실행했다. 테스트는 node:test 파일 직접 실행이며 --test의 자식 프로세스 모드는 EPERM이었다. OS 보안을 낮추지 않았다.
- 최종 실제 WPF 렌더 PNG6장을 직접 검토하고 카드 겹침/연결선이 무관한 카드를 통과하는지 검사했다. `artifacts/lens-final-native-20261103/native-result.json`은 실제 창 속성·click-through style·단축키 등록/WM_HOTKEY 복구를 기록한다. **OS 합성 screenshot은 잘못된 핸들로 실패**했고 PNG는 RenderTargetBitmap이다. 물리 키 입력·여러 모니터/DPI·바탕화면이 비치는 모습의 시각 승인까지 주장하지 않는다.
- 배포는 .NET8 Windows Desktop Runtime 필요(현 PC8.0.25에서 실제 실행). self-contained NuGet 복원은 NU1301로 실패하여 framework-dependent EXE를 제공했다. Node/TypeScript는 포함했다. `lens/build.ps1`도 이 배포 형식이다. 배포 파일·PNG 해시는 implementation/verification.json에 둔다. 옛 아카이브 ZIP은 새 구현을 포함하지 않는다.

## 2026-11-03 최신 — Depth Lens 시각 방향 승인, CLI 작업·Meta 설명·MCP 기억 요구

- 사용자가 새 투명 패널 시안을 긍정적으로 평가하고 다음 핵심 요구를 추가했다: **CLI가 작업할 때 모듈·노드를 실시간 갱신하고, 한 행동의 의미·설계/생성 이유를 Meta AI가 설명하며, 그 기록을 기계가 읽기 쉬운 형태로 남겨 다음 MCP 연결 CLI의 프로젝트 이해에 재사용한다.** 이전 Depth AI의 범용 런타임/MR 기능 작업을 자동 재개하지 않는다.
- `deliverables/2026-11-03/work-memory/index.html`에 동작 흐름·출처·기록 구조·MCP 계약·수용 조건과 단계별 조작 예제를 추가했다. `contract.json`은 제품 설계 계약(정식 JSON Schema나 배포 MCP 서버가 아님), `sample.json`은 직접 작성한 TypeScript 텍스트의 해시·예시 관계·설명·제약이다. `build-sample.cjs`가 JSON과 브라우저용 데이터를 함께 만든다. `verify.cjs`와 verification.json은 자료/DOM 검수이며 실제 화면·CLI·Meta·OS 투명 창 검수가 아니다.
- MCP 연결만으로 CLI의 모든 셸/편집 호출을 관찰하거나 문서 사용을 강제하지 않는다. CLI hooks/작업 보고와 파일 감시를 결합하며, 불명확한 행위자는 unknown/conflicting으로 기록한다. 작업 보고·실제 파일 변화·검증 결과를 구별한다. 그래프 갱신은 Meta 응답과 독립적으로 진행한다.
- **설명 공급자는 Meta**다. 새 모델 연결 검증은 아직 없으며 모델 ID를 성공으로 단정하지 않는다. 설명은 요구사항·명시된 의도·diff·소스·검증 결과에 근거한 설계 요약이다. 숨겨진 사고 과정 복원이나 미기록 의도 단정이 아니다. 같은 근거에서 초보/중급/숙련 설명과 기계 JSON을 제공한다.
- 기록은 project/action/session/module/evidence ID, revision/fingerprint, 전후 변화, 대안·비용·제약·출처를 갖는다. 오래된 설명은 이력에 보관하되 현재 문맥에서 제외한다. 다음 CLI는 개요→관련 계약→근거→필요한 소스 순서로 조회하며 문서의 지시문은 신뢰된 실행 지침이 아니다.
- 기존 12장·포트폴리오·ZIP·앱 소스는 보존했다. brief와 진입점에 새 요구를 반영했다. 이번 산출물은 **설계와 시뮬레이션**이며 새 MCP 서버/CLI 어댑터/파일 감시/Meta 호출/투명 창은 미구현·미검수다. 기존 ZIP은 이번 후속 자료를 포함하지 않는다.

## 2026-11-03 최신 — 기존 제품 아카이브, 투명 폴더 지도 새 시안

- 사용자는 기존 프로젝트를 포트폴리오로 정리하고 기존 방향을 포기한 뒤 새롭게 개발할 의사를 밝혔다. 최신 요청은 **기존 스크린샷·정리 + 새 투명 데스크톱 패널 레퍼런스 10장 이상**이다. 이전 전체 기능 구현 작업을 자동 재개하지 않는다. 기존 소스·키·이력·검수 자료는 삭제하지 않는다.
- 결과 진입점은 `deliverables/2026-11-03/index.html`. 포트폴리오에 실제 캡처 8장(0.6.1 Electron 예제 화면 6장 + WinForms 대상 앱 live-control-render 2장), 기술 구조, 검증 범위, 미완료 항목, 회고, 복사용 소개 문구를 분리했다. 당시 예제 Checkout 화면을 최신 0.9.1 임의 런타임 성공으로 쓰지 않는다. 모든 캡처는 원본 바이트 그대로이며 `portfolio/screenshot-manifest.json`에 출처와 해시가 있다.
- 새 가칭 **Depth Lens**는 CLI로 만든 폴더의 파일·모듈 연결을 투명 데스크톱 패널에서 설명하는 방향이다. `references/index.html`의 12장은 built-in image_gen 생성 시안이며 기존 제품 레퍼런스를 재사용하지 않고 새 기준 이미지로 통일했다. 폴더 진입/탐색기 선택/모듈 내부/근거/영향/변경 감시/작은 클릭 통과 패널/라이트/패키지 묶음/미해석 연결/AI 설명을 다룬다. 프롬프트·교정 내역·해시를 함께 남긴다. 실제 투명 창 구현이나 모델 호출/제품 성공 증거가 아니다.
- 새 기획은 `references/brief.html`. 첫 구현 범위는 명시적 폴더 선택과 읽기 전용 JS/TS 관계 탐색, 소스 근거, 파일 감시, 실제 OS 투명 창·포커스·클릭 통과 복구다. 탐색기 폴더 진입 자동 감지, 전 언어/런타임, 범용 코드 변경을 완료된 기능으로 약속하지 않는다. 생성 이미지의 OS 시간·코드·글자·선은 예시이며 데이터 계약이 아니다.
- 직전 runtime 오류 수정은 0.9.1에 보존되어 있다. 초기 sync 전에 bounds/highlight가 누락 IPC를 호출하던 경로를 막고, 프리뷰 실패를 소스 가져오기와 분리했다. 최종 DOM56(`artifacts/runtime-dom-1793622059459/`), 콜드 스타트 누락 IPC DOM13(`artifacts/runtime-dom-1793621996052/`), 실제 main/preload를 로드하는 배포 fixture13(`artifacts/boot-ipc-1793621946272/`), npm.cmd test와 배포77파일 해시 통과. 새 직접 EXE PID48716은 `artifacts/runtime-ipc-native-20261102/stderr.log`의 Mojo IPC0x5로 실패했다. **사용자가 실제 실패를 계속 보고했으며 전체 완료/수용은 아니다.** 아카이브 작업에서 새 Meta 호출이나 새 EXE 검수는 하지 않았다.

## 2026-11-02 최신 — 모듈 값 직접 편집 0.9.0, Meta 역할 공개

- [값 편집·Meta 역할·검수 기록](docs/DESKTOP-SOURCE-VALUES-20261102.md)을 먼저 읽는다. 사용자가 모듈 화면의 쉬운 값 편집 누락과 실제 Meta 사용 모델을 지적했다. 기존 숨겨진 C# 숫자 필드 제안만으로 요구를 충족했다고 말하지 않는다.
- `SourceValues.cs`와 web/Dart AST 어댑터로 실제 위치의 숫자·문자열·불리언(C# 문자 포함)을 노출한다. `value-editor.js/css`의 모듈 내부 **Values**, 그래프 값 버튼, Details의 Edit values를 연결했다. 선택 모듈/소유 멤버/도달 가능한 의존성의 여러 값을 한 번에 적용하고 undo한다. 입력 초안은 같은 revision 안의 접기/모듈 전환에서 유지한다. 원본 revision/hash·정확한 위치·필수 프로젝트 검증을 유지하며 직접 값 편집에는 Meta를 호출하지 않는다.
- 현재 설정은 Meta Model API의 **muse-spark-1.3**(의미 분석·설명·분리/통합 제안·CLI), **muse-image-1.0**(PNG)다. `AI models` 버튼이 역할을 표시한다. 실제 소스 인덱싱은 Roslyn/TS/Dart, 프리뷰는 런타임 어댑터다. SAM/레거시 worker는 기본 경로가 아니며 타 provider로 자동 fallback하지 않는다. 실제 GLB 미지원, 이번 새 Meta 호출 없음.
- 최종 서비스 **240개**(`artifacts/source-values-service-final.log`), 실제 서비스+렌더러 DOM/HTTP/프로젝트 JS **52개**(`artifacts/runtime-dom-1793621050167/`), 실제 Dart 수정·실행·undo **9개**(`artifacts/source-values-dart-a502ea3398/`), TypeScript 실제 tsc 복사본 검증(`artifacts/web-graph-448da1b7d6/`) 통과. 실제 웹 코드에서 48→60, 0.2→0.25 후 $45.00을 확인했다. Electron host fixture38/제품 fixture39/기본 npm test도 기록에 있다. 서로 합산하거나 새 픽셀/Meta 성공으로 쓰지 않는다.
- `0.9.0` EXE resources와 별도 `service-0.9.0`을 배포했다. **77개 해시 일치**, `.env` 제외는 `artifacts/source-values-package-20261102.json`. 기존 실행 서비스 폴더는 보존한다. 새 main/preload/service는 **EXE 재시작이 필요**하다. 구버전 서비스 UI는 편집을 막고 재시작을 안내한다.
- 기존 review의 `values-090-layout*`는 UI not ready, `values-090-diagnostic.json`은 UnknownVizError로 새 PNG가 없다. 후속 요청 응답이 없고 마지막 프로세스 조회에서 PID22876은 없었다. 에이전트가 그 사용자 프로세스를 종료하지 않았으며 원인을 추정하지 않는다. 새 직접 실행 PID7860도 `artifacts/source-values-native-20261102/stderr.log`의 **Mojo IPC0x5**로 종료됐다. 보안을 낮추지 않았고 새 실제 화면/시각 승인/전체100%를 주장하지 않는다.
- JSX/HTML/CSS/계산식·런타임 상태/임의 언어 전체 값 편집이 아니다. 정확한 AST literal만 제공하며 타입 의미 보존은 프로젝트 빌드/테스트 검증이 필요하다. 새 `actual-project-runtime-2-values` native 검사 구현과 실제 실행 통과를 구분한다. 이전 Unity/Flutter/일반 네이티브/GLB 한계는 유지한다.

## 2026-11-02 최신 — 실제 엔진 소스 브리지 0.8.0, WinForms 실행 검증

- [엔진 어댑터 구현·실검증·남은 범위](docs/DESKTOP-ENGINE-BRIDGES-20261102.md)를 먼저 읽는다. 사용자 요구는 실제 프로젝트 프리뷰와 CLI/모듈 양방향 연결이다. Unity/MR 제품으로 되돌리지 않는다. 이전 0.7.0의 Unity/Flutter 소스 브리지 미구현 상태는 아래 구현으로 일부 갱신됐지만 전체 플랫폼 완료는 아니다.
- `runtime-bridge.cjs`/`runtime-adapters.cjs`와 Unity·Flutter·WinForms SDK를 추가했다. 실제 엔진 프레임/히트 테스트/소스 위치/입력을 프로젝트별 루프백 세션으로 연결한다. 모듈 선택은 16% 별도 overlay다. 여러 소스에 연결된 요소는 모든 composition을 함께 펼치고 CLI에도 모든 소스 ID를 전달한다. 같은 첫 root에 새 멤버가 생기면 좌표가 없어 죽던 오류를 수정했다.
- **실제 WinForms 10개**(`artifacts/runtime-winforms-1793613029430/`) 통과: 독립 앱 빌드·실행, 버튼 세 번 각각 1회 실행, 실제 TextBox 입력, portable PDB 소스 및 변경된 소스 체크섬 거부. PNG 2장을 직접 봤다. `captureMode: live-control-render`이며 Count 0→3이다. **Depth AI EXE 화면이나 Unity/Flutter 실행 증거가 아니다.**
- Dart 분석기를 실제 데스크톱 시작/패키징에 연결하고 19개 패키지 URI를 상대 경로로 번들링했다. 실제 Dart+서비스 `artifacts/dart-graph-7cf8f99533/`의 11개 선언·13개 관계 검증 통과. Flutter SDK 정적 분석 `artifacts/flutter-adapter-check/result.json` 진단 없음. Unity 6 실제 어셈블리 기준 uGUI 유/무 컴파일 통과. SDK 컴파일/분석을 엔진 실행 성공으로 쓰지 않는다.
- runtime HTTP/웹 DOM35, 브리지 fixture28, Electron host fixture37, 최종 실제 서비스+렌더러 DOM39(`artifacts/runtime-dom-1793614005329/`), 기존 제품 fixture39(`artifacts/cohesion-contract-1793613436086/`) 및 기본 npm test 통과. 서로 합산하지 않는다. 새 실제 Meta 호출 없음.
- 독립 Unity 검수 PID40488은 `artifacts/runtime-unity-1793613109497/editor.log`의 라이선스/Package Manager IPC 문제로 프레임 없이 종료됐다. 해당 테스트 프로세스만 정리했다. 기존 WorldVR은 건드리지 않았다. Flutter 실제 실행은 SDK cache lockfile 권한 차단이 남아 있다.
- 새 EXE PID30324는 `artifacts/engine-native-20261102/stderr.log`의 Mojo IPC 0x5로 새 PNG가 없으며 검수용 프로세스만 정리했다. **기존 사용자 PID22876은 실제로 아직 존재**하고 `visual-review-2026-11-02T07-41-44-370Z/ready.json`도 있다. 이전의 종료 추정은 정정한다. 구버전 main 프로세스이므로 새 런타임 검증 증거로 쓰지 않는다. UI reload만으로 main/preload가 바뀌지 않으며 새 EXE 재시작 필요를 표시한다. 보안 우회/사용자 프로세스 강제 종료 없음.
- 배포 파일/해시는 `artifacts/engine-bridges-package-20261102.json`. `.env` 제외, 기존 .NET 서비스 DLL 동일. `0.8.0` UI+호스트+SDK+Dart 번들을 기존 EXE resources에 반영했다. 남은 범위는 문서의 UI Toolkit/일반 네이티브/React 자동 소스/모바일 배포/키보드·IME/실제 호스트 화면 검수다. 생성 SDK 소스가 프로젝트 인덱스에 보일 수 있다. 전체 100%/시각 승인 완료를 주장하지 않는다.

## 2026-11-02 최신 — 실제 실행 프리뷰로 정정, 전체 플랫폼 미완료

- 왼쪽은 **실제 개발 프로젝트의 실행 화면**이며 Depth AI 테마를 적용하는 예제 화면이 아니다. CLI와 같은 프로젝트를 공유하고 Unity/Flutter/웹/앱을 연결해야 한다. 이전 Checkout HTML 투영·19개 선언 바인딩·PNG는 실제 프로젝트 실행 증거가 아니다. [실제 런타임 수정·검증·미완료 범위](docs/DESKTOP-ACTUAL-RUNTIME-20261102.md)를 먼저 읽는다.
- **0.7.0**에서 기본 `renderPreview`의 쇼핑 HTML을 제거했다. 미연결이면 미연결 상태를 표시한다. 실제 파일/로컬 개발 서버를 별도 sandboxed WebContentsView로 연결하는 host/core/preload, 프로젝트 감지, 실행/정지/로그, Console·Meta CLI `/preview` 명령과 같은 프로젝트·실행 선택 문맥을 추가했다. 승인된 static 코드 적용 후 페이지를 reload한다. 테마는 Depth AI 작업면에만 적용한다.
- 정적 HTML은 실제 파일/줄 위치, 동적 UI는 `data-depth-source`/`data-depth-line` 또는 `depth.runtime.json` selector binding으로 실제 인덱스와 연결한다. 모듈 선택은 별도 약한 overlay다. **임의 React/Flutter 위젯/Unity GameObject/네이티브 픽셀의 자동 코드 추적은 미구현**이다. 모르는 요소를 임의 모듈에 연결하지 않는다.
- Unity/Flutter/native/emulator 창 선택 스트리밍은 구현됐지만 네이티브 검수는 미완료다. Flutter SDK는 실제 명령에서 cache lockfile 쓰기 권한으로 막혔다. Unity MCP는 다른 `WorldVR` 프로젝트에 연결됨을 읽기 전용 확인했고 수정하지 않았다. Unity/MR 제품 복귀가 아니다. SDK 설치·모바일 배포·OS 입력 전달·전체 플랫폼 자동 프리뷰는 완료하지 않았다.
- 실제 서비스+DOM/HTTP 및 명시적 Electron·Meta fixture 검사가 통과했다. 기존 제품39개도 `artifacts/cohesion-contract-1793609260513/`에서 통과했다. 이전244개 투영 DOM 코드는 `desktop/declared-preview-dom-test.cjs`에 보존했다. 현재 `dom-test.cjs`는 runtime DOM을 실행한다. 과거 수치를 새 기능 성공에 합산하지 않는다. 최종 배포/검사 기록은 `artifacts/actual-runtime-package-20261102.json`이다.
- 직접 Electron PID **17724**는 `artifacts/runtime-native-20261102/stderr.log`의 **Mojo IPC 0x5**로 시작 단계에서 종료됐다. 이전 사용자 검수 PID22876은 더 이상 실행 중이 아니다. **새 실제 PNG 0장 / 새 실제 Meta 호출 0회**다. 보안 우회나 반복 실행 요청을 하지 않았다. `--runtime-smoke`/`--smoke`는 실제 웹 앱/테마 독립/소스/CLI 검수 코드이며 실행 통과가 아니다. 기존 style-study/live-smoke는 옛 투영 기준이라 새 런타임 증거로 쓰지 않는다.
- 사용자의 핵심 요구는 여전히 전체 완료가 아니다. 창 표시와 요소별 코드 연결, DOM 검사와 실제 렌더링, 구현과 실검증을 반드시 구분한다.


## 2026-11-02 최신 — 전체 디자인 긍정, 과도한 페이드만 완화

- 사용자가 실제 캡처의 전체 디자인에 긍정적으로 답하고 제작을 요청한 뒤, **페이드아웃이 너무 심하다**고 정정했다. 현재 실제 구현을 유지하면서 비관련 프리뷰 요소의 opacity를 **0.18→0.60**, grayscale을 **0.90→0.15**로 완화했다. 관련 요소 100%/주황색 강조와 흐려진 요소의 재선택은 유지한다. 새 강도 자체의 사용자 승인은 아직 받지 않았다.
- `docking.css`, 배포 UI에 반영했고 자원 버전은 **0.6.1-r5**다. `docking-smoke.cjs`도 비관련 요소의 55–65% 표시 범위를 검사하도록 갱신했다. 이 smoke 전체를 재실행했다는 뜻은 아니다.
- 기존 열린 PID 22876 검수 창으로 실제 `47-soft-total`–`51-soft-light` **5장**의 새 프레임·기하·해시 검사를 통과했다. 47/49/50의 라이트 계산·텍스트·다크를 직접 보았다. 배포 **46개** 해시 일치: `artifacts/native-review-20261102/soft-fade-verification.json`. `.env` 없음. 이번 단순 시각 조절에서 기존 DOM 244개/제품39개를 재실행한 것으로 쓰지 않는다.
- 최신 전달 PNG는 `artifacts/native-review-20261102/screenshots/07-softer-fade-light.png`, `08-softer-fade-dark.png`다. 원본 그대로 복사했다. 이전 01–06은 과한 페이드 수정 전 화면이므로 최신 강도의 증거로 쓰지 않는다. 검수 창은 라이트 CalculateTotal 선택 상태로 남겨 두었다.

## 2026-11-02 최신 — 실제 EXE 연결, 도킹·양방향 선택 PNG 검수와 수정

- 사용자가 검수 창을 켰다. [실제 EXE 검수 기록](docs/DESKTOP-NATIVE-DOCKING-20261102.md)을 읽는다. **PID 22876**, `artifacts/desktop/resources/artifacts/visual-review-2026-11-02T07-41-44-370Z/ready.json`에 연결했다. 이제 새 PNG가 없는 상태가 아니다. 창을 종료하지 않고 기본 라이트 작업면으로 복원했다. 살아 있다면 기존 제한 프로토콜로 계속 검수한다.
- 실제 캡처에서 상단 메뉴/검색 겹침, 어두운 Source 버튼 대비, 강조 버튼 배경, 모듈 제목 잘림, 시작 직후 과도한 페이드, 접힌 콘솔의 빈 여백, 작은 콘솔의 반쪽 로그를 발견해 수정했다. 자원 캐시가 옛 UI를 재사용해 `?v=0.6.1-r4`를 붙였다. 현재 UI **0.6.1**, 최종 CSS `docking.css`다.
- 최종 네이티브 **34개 캡처**(19개 바인딩 클릭+15개 선택/배치/테마/크기 화면)가 새 프레임·기하 검사를 통과했다. PNG/기록된 소스 13개 해시 일치. `artifacts/native-review-20261102/report.json`, plan-c.json. 최종 32–46의 15장 모두 직접 열어 봤고, 19개 바인딩 각각은 실제 포인터·hit test·선택 ID·자동 검사로 확인했다. 모든 66개 중간 PNG를 직접 봤다는 뜻이 아니다.
- 전달용 실제 스크린샷 6장은 `artifacts/native-review-20261102/screenshots/`, 갤러리는 같은 상위 폴더 index.html이다. 원본 PNG를 편집 없이 복사하고 바이트 해시를 확인했다. 최종 DOM+실제 서비스 **244개**(`artifacts/desktop-dom-1793605709658/`, exit 0), 순수 모델10/기존 캡처 fixture 통과. 최종 배포 **46개** 해시 일치(`artifacts/native-reviewed-package-20261102.json`), `.env` 없음.
- **이번 실제 포인터 검수는 프리뷰/모듈/메뉴 클릭이다. 탭 드래그·구분선 이동은 이번 열린 프로토콜에서 미실행**이며 프리셋/접기 상태/최대화 표시와 기존 DOM 검사로 확대하지 않는다. Route/Orbit 전체 맞춤 28%에서는 이름을 확대해 읽어야 한다. 새 Meta·변경 적용·GLB·임의 런타임 프리뷰 검증 또는 최종 디자인 승인을 주장하지 않는다. 사용자는 스크린샷만 요청했으므로 최종 전달은 실제 PNG 중심으로 한다.

## 2026-11-02 최신 — 에이전트 직접 검수·스크린샷만 요청, 재실행 차단 확인

- 사용자가 직접 검수하고 자신에게는 스크린샷만 보내라고 명시했다. 같은 실행 명령을 다시 사용자에게 요구하지 않았다. 제품 코드나 디자인을 추가로 변경한 턴이 아니다.
- 배포 EXE를 기본 보안 `--visual-review`로 직접 재실행한 PID 33784는 **Mojo IPC Access denied (0x5)**로 종료됐다. `artifacts/direct-screen-20261102-163902/stderr.log`, `attempt.json`에 기록했다. 새 증거 폴더 `visual-review-2026-11-02T07-39-02-654Z/`에 **ready 없음, PNG 0장**이다. 실행 중인 Depth 창과 새 검수 ready도 없다.
- 실제 화면 검수·스크린샷 전달은 미완료다. 구버전 캡처·생성 레퍼런스·DOM 결과를 새 실제 화면으로 제출하지 않는다. sandbox를 끄거나 다른 실행 경로로 권한 제한을 우회하지 않았다. 아래 0.6.0 구현·검사·패키지 결과는 그대로다.

## 2026-11-02 최신 — 도킹 시안 승인, 실제 앱 0.6.0과 양방향 프리뷰 선택

- 사용자가 도킹 시안을 **승인**하고 실제 구현 및 프리뷰↔모듈 양방향 선택·무관한 요소 페이드아웃을 요구했다. [구현·검수 기록](docs/DESKTOP-DOCKING-FOCUS-20261102.md)을 읽는다. 이제 별도 프로토타입만 있는 상태가 아니다. 실제 EXE UI에 일곱 도킹 패널, 이동/탭/분할/접기/최대화/닫기/복구/저장, 짧은 콘솔과 별도 실제 Meta CLI를 연결했다. 기존 DOM ID와 입력 초안·서비스 기능을 유지한다. 플로팅은 앱 안이며 OS 별도 창은 아니다.
- 선언된 프리뷰의 19개 요소와 바탕을 눌러 전체 구성을 연다. 모듈 선택은 정적 소스 의존성을 역추적해 관련 요소만 밝게 유지한다. 흐려진 요소도 클릭 가능하며 모든 관련 위치 버튼·소스 경로·Show all·키보드·모션 줄이기·연속 클릭의 마지막 선택을 처리한다. 닫힌 상대 패널을 다시 연다. 공통 View 소유 관계 때문에 모든 요소를 관련 있다고 표시하지 않는다. 임의 런타임/다중 화면 자동 발견이 추가된 것은 아니다.
- 최종 실제 서비스+DOM **243개**(`artifacts/desktop-dom-1793602669297/`), 제품 fixture **39개**(`artifacts/cohesion-contract-1793602750034/`), 순수 관계/도킹 **10개**, 드롭 **23개**, 검수 프로토콜 **20개** 및 캡처 fixture 통과. 숫자는 실제 Meta/픽셀 성공이 아니며 합산하지 않는다. 새 실제 Meta 호출은 없다.
- `artifacts/desktop/resources/app/` 배포 **46개** 해시 일치(`artifacts/docking-package-20261102.json`), `.env` 없음. 서비스·런타임은 변경하지 않았다. 새 `docking.css`가 최종 표현이며 Source/Why는 독립 Details 패널, 실제 원본 소스는 Source 패널이다. `dock-model.js`, `dock-engine.js`, `dock-workbench.js`, `preview-focus.js`가 새 구현이다.
- 직접 실행 PID 39572는 `artifacts/docking-native-20261102/stderr.log`의 Mojo IPC 0x5로 막혔다. ready/PNG가 없고 해당 시도 PID만 종료했다. 사용자에게 일반 cmd에서 배포 EXE **`--visual-review`** 실행 후 켜 두도록 비동기 요청했다. 응답/새 ready.json을 확인한다. 실제 새 화면 검수는 미완료이며 레퍼런스 승인과 구분한다. 보안 설정을 바꾸지 않는다.
- 검수 프로토콜에 고정 enum `workspace`/`panel`을 추가했다. 실제 포인터·화면 캡처는 위 문서 절차를 따른다. 새 smoke schema는 **desktop-docking-focus-1**이며 도킹/역방향 강조/흐려진 요소 클릭 검수 코드가 있지만 실제 실행 통과는 아니다. Unity/MR 폐기 및 미지원 임의 프리뷰/GLB 범위를 유지한다.

## 2026-11-02 최신 — 고정 4분할 폐기, 사용자 조작형 도킹 요구

- 사용자는 큰 콘솔과 동일한 크기의 고정 4분할을 명확히 거부했다. **Unity 에디터처럼 패널 이동·도킹·탭 묶기·크기 조절을 사용자가 할 수 있어야 한다.** 프리뷰·모듈에 주 공간을 주고 콘솔은 얇고 접을 수 있는 하단 도크로 시작한다. 이전 위치 설명은 기본 배치이며 영구 고정 규칙이 아니다. Console과 Meta CLI는 독립 패널이다. Unity/MR 제품으로 복귀하는 뜻이 아니다.
- [도킹 레퍼런스 3장](design/references/dockable-workspace-20261102/index.html)과 [별도 조작 예제](design/references/dockable-workspace-20261102/prototype.html)를 만들었다. 기본 배치/탭 이동 중/사용자 재배치를 built-in image_gen으로 생성·교정하고 3장 모두 직접 확인했다. 실제 프롬프트와 한계는 같은 폴더 prompts.json, DESIGN-NOTES.md다. 이미지의 쇼핑 폼은 생성 예시이며 실제 앱 캡처가 아니다.
- 조작 예제는 실제 탭 드래그·분할/탭 도킹·전체 작업영역 가장자리 도킹·구분선 크기 조절·작업영역 내 플로팅·접기·최대화·닫기/복구·배치 저장/복원·초안 유지가 있다. 모델/주입 DOM 입력 **18개** 통과(interaction-checks.json). OS 별도 창·다중 모니터 분리는 구현하지 않았다. Meta 호출·셸 실행·앱 서비스 연결은 없다.
- 기본 보안 Firefox 자동 캡처는 45초 안에 PNG를 만들지 못해 이번 probe 프로세스를 종료했다(artifacts/docking-reference-browser-20261102/attempt.json). 실제 브라우저 픽셀 검수나 배포 EXE 도킹 구현 완료로 기록하지 않는다. 앱 소스/EXE는 이번에 변경하지 않았고 사용자 최종 디자인 승인도 미확인이다.

## 2026-11-02 이전 — 네 영역 위치 시안 (고정 4분할 해석 폐기)

- 당시 사용자는 왼쪽 프리뷰·하단 콘솔/CLI, 오른쪽 모듈·탐색 영역을 설명했다. 이를 같은 크기의 네 영역 고정으로 해석한 것은 에이전트의 오류였으며 위 최신 사용자 조작형 도킹 요구가 우선한다.
- [교정한 라이트·다크 2장](design/references/four-pane-workspace-20261102/index.html)과 [배치·검토 기록](design/references/four-pane-workspace-20261102/DESIGN-NOTES.md)을 읽는다. built-in image_gen으로 새 기본 화면을 만들고 교정했다. 콘솔 출력과 CLI 대화·입력을 동시에 보이며 하이어라키에는 검색·최근 모듈을 넣었다. 생성 프롬프트는 같은 폴더 prompts.json이다.
- 두 최종 이미지를 직접 검토했고 임의 성공 로그·가짜 인덱스 수를 제거했다. 라이트의 작은 추가 화살촉과 다크의 Estimate 관계 누락 등은 기록했다. 실제 그래프 데이터·실행 결과로 간주하지 않는다. 새 이미지는 레이아웃 제안이며 사용자 최종 디자인 승인이 아니다.
- 이번에는 앱/EXE/Meta를 변경·실행 검증하지 않았다. 이전 12장의 기능 요구는 유지하되 그 배치는 최신 지정 배치보다 우선하지 않는다. Unity/MR 폐기, 미연결 3D 메시 및 기존 미검증 범위는 유지한다.

## 2026-11-02 최신 — 기존 시안 거부, 인지 연구 기반 새 레퍼런스 12장

- 사용자는 EXE 수정 대신 레퍼런스를 처음부터 다시 만들고, 논문을 참고해 시각적 차별성과 가시성을 높이라고 명시했다. [새 12장 갤러리](design/references/perception-atlas-20261102/index.html), [연구·적용 범위](design/references/perception-atlas-20261102/RESEARCH.md), [검토·오차 기록](design/references/perception-atlas-20261102/DESIGN-NOTES.md)을 읽는다. 이전 디자인을 승인으로 쓰지 않는다.
- built-in image_gen으로 새 기준 화면을 만들고 이번 기준만 후속 장면에 공유했다. 이전 레퍼런스 이미지는 입력으로 재사용하지 않았다. 큰 프리뷰, 열린 클래스 소속 경계, 함수 판·상태 레지스터·에셋 타일, 선택 강조를 쓰며 설명/수학/실파일 분리/두 프로젝트 통합/Meta 에셋/검토를 12장으로 다뤘다. 실제 프롬프트와 교정 내역은 prompts.json에 있다.
- 선택된 12장 모두 직접 보며 검토했고 소스명·타입·Queue 외부 API·다크 대비 등을 교정했다. 남은 예시명/일부 몸체/화살표/작은 오탈자/행렬 발췌의 한계는 문서에 남겼다. 래스터 관계를 서비스의 정확한 그래프 데이터로 사용하지 않는다.
- 최종 PNG 12개는 각각 원본 복사 해시가 일치하며 서로 중복되지 않는다. PNG 형식·크기·갤러리 내부 링크/이미지 설명 확인은 verification.json에 있다. 브라우저 렌더링·제품 기능 검증으로 합산하지 않는다.
- 4개 주요 연구 주제와 저자 해설·W3C 자료를 확인했으며 전문/초록/보조 자료의 읽은 범위를 구분했다. 사람 대상 탐색 속도·이해도 실험, 전체 픽셀 대비 인증, 최적 UI 입증은 하지 않았다. 새 이미지는 디자인 제안이며 사용자 최종 선호는 미확인이다.
- 이번에는 앱 소스·EXE·Meta 실행을 변경하거나 검증하지 않았다. 11번 에셋은 이미지 생성기의 삽화이며 실제 Meta 결과가 아니다. 3D 메시 미연결·Unity/MR 폐기와 기존 실제 시각 검수 미완료 상태는 유지한다. 사용자의 최신 요청은 이 새 시안 제작이며 이전 EXE 실행 요청을 다시 요구하지 않는다.

## 2026-11-02 최신 — 역할별 몸체·작업별 화면 재구성, 실제 검수 대기

- 사용자가 전체 시각 구성이 여전히 비슷하다고 거부했다. [최신 구현·검수 기록](docs/DESKTOP-VISUAL-IDENTITY-20261102.md)을 읽는다. **UI 0.5.0**에 실제 SVG 역할 경계, 그래프 아래 Source / Why this design 탭, 실제 줄 번호/안전한 구문 색, 지도 폴더/설명 읽기/관계 수학/파일 작업/에셋 무대/전후 코드/이력 구성을 반영했다. `visual-identity.css`가 최종 표현이다. 프리뷰 root·전체 ID·드롭·서비스 기능은 유지한다.
- 최종 DOM+실제 서비스 **228개**(`artifacts/desktop-dom-1793591836927/`), 제품 fixture **39개**(`artifacts/cohesion-contract-1793591580240/`), 검수 프로토콜 입력 17개와 기존 캡처 fixture 통과. 새 검사기가 레이아웃 없는 DOM을 거부한다. 배포 **37개** 해시 일치(`artifacts/identity-package-20261102.json`), `.env` 제외. 새 실제 Meta/픽셀 성공은 아니다.
- 직접 실행 PID 30732는 `artifacts/identity-native-20261102/stderr.log`의 Mojo IPC 0x5로 종료됐다. 사용자에게 일반 cmd에서 배포 EXE의 **`--visual-review`** 실행 후 켜 두도록 비동기로 요청했으며 응답/ready.json은 아직 없다. 기본 보안 설정을 유지했다.
- 새 명시적 검수 모드는 예제 복사본을 열고 `artifacts/desktop/resources/artifacts/visual-review-<시각>/ready.json` 및 초기 PNG를 만든다. 문서의 제한된 `request.json`으로 실제 포인터/화면·테마·배치/캡처/UI reload를 이어간다. 임의 JS·셸·Meta 호출·소스 변경 명령은 없다. 정상 앱에는 수신기가 없다. 메인 변경은 재시작 필요, UI 변경은 reload 가능하다. `--smoke`도 `desktop-identity-1`로 갱신했으나 실제 실행 성공이 아니다.
- **새 디자인 시각 검수/사용자 승인은 미완료**다. ready/PNG가 생기면 모든 화면·세 배치·테마·작은 창·125%에서 실측과 PNG 검토를 수행해 수정한다. 이전 27장을 새 디자인 증거로 쓰지 않는다. Unity/MR 폐기 및 미지원 GLB/임의 프로젝트 프리뷰 범위를 유지한다.

## 2026-11-02 최신 — 디자인 거부, 프리뷰·모듈 작업면 분리

- 사용자가 두 영역의 구분 부족과 디자인을 명확히 거부했다. [영역 재설계 기록](docs/DESKTOP-SURFACES-20261102.md)을 읽는다. 이전 디자인을 승인으로 쓰지 않는다. 새 `surfaces.css`와 HTML/`workspace.js`에 별도 Preview 프레임/어두운 Module workspace/전용 헤더와 도구/선택 root 표시를 넣었다. 실제 구분선으로 38–58% 조절·저장·키보드·복원, 두 면의 독립 스크롤과 좁은 창 세로 배치를 구현했다. 실제 바인딩·전체 ID·소스/분리/통합/Meta/드롭은 유지한다.
- 이전 드롭 패키지의 새 외부 실행 `desktop-smoke-2026-11-02T02-51-38-462Z/`는 **passed / 140개 / PNG 27장**, 실행 해시 11개 일치다. 00·18·19-guide·22·23·24의 6장을 직접 봤다. 모달 표식과 Chromium CDP 드롭 흐름 성공이며 새 디자인 검증은 아니다. 드롭 후 이전 스크롤 때문에 그래프가 위로 사라지는 문제를 발견해 성공한 프로젝트 열기에서 스크롤 초기화/소스 오버레이 닫기를 추가했다.
- 최종 DOM+실제 서비스 **206개**(`artifacts/desktop-dom-1793589471167/`), 제품 fixture **39개**(`artifacts/cohesion-contract-1793589546243/`), 캡처 주입식 6개/모달 DOM 3개/새 경계·색 fixture 5개 통과. UI·검수 코드 **34개** 일치(`artifacts/surface-package-20261102.json`). 새 Meta 호출은 없다.
- 새 실제 화면은 미검증이다. 직접 실행 PID 32948은 `artifacts/surface-native-20261102/stderr.log`의 Mojo IPC 0x5. Firefox 실제 서비스 실행은 spawn EPERM, 읽기 전용 DOM 스냅샷도 PNG가 없어 probe PID 37156만 정리했다. 보안 설정을 바꾸지 않았다. 스냅샷 HTML은 실제 EXE 캡처가 아니다.
- 사용자에게 일반 cmd `"C:\Users\dlfgu\Documents\GitHub\MetaAIHack\artifacts\desktop\Depth AI.exe" --smoke`를 요청했다. **schema: desktop-surfaces-1**의 새 결과를 확인한다. 검수기는 실제 포인터 구분선/다크/125% 확대와 추가 3장을 구현했으며 시각 실패를 모아 최종 failed로 기록한다. 아직 실행 통과·사용자 디자인 승인을 주장하지 않는다. Unity/MR 폐기·키 비노출·미지원 기능의 기존 한계는 유지한다.

## 2026-11-02 최신 — 프로젝트 드래그 앤 드롭, 사용자 실행 18장 검토

- 사용자가 EXE 실행을 알리고 프로젝트 드롭을 요구했다. [드롭 구현·실제 화면 검토](docs/DESKTOP-PROJECT-DROP-20261102.md)를 읽는다. 기본 앱과 비교 화면에 폴더/프로젝트 파일 드롭을 연결했다. `webUtils.getPathForFile` → 신뢰 검사 IPC → 실제 경로 검증 → 기존 `/import`이며 여러 입력/압축/일반 파일/작업 중 드롭은 거부하고 기존 프로젝트를 보존한다. 원본 복사/실행이나 Meta 호출을 자동 시작하지 않는다.
- 사용자 실행 `desktop-smoke-2026-11-02T02-29-51-421Z/`는 **failed / 선행 검사 89개 / PNG 18장 / errors 0**이다. 18장 모두 직접 검토했다. 총액의 첫 화면 아래 밀림, 제목/설명 배치, 긴 이름 줄바꿈, 흰색으로 남는 다크 프리뷰와 통합 빈 상태의 대비를 수정했다. 실패 지점은 18-light-rationale의 표식 검사다. 모달이 body 표식을 덮는 문제를 수정했지만 새 실제 픽셀 검증은 아직 없다.
- 드롭 경로·preload fixture·DOM **23개**(`artifacts/project-drop-1793587333627/`), 기본 DOM+실제 서비스 **198개**(`artifacts/desktop-dom-1793587165990/`), 제품 fixture **39개**(`artifacts/cohesion-contract-1793587220920/`), 비교 **172개**, 프리뷰 **364개**, 모달 표식 DOM **3개**와 기존 캡처 주입식 **6개** 통과. 실제 OS 드롭/새 Meta/픽셀 성공으로 합산하지 않는다.
- 배포 코드/UI **32개** 해시 일치(`artifacts/project-drop-package-20261102.json`). 새 `--smoke`는 Chromium CDP 파일 드롭의 실제 preload/IPC/import 경로, 거부/복귀와 캡처 3장을 추가하며 실행 소스 해시를 남긴다. 검수기 구현이지 실행 통과가 아니다. 직접 실행 PID 28188은 `artifacts/project-drop-native-20261102/stderr.log`의 Mojo IPC 0x5로 종료됐다.
- 사용자에게 일반 cmd의 `"C:\Users\dlfgu\Documents\GitHub\MetaAIHack\artifacts\desktop\Depth AI.exe" --smoke`를 요청했다. 새 응답과 `schema: desktop-project-drop-1` 결과를 확인한다. 이전 18장은 새 드롭/CSS 수정 이전 화면이다. 서비스·런타임·키를 변경하지 않았으며 Unity/MR 폐기, 미지원 GLB/임의 프로젝트 자동 프리뷰/전체 100% 미완료 상태를 유지한다.

## 2026-11-02 최신 — 프리뷰 중심 공통 작업면을 기본 EXE에 반영

- 사용자 “작업해”로 최근 14장 레퍼런스 기준 구현을 재개했다. [구현·검수 기록](docs/DESKTOP-REFERENCE-IMPLEMENTATION-20261102.md)을 읽는다. `workspace.js/css`로 실제 기능 메뉴를 상단에 모으고 큰 프리뷰/전체 구성/즉시 소스/기존 검사창을 연결했다. Field Guide·Route Atlas·Orbit과 light/dark, 확대, 전체 ID와 root 유지, 중복선의 모든 근거 열람을 연결했다.
- 최종 DOM+실제 서비스 **187개**(`artifacts/desktop-dom-1793586016230/`), 기존 스타일/기하 **172개**(`artifacts/style-study-checks-1793586016849/`), 캡처 주입식 **6개** 통과. 제품 흐름 fixture **39개**도 최종 통과(`artifacts/cohesion-contract-1793586207561/`, `artifacts/reference-product-final-20261102.log`). 실제 Meta나 픽셀 검사로 합산하지 않는다. 메뉴 선택자 충돌과 Orbit 겹침을 발견해 수정한 후 재검사했다.
- 배포 앱 UI/캡처 코드 **20개** 일치(`artifacts/reference-package-20261102.json`). 서비스/런타임은 바꾸지 않았고 키를 출력·번들링하지 않았다. 최신 직접 실행도 `artifacts/reference-native-final-20261102/stderr.log`의 Mojo IPC 0x5로 종료됐다. 새 실제 PNG가 없다.
- 사용자에게 일반 cmd의 `"C:\Users\dlfgu\Documents\GitHub\MetaAIHack\artifacts\desktop\Depth AI.exe" --smoke` 실행을 요청했다. 새 `desktop-smoke-<시각>`의 PNG와 보고서를 직접 확인한다. 세 보기/소스/다크/실제 글자·아이콘 경계 검사가 추가됐지만 실행 통과가 아니다. 14장 전체 기능 완성, 최종 디자인 승인, 실제 GLB/임의 프로젝트 의미 보존을 주장하지 않는다.
- 디스크가 확보되어 레퍼런스 PNG 14장 ZIP을 저장하고 내부 바이트 해시를 확인했다. 생성 이미지와 실제 캡처를 구분한다. Unity/MR 폐기 방향은 유지한다.

## 2026-11-01 최신 — 전체 요구를 담은 프리뷰 중심 레퍼런스 14장

- 사용자가 실제 화면 검수 요청 이후 모든 요구를 담은 레퍼런스 이미지를 요청하고 **10장 이상**으로 지정했다. [새 레퍼런스 14장](design/references/preview-product-20261101/index.html)을 제작했다. 큰 프리뷰/총액·이미지·텍스트 클릭/전체 모듈/내부 구성/수준별 FIFO 설명/AI용 계약과 코멘트/가중 그래프/실제 파일 분리/프로젝트 통합/Meta 2D/3D 목표 설계/검토·이력/다크 Orbit이다.
- built-in image_gen을 사용했고 이전 레퍼런스 이미지를 입력으로 재사용하지 않았다. 새 공통 기준을 후속 장면의 입력으로 공유했다. 선택된 PNG 14장, 실제 프롬프트·교정 기록과 파일 검증을 같은 폴더에 저장했다. 생성 도중 C: 여유 0으로 기본 저장 일부가 실패했고 반환 PNG 데이터를 그대로 복구했다. 해시가 일치하는 이번 작업의 중복 사본만 정리했으며 기존 소스/키/과거 검수 자료는 지우지 않았다.
- 14장을 직접 검토했으나 작은 소유 타입 라벨과 선의 남은 생성 오차를 [설계 기록](design/references/preview-product-20261101/DESIGN-NOTES.md)에 구체적으로 남겼다. 이미지의 화살표를 그대로 실제 그래프 데이터로 쓰지 않는다. 3D 메시 생성은 미연결 목표 화면이며 현재 Meta GLB 생성 성공으로 쓰지 않는다.
- 이번 작업은 이미지와 디자인 기록이다. 실제 EXE 캡처/새 Meta 호출/전체 기능 완료/시각 최종 승인/애니메이션 구현의 증거가 아니다. Unity·MR 폐기와 Windows EXE 방향을 유지한다. 아래 실제 시각 검수 차단은 별도 미완료 작업이다.

## 2026-11-01 최신 — 사용자 시각 검수 요구, 실제 실행은 IPC 차단

- 사용자가 시각 검수까지 끝내라고 요청했다. [시각 검수 재시도 기록](docs/DESKTOP-STYLE-STUDY-20261101.md)의 최신 절을 읽는다. 새 비교판의 실제 PNG/시각 검수 성공은 여전히 없다.
- PowerShell Start-Process는 배포 EXE PID 53776을 시작했지만 `artifacts/visual-native-20261101-195535/stderr.log`의 Mojo IPC Access denied (0x5)로 종료됐다. 기본 보안 설정 Firefox도 PNG를 만들지 못했으며 해당 시도 PID 59120만 종료했다(`artifacts/visual-browser-20261101-195700/`). 보안 설정을 우회하지 않았다.
- 사용자에게 일반 cmd에서 `"C:\Users\dlfgu\Documents\GitHub\MetaAIHack\artifacts\desktop\Depth AI.exe" --style-study-smoke`를 실행한 상태를 비동기로 요청했다. 답변/새 `artifacts/desktop/resources/artifacts/style-study-native-*` 결과를 확인해야 한다. 캡처 생성만 필요한 요청이며 실제 PNG 검토와 수정은 에이전트가 수행한다.
- 배포된 검수기의 `schema: preview-visual-2`는 정상 진행 시 35장, 스크롤별 캔버스/소스, 19개 실제 좌표 hit test와 Electron 입력, 새 프레임/PNG 해시/실행 소스 해시, 실패를 포함한 갤러리를 남긴다. 레이아웃 실패를 모아 전체 수집 후 failed로 보고한다. 이 절차의 실제 실행 통과로 쓰지 않는다. 아래 16장 계획은 이전 버전이다.

## 2026-11-01 최신 — 큰 프리뷰와 클릭 요소의 실제 소스·전체 구성 복구

- 사용자는 큰 프리뷰에서 누른 요소가 어떤 코드로 구성되는지가 핵심이라고 지적했다. 이전 스타일 비교판은 작은 이미지 두 장만 표시하고 기존 프리뷰 바인딩을 연결하지 않았다. [프리뷰 중심 수정 기록](docs/DESKTOP-STYLE-STUDY-20261101.md)의 최신 절을 읽는다.
- `style-study/preview.js`와 화면에 큰 프리뷰(기본 폭 44%, 확대 56%), 19개 선언된 텍스트/값/이미지/버튼 선택, 실제 선언 위치·직접 바인딩 소스의 즉시 발췌, 전체 `/composition` 노드·관계를 연결했다. 멤버/스타일 선택은 프리뷰 root를 유지한다. EXE는 현재 프로젝트 서비스를 직접 조회하고 HTML 단독 실행은 명시적 예제 스냅샷이다. 임의 런타임 UI 자동 발견으로 확대하지 않는다.
- 일반 앱도 Composition으로 시작하며 프리뷰를 확대했다. Project preview의 Large preview 링크로 새 화면에 진입하고 Full workspace로 복귀한다. 양방향 이동 시 현재 프로젝트를 유지한다. 기존 Meta/분리/통합/에셋/검토 기능은 보존한다. 새 Meta 호출은 없다.
- 실제 서비스+스냅샷 DOM **364개**(`artifacts/preview-flow-1793529777010/`), 기존 스타일 **172개**(`artifacts/style-study-checks-1793529776110/`), 일반 DOM **104개**(`artifacts/desktop-dom-1793529571561/`), 제품 fixture **39개**(`artifacts/cohesion-contract-1793529726969/`) 통과. 서로 겹치는 검사이며 픽셀 검사나 실제 Meta 성공으로 합산하지 않는다. 실패/빠른 클릭/어댑터 없음/빈 프로젝트도 검사했다.
- EXE 배포 UI/JS 13개 일치 기록은 `artifacts/preview-package-check.json`. `.env` 제외. 직접 실행은 `artifacts/style-study-launch-1793529808234/`의 spawn EPERM으로 시작되지 않았으며 새 화면 PNG는 없다. `--style-study-smoke`가 19개 실제 클릭과 총 16장, 프리뷰 폭/클릭 경계/글자 겹침을 검사하도록 확장됐다. 새 외부 실행 결과를 확인해야 하며 시각적 완료/사용자 승인을 주장하지 않는다.

## 2026-11-01 최신 — 비교판의 글자·아이콘·UI 겹침 수정

- 사용자가 2·4·5번 비교판은 나쁘지 않지만 글자/아이콘/UI가 겹친다고 지적했다. 이전 151개 검사는 몸체 경계만 검사해 내부 텍스트 배치를 놓쳤다. 새 실제 캡처 없이 완성/시각적 승인을 주장하지 않는다.
- `style-study/study.js`의 고정 SVG 텍스트 좌표를 모듈 내부 HTML 흐름 배치로 교체했다. 아이콘/제목/역할·값/요약은 별도 공간을 사용한다. 긴 식별자는 CamelCase 줄바꿈 지점을 넣되 원문과 ID를 유지한다. 마름모/타원 안의 텍스트 영역을 도형 내부로 제한했다. 겹치는 선 위의 반복 라벨을 없애고 hover/키보드/선택 시 별도 근거 영역에 표시한다. 좁은 창의 헤더·검색·도구 줄바꿈과 1000px 이하의 세로 패널 배치를 추가했다.
- 최신 DOM·기하 검사 **172개**(`artifacts/style-study-checks-1793528372893/`)와 렌더링 검사기의 사각형 fixture 6개 통과. 실제 픽셀 검사가 아니다. 새 `layout-audit.js`는 브라우저에서 글자/아이콘/값/컨트롤 겹침·잘림을 실측하며, 레이아웃 없는 DOM에서는 통과시키지 않는다.
- 수정 UI와 `style-study-smoke.cjs`를 배포 실행 폴더에 반영했다. native 검사는 큰 창의 세 보기/반대 테마, 작은 창 세 보기, 125% 확대 세 보기의 **12장**으로 확장했다. 캡처를 먼저 저장하고 겹침 실패 이유도 보고서에 남긴다. 도구의 최신 직접 실행도 spawn EPERM으로 거부됐다. 사용자에게 동일한 `--style-study-smoke`를 요청했으며 새 시각 폴더 결과를 확인해야 한다. 브라우저 비교판은 Ctrl+R로 갱신할 수 있다.

## 2026-11-01 최신 — 2·4·5번 선호, 실제 코드의 비교 화면 제작

- 사용자가 2·4·5번을 마음에 들어 하며 제대로 구현할 수 있는지 물었다. [실제 스타일 비교 구현](docs/DESKTOP-STYLE-STUDY-20261101.md)을 읽는다. 세 보기 전환/하나의 결합 화면 선호를 질문했고 아직 답이 없다. 기존 제품 기본 화면을 교체하지 않고 `desktop/ui/style-study/`에 세 보기 전환을 우선 구현했다.
- 실제 Checkout 인덱스 스냅샷의 구성 13개+외부 소비자 1개, 소스 관계 발생 19개를 같은 ID로 사용한다. 종이 모듈/노선형/방사형의 SVG·DOM, 선택·소스·근거·수준·테마·확대/이동·레퍼런스 비교가 있다. 새 Meta 호출이나 임의 프로젝트 연동, 본제품 전체 화면 전환을 완료한 것이 아니다.
- DOM·기하·소스 ID/인용 검사 151개 통과(`artifacts/style-study-checks-1793522615906/`). 실제 픽셀 검사가 아니다. 검수 실행은 EXE `--style-study`, 캡처 검사는 `--style-study-smoke`이며 새 `style-study-native-<시각>/`를 확인한다. 도구 실행은 spawn EPERM으로 시작 자체가 거부돼 새 실제 캡처가 없다. 기본 sandbox·권한을 바꾸지 않았다.
- 별개로 이전 제품 UI의 새 외부 실행 `desktop-smoke-2026-11-01T08-14-28-679Z/report.json`을 발견했다. passed / 88개 / PNG 18장 / errors 0이다. overview 1장만 이번에 직접 봤고 여전히 작은 카드 위주인 것을 확인했다. 나머지 17장 직접 검토, 새 시안 유사도, Meta 성공, 사용자 최종 디자인 승인으로 확대하지 않는다.

## 2026-11-01 최신 — 단순한 화면 거부, 서로 다른 시각 스타일 6종

- 사용자가 기존 화면이 단순하고 흔하다며 다양한 레퍼런스 스타일을 요청했다. [스타일 탐색 갤러리](design/references/style-exploration-20261101/index.html)에 패치보드, 펼쳐진 설계 도감, 입체 조립도, 구조 노선도, 방사형 지도, 리본 연결의 6장을 제작했다. 같은 Checkout 선택 사례로 조형·연결 문법을 비교한다. 새 구현 지시나 최종 선택·승인으로 확대하지 않는다.
- built-in image_gen으로 생성했고 이전 레퍼런스 이미지는 입력으로 쓰지 않았다. 생성 초안을 입력으로 한 내용·연결 교정, 원본 PNG, 프롬프트와 검토 범위를 같은 폴더에 보관했다. 실제 파일명/할인 식/소스 발췌를 대조했다. 래스터 연결을 정확한 API 계약으로 쓰지 않으며 남은 1·3번 배선/참조 방향 오류는 갤러리와 manifest.json에 명시했다. 4·5·6번 및 실제 소스의 방향을 따른다.
- 현재 작업은 디자인 산출물이다. 실제 EXE 화면·Meta API 결과·구현 완료가 아니며, Unity/MR 폐기 방향을 유지한다. 3번은 일반 데스크톱 안의 2.5D 표현 제안이다. 아래 smoke 검사 코드 오류 수정 후 외부 재실행 대기는 별개로 남아 있다.

## 2026-11-01 최신 — 새 UI 검수의 검사 코드 오류 수정, 재실행 대기

- 사용자가 “시작했어”라고 답했고 `artifacts/desktop/resources/artifacts/desktop-smoke-2026-11-01T05-38-44-873Z/report.json`을 확인했다. **failed / 4개 선행 검사 / PNG 0장**이다. 아이콘 경계 검사의 `every(...)()`가 boolean을 호출해 중단됐다. 앱 기능 실패나 새 UI 화면 성공으로 기록하지 않는다.
- `desktop/smoke.cjs`의 실제 주입식을 함수 호출로 수정했다. `desktop/smoke-test.cjs`는 그 주입 문자열 자체를 실행해 정상/빈 목록/경계 밖/크기 0의 6개 회귀 사례를 통과했다. 기본 npm test에도 포함했다. 실패 캡처는 실패했던 아이콘/이미지 검사를 반복하지 않는다. 새 프레임 표식은 유지한다.
- 수정한 smoke.cjs를 `artifacts/desktop/resources/app/smoke.cjs`에 반영하고 파일 해시 일치를 확인했다. UI/서비스 재구현이나 새 픽셀 검증 결과는 아니다. 도구의 Mojo IPC 차단을 우회하지 않고 사용자에게 동일한 cmd `"C:\Users\dlfgu\Documents\GitHub\MetaAIHack\artifacts\desktop\Depth AI.exe" --smoke` 재시작을 요청했다. 이후 생성되는 새 시각 폴더의 18장과 report 상태를 직접 확인해야 한다.

## 2026-11-01 최신 — 영어 기본, 테마·모듈 의미·연결 가독성 재구현

- 사용자가 기존 실제 UI의 아이콘 잘림/중복 연결점/단조로운 몸체/영어·테마 누락/설계 근거 부족을 지적했다. [가독성 개선 기록](docs/DESKTOP-READABILITY-20261101.md)을 먼저 읽는다. 이전 화면을 승인으로 기록하지 않는다.
- 실제 UI를 영어 기본으로 바꾸고 저장되는 light/dark 전환을 넣었다. 새 Meta 문서·변경 이유 지시도 영어다. 기존 소스/저장된 설명 원문은 자동 번역하지 않는다. `visual-model.js`와 `readability.css`가 역할별 몸체, 실제 소비자/호출 수 기반 Key connections, 모듈당 2개 포트, Selected/All links, 정적 의존 방향 애니메이션과 모션 줄이기를 담당한다. 전체 모듈·관계 ID는 유지한다.
- 아이콘 viewBox/기어 도형과 몸체 실제 크기-배치 불일치를 수정했다. 전체 설계 근거를 넓은 읽기 창과 모듈 내부에 표시하고 소스 인용/원본 이동/수준별 설명을 연결했다. 설명이 없으면 소스 구조와 Meta 미생성을 구분한다. 비즈니스 중요도나 런타임 실행 흐름으로 과장하지 않는다.
- DOM 104개(`artifacts/desktop-dom-1793511296400/`), 제품 fixture 39개(`artifacts/cohesion-contract-1793511107041/`), Meta fixture 92개(`artifacts/readable-meta-tests.log`) 통과. 마지막 ID 가드 후 제품 결과는 `artifacts/readable-product-final.log`를 확인한다. 새 서비스 `artifacts/service-readable-ui/`와 UI를 EXE에 패키징했다. 전체 서비스 224개는 앞선 턴의 결과이며 이번에 재실행한 것으로 쓰지 않는다.
- 사용자에게 cmd의 `"C:\Users\dlfgu\Documents\GitHub\MetaAIHack\artifacts\desktop\Depth AI.exe" --smoke`를 요청했다. 새 검증기는 라이트/다크/설계 설명 등 18장과 아이콘 경계·실제 테마 색 검사를 포함한다. 새 시각 폴더를 확인해 직접 검수한다. 아직 새 픽셀/최종 디자인 승인은 없다. 기존 IPC 차단을 우회하지 않고 Unity/MR을 되살리지 않는다. 이전 실제 Meta 연결 성공/설명 length 실패와 분리·통합·PNG 네이티브 미실행 상태를 유지한다.

## 2026-11-01 14:19 — 두 번째 실제 EXE, Meta 설명 출력 한도 실패 수정

- 사용자가 재실행했고 `artifacts/desktop/resources/artifacts/desktop-smoke-2026-11-01T05-13-01-399Z/`를 직접 확인했다. 기본 13장 모두 새 프레임 검사를 통과했고 픽셀도 직접 검토했다. 제목/13개 구성·17개 관계 복원, 선택 유지, 이미지 사용처 15개·20개 관계, 소스/검토, 작은 창, 집중 보기가 실제로 표시된다. 시각적 최종 승인이나 전체 기능 완료가 아니다.
- **EXE 기본 .NET의 실제 Meta 모델 목록 + 추론 성공.** 이후 JobQueue 설명이 `finish_reason: length`로 끊겨 `live-report.json`은 module-explanation/failed다. 전체 report의 57개는 실패 캡처 검사 1개도 포함하며 전체 통과가 아니다. 실제 분리/통합/이미지 생성은 이번 네이티브 실행에서 미실행. failure.png의 FIFO 그림은 소스 기반 개념 예시이며 Meta 설명 성공 증거가 아니다.
- 잘린 응답은 해석/저장하지 않는다. `MetaIncompleteOutputException`으로 구분하고 모듈 분석의 기존 최대 1회 교정/총 호출 예산 안에서만 간결한 완전 응답을 다시 요청한다. 근거·ID 검증을 유지하며 반복 truncation/예산 1회/content_filter는 성공으로 바꾸지 않는다. 교육 프롬프트의 개념 중복을 줄였다.
- 에셋 미리보기의 실제 이미지 잘림과 검토 코드 대비도 수정했다. 다음 native 검사는 이미지 decode 및 실제 경계 안 배치를 확인한다. **이 추가 수정은 아직 새 실제 화면 확인 전**이다. 서비스 224개, Meta fixture 92개(`artifacts/native-length-meta-tests.log`), DOM 94개(`artifacts/desktop-dom-1793510073574/`) 통과. 새 DLL/UI를 EXE에 패키징했으며 파일 일치/키 제외 기록은 `artifacts/native-length-verification.json`이다.
- 새 EXE를 도구에서 직접 시작했으나 `artifacts/native-length-agent-20261101-141844/stderr.log`에 Mojo IPC 0x5 재현. 도구 환경 .NET preflight도 여전히 SecureConnectionError이며 사용자 외부 실행 성공과 구분한다. 사용자에게 같은 cmd `"C:\Users\dlfgu\Documents\GitHub\MetaAIHack\artifacts\desktop\Depth AI.exe" --smoke-live`로 새 실행을 요청했다. 새 시각 폴더의 결과를 확인해 계속한다. 이전 실패/캡처를 덮어쓰지 않는다.

## 2026-11-01 최신 — 사용자 EXE 실행 확인, 실제 캡처 문제 수정

- 사용자가 cmd 실행 후 `실행됨`이라고 답했다. [실제 화면 검토](docs/DESKTOP-NATIVE-REVIEW-20261101.md)를 먼저 읽는다. `artifacts/desktop/resources/artifacts/desktop-smoke/`에 실제 PNG 13장/내부 검사 40개가 있다. 아래 과거의 PNG 0장/외부 실행 미응답은 최신 상태가 아니다.
- 캡처를 직접 보고 에셋·기능 구성 이미지가 통합 화면과 파일 해시까지 같음을 확인했다. 이후 선택/소스/검토/집중 화면도 이전 프레임이다. 이 파일들을 해당 기능의 화면 성공으로 쓰지 않는다. 관계→구성의 제목/개수 미갱신, 숨겨진 그래프의 확대율 오염, 코드 묶음의 에셋 이름, 축소 글씨를 수정했다.
- DOM 94개(`artifacts/desktop-dom-1793503113459/`), 제품 흐름 fixture 37개(`artifacts/cohesion-contract-1793503113482/`) 통과. 수정본을 다시 패키징했다. 새 프레임 색상 표식 검사와 별도 시각별 출력, `--smoke-live`의 실제 기본 .NET Meta 설명/분리/통합/승인/undo/PNG 검사를 추가했다. 실제 새 실행 통과로 기록하지 않는다.
- 사용자에게 cmd에서 `"C:\Users\dlfgu\Documents\GitHub\MetaAIHack\artifacts\desktop\Depth AI.exe" --smoke-live` 재실행을 요청했다. 현재 새 결과는 아직 없다. `artifacts/desktop/resources/artifacts/desktop-smoke-<시각>/report.json`, `live-report.json`, PNG를 직접 확인해 이어간다. PowerShell의 `&`를 cmd 명령에 넣지 않는다. 현재 도구 환경의 Mojo IPC 접근 거부를 우회하지 않는다.
- 첫 캡처와 Meta 키를 보존하며 키를 출력/번들링하지 않는다. 실제 앱 이미지와 생성 에셋을 구분해 사용자에게 보여 준다. Unity/MR 폐기 방향을 유지하고 전체 기능 100%/GLB/임의 프로젝트 동작 보존/사용자 시각적 승인 완료를 주장하지 않는다.

## 2026-11-01 최신 — 실제 Meta 재검증, 앱 화면은 여전히 미완료

- 사용자는 **이미지를 보여 주고 실제로 확인하기 전에는 완료라고 말하지 말라**고 요청했다. [실제 기능·화면 차단 기록](docs/DESKTOP-VERIFICATION-20261101.md)을 먼저 읽는다. 현재 전체 제품은 미완료이며 Unity/MR 폐기와 Electron EXE 방향을 유지한다.
- 실제 Meta 첫 실행에서 설명 검증 실패를 발견했다. 같은 모듈의 ID/인용 규칙과 오류 구분을 강화하고, 정해진 호출 예산 안에서 한 번만 교정한다. 틀린 근거를 임의로 고치거나 검증을 느슨하게 하지 않는다. 실제 FIFO 설명의 언어 혼합도 발견해 프롬프트를 보완했다. 키 설정만으로 UI 연결 표시가 초록색이던 문제를 수정했다.
- 공식 Meta API·인증서 검증 Python HTTPS로 **3회/87개 흐름 검사, 768개 독립 동작 사례, PNG 6개** 성공. `artifacts/acceptance-live-20261101-023956-04f2093029644d8697c95de14fc56771/`. 별도 최종 프롬프트의 Queue 설명과 초보자/숙련자 실제 도구 대화도 성공(`artifacts/agent-live-20261101-024646/`). 원문과 이미지 6장을 직접 읽었다. 새 EXE의 기본 .NET 전송 성공이나 모든 모델 응답 품질 보장이 아니다.
- 서비스 217개, 최종 Meta 대상 fixture 85개, DOM 90개, 제품 흐름 fixture 37개 통과. 새 패키지의 앱/UI/서비스 14개 일치, `.env` 제외. 각 범위와 기록은 위 문서에 있다. 서로 겹치는 검사 수를 기능 수나 픽셀 검사 수로 합산하지 않는다.
- **새 EXE 화면 PNG 0장**이다. 최신 `artifacts/desktop-native-screen-review/`도 Mojo IPC Access denied (0x5). Chrome/Firefox도 캡처 실패. 격리를 끄지 않았다. 기본 .NET Meta 호출은 SecureConnectionError가 유지된다. 13장 캡처/HTML 갤러리를 만들도록 네이티브 검증기를 갱신했지만 실행 통과가 아니다.
- 사용자에게 일반 PowerShell의 `& ".\artifacts\desktop\Depth AI.exe" --smoke`를 요청했고 응답/캡처가 아직 없다. 기본 결과는 `artifacts/desktop/resources/artifacts/desktop-smoke/`. 다음 작업은 이 실제 캡처와 기본 EXE Meta 흐름을 검수하는 것이다. `artifacts/screen-review-20261101/index.html`의 이미지는 실제 Meta 생성 PNG이며 **앱 UI 화면이 아니다**. GLB 메시/임의 언어 의미적 재구성/자동 런타임 UI 발견/전체 100% 완료를 주장하지 않는다.

## 2026-11-01 최신 — 공통 시안의 실제 데스크톱 구현 0.4.0

- 사용자가 “일단 저대로 구현해봐”라고 요청해 공통 시안 8장의 흐름을 실제 Electron UI로 옮겼다. [구현·검증 기록](docs/DESKTOP-COHESION-20261101.md)을 먼저 읽는다. 이번 요청은 구현 진행 허가이며 최종 시각적 승인은 아니다.
- `product.js`/`product.css`/`icons.js`와 기존 구성판을 연결했다. 공통 외곽·모듈 재질/역할색, 지도, 기능 구성, 모듈 내부/Queue 개념 예시, 실제 수학/영향, 분리/통합, PNG 제작·승인 가져오기, 전후 파일/diff/검증/이력이 있다. `service-client.cjs`가 제한된 API와 이미지 전송을 공유한다. 분석 후 선택 대상 초기화도 수정했다.
- 최신 실제 서비스 + 렌더러 DOM **86개**, 추가 제품 흐름 **37개** 통과. 추가 검사는 명시적 Meta fixture와 실제 복사본 빌드·실행·파일 적용이다. 합계 123개를 실제 모델/픽셀 검사로 확대하지 않는다. 기록은 `artifacts/desktop-dom-1793499979083/`, `artifacts/cohesion-contract-1793499989445/`다.
- 새 `artifacts/desktop/Depth AI.exe`를 패키징했고 13개 배포 코드/UI 파일 일치와 TaskRunner 예제 포함, `.env` 제외를 확인했다. 최신 EXE도 Mojo IPC Access denied (0x5)로 종료돼 **실제 화면·레퍼런스 일치 검증은 미완료**다. Firefox 캡처도 실패했으며 해당 probe 프로세스만 정리했다. sandbox 설정은 낮추지 않았다.
- 실제 Meta preflight는 `model-list`의 `SecureConnectionError`다. 새 UI의 실제 모델 분리/통합/생성을 성공으로 보고하지 않는다. 일반 Windows에서 native 검사와 실제 Meta 검수가 남아 있다. 과거 214개 서비스 회귀를 이번 턴 재실행으로 기록하지 않는다.

## 2026-11-01 최신 — 여덟 시안의 공통 디자인 기준

- 사용자는 직전 시안은 좋지만 이미지끼리 어울리지 않는다고 지적했다. 이는 디자인 최종 승인이 아니다. [시각 통일 수정안 8장](design/references/product-cohesion-20261101/index.html)과 [전후 비교](design/references/product-cohesion-20261101/comparison.html)를 새로 만들었다. 이전 `product-rethink-20261101` 원본은 보존했다.
- 같은 기준 화면을 built-in image_gen의 시각 입력으로 공유했다. DEPTH AI 워드마크, 메뉴, 아이콘, 밝은 검사창과 어두운 작업면, 둥근 모듈·원형 포트, 역할색, 인디고 버튼, 머그·화분의 형태와 조명을 맞췄다. [공통 디자인 규칙](design/references/product-cohesion-20261101/DESIGN-SYSTEM.md)과 실제 프롬프트/교정 기록을 함께 보관한다.
- 기능 구성·Queue/FIFO 설명·수학적 관계·분리·통합·에셋·검토 흐름은 유지했다. 호출과 변경 매핑을 구분하고 생성 과정의 추가 함수/잘못 붙은 선을 교정했다. 래스터의 세부 픽셀·문자·연결선은 정확한 구현 계약이나 실제 서비스 결과로 쓰지 않는다.
- 이번 작업은 이미지와 디자인 문서다. 현재 EXE 화면, 새 UI 구현, 실제 Meta 호출, 전체 제품 검증, 사용자 최종 승인으로 기록하지 않는다. Unity·MR 폐기와 일반 Windows EXE 방향은 유지한다.

## 2026-11-01 최신 — 기존 레퍼런스 미사용, 기능 분석 기반 8장

- 사용자는 **시각적 비주얼 그래픽이 가장 중요하며, 기존 레퍼런스를 참고하지 말고 프로젝트 전체 기능을 분석해 5장 이상을 새로 제작**하라고 정정했다. 아래 초기 2·3번을 기준으로 하는 지침을 이번 디자인의 기준으로 삼지 않는다. Unity·MR 폐기와 일반 EXE 방향은 유지한다.
- [새 제품 시각 설계 8장](design/references/product-rethink-20261101/index.html)을 제작했다. 전체 지도, 기능 구성, 수준별 설명/AI 계약, 수학적 관계/변경 영향, 실제 파일 분리, 두 프로젝트 통합, Meta 이미지/사용처, 검토/검증/이력의 여덟 화면이다. 기존 디자인 이미지는 입력으로 사용하지 않았고 이번에 만든 초안만 교정했다.
- [기능 분석](design/references/product-rethink-20261101/PRODUCT-ANALYSIS.md)과 [조작 계약](design/references/product-rethink-20261101/INTERACTIONS.md)에 실제 서비스 기반과 새 UI 제안을 구분했다. 모듈 몸체·포트·내부 구성·역할색을 그래픽의 중심으로 두었다. 생성기는 built-in image_gen이며 prompt/교정/파일 확인 기록을 같은 폴더에 저장한다.
- 이미지 안의 코드는 발췌/개념 표현이며 정밀한 컴파일 입력이나 모든 관계선의 API 결과가 아니다. 미실행 검증, 재사용 후보, 소스 기반 설명, PNG와 3D 메시를 구분했다. 실제 Meta 응답/새 UI 구현/EXE 화면 검사/사용자 디자인 승인으로 기록하지 않는다. 이번 턴은 디자인 산출물이며 런타임 코드를 바꾸지 않았다.

## 2026-11-01 후속 — 카드 대시보드 거부, 모듈 구성 작업면

- 사용자가 새 Electron 화면에도 모듈 느낌이 없다며 거부했다. `desktop-20261101/module-workspace.png`를 승인된 기준으로 취급하지 않는다. Unity·MR 폐기는 유지하며 초기 `preview-collection-20261029`의 **02-dark-glass-edit + 03-ivory-collect**에서 프리뷰·기능 구성·상태/코드·연결·하단 라이브러리 흐름을 가져왔다.
- [모듈 작업면 수정 기록](docs/DESKTOP-ASSEMBLY-20261101.md)을 읽는다. `desktop/ui/assembly.js`와 `assembly.css`는 실제 `/composition` 전체 ID와 방향 관계를 표시한다. 선택과 구성 root를 분리해 멤버 클릭/코드 열기로 구성이 사라지지 않는다. 드래그 배치, 이동/확대/전체 보기, 포트/관계 근거, 소스 값 변경 검토, 프리뷰 19개 선언 바인딩을 연결했다.
- 실제 서비스 + 렌더러 DOM **85개 통과**, `artifacts/desktop-dom-1793495374422/report.json`. 초기 Checkout **13개 모듈·17개 관계**, 3회 선택/소스 왕복, 이미지 사용처, 프로젝트 전환·순환 관계·빈 프로젝트, 검토/승인/undo 포함. 전체 서비스 회귀 **214개 통과**, `artifacts/desktop-assembly-service-tests.log`.
- EXE는 `artifacts/desktop/Depth AI.exe`에 다시 패키징했다. 실제 실행은 여전히 **Mojo IPC Access denied (0x5)**로 종료됐다. `artifacts/desktop-native-assembly-20261101/stderr.log` 참조. 실제 픽셀·크기별 렌더링·OS 포인터·사용자 시각적 승인으로 확대하지 않는다. 기본 sandbox는 유지했다. 이번 수정에서 새 Meta 호출은 하지 않았다.

## 2026-11-01 최우선 — Unity·MR 폐기, Windows 데스크톱 전환

- 사용자가 Unity와 MR을 명시적으로 포기했다. **모듈 분리와 쉬운 탐색을 위한 일반 Windows EXE**가 현재 제품이다. 아래 MR/공간/큐브 구현 지침은 역사적 기록이며 되살리지 않는다. [데스크톱 전환 기록](docs/MIGRATION-DESKTOP-20261101.md)을 먼저 읽는다.
- 새 클라이언트는 `desktop/`의 Electron + 기존 .NET 서비스다. 실행은 `artifacts/desktop/Depth AI.exe`, 빌드는 `scripts/build.ps1`, 실행 도우미는 `scripts/run.ps1`이다. Electron/.NET 실행 런타임/서비스/Web 어댑터를 함께 묶으며 Unity가 필요하지 않다. `.env`는 번들에 복사하지 않는다.
- 파일/모듈 검색, 실제 소스·관계·문맥, 수준별 설명, Meta 분석/질문, 파일 분리·두 프로젝트 통합 제안, diff 검토·검증 명령·승인 적용·이력/undo를 연결했다. 새 다크 데스크톱 기준 이미지는 `design/references/desktop-20261101/module-workspace.png`이며 built-in image_gen 프롬프트도 보관했다. 이미지의 샘플 숫자를 실제 실행 데이터로 쓰지 않는다.
- 활성 `unity/`와 Unity 전용 실행·빌드 도구를 제거했다. 미커밋 소스 보존용으로 `artifacts/retired-unity-20261101/`에만 이동했으며 새 패키지에서 사용하지 않는다. 이전 README/아키텍처는 `docs/history/`에 있다.
- 새 렌더러 DOM + 실제 HTTP 서비스 29개 검사, 기존 서비스 회귀 214개 통과. **실제 EXE 화면 검증은 미완료**다. Electron과 Edge가 Windows Mojo IPC Access denied로 중단됐다. DOM 검사나 패키징을 픽셀/UX 검증으로 확대하지 않는다. 배포 기본 sandbox를 끄지 않았다.
- 이번 Meta preflight는 .NET TLS `SecureConnectionError`로 실패했다. 새 UI의 실제 모델 분리/통합 성공을 주장하지 않는다. 과거 실제 호출 성공 기록은 유지하되 이번 세션 성공으로 대체하지 않는다. `scripts/test-desktop.ps1 -Native`로 일반 Windows 환경에서 실제 EXE·캡처 확인이 남는다.

## 2026-10-31 최신 정정 — 장식적 큐브 시안 거부, 구현 가능한 조작 기준

- 사용자는 아래 큐브 레퍼런스도 보기만 좋고 현실적으로 어떻게 만들고 사용할지 드러나지 않는다며 거부했다. `cube-workspace-20261031`을 승인된 디자인으로 쓰지 않는다.
- [실제 조작 기준 큐브 시안 6장](design/references/cube-practical-20261031/index.html)을 새로 만들었다. 기본 큐브 메시·무광 단색·얇은 선·면의 작은 원형 포트·읽을 수 있는 별도 라벨을 사용한다. 클릭으로 전체 멤버 펼치기, Rotate 모드의 큐브 드래그, 빈 공간 드래그의 시점 이동, 연결 근거 확인, 그룹을 유지한 코드 읽기를 구분했다. 이전 스튜디오/유리 상자/굵은 장식 케이블을 구현 목표로 삼지 않는다.
- 이미지의 CartState 다섯 멤버와 SetTotal 코드는 현재 소스를 기준으로 했다. 4번 잘못 붙은 함수 라벨과 6번 부모 열린 상태를 교정했다. 개요 장면의 선 경로와 시점 배치는 정확한 좌표/연속 회전 증명이 아니며 4번이 상세 연결 기준이다. 클래스 멤버 펼침을 기능 전체 의존성 구성으로 혼동하지 않는다.
- built-in image_gen 결과, 프롬프트·조작 계약·Unity 구현 대응, 파일 확인을 새 폴더에 보관했다. 이번에도 런타임 변경은 없다. 현재 `DepthSpatialField`는 여전히 얇은 몸체와 제한된 카메라 회전을 사용하므로 새 시안의 자유 회전/계층 펼침을 구현했다고 쓰지 않는다. 사용자 최종 승인은 없고 이전 이미지/EXE/코드를 보존했다.

## 2026-10-31 최신 방향 — 직접 회전하는 큐브와 내부 모듈 펼치기

- 사용자가 기존 방향을 바꾸어 **정육면체 모듈 몸체, 큐브 직접 회전, 3차원 공간 탐색, 큐브 면의 연결점, 큐브 클릭 시 여러 내부 모듈 동시 표시**를 요청했다. 이 방향이 이전 몸체 형태보다 우선한다. 이번 요청은 레퍼런스 이미지 5장 이상이며 런타임 구현 승인이나 완성 판정이 아니다.
- [큐브 공간 레퍼런스 6장](design/references/cube-workspace-20261031/index.html)을 새로 만들었다. 전체 공간, 개별 큐브 회전, CartState의 5개 멤버 동시 펼침, 포트/호출 확인, 공간 시점 이동, 내부 코드/설명 확인 장면이다. 원본 PNG와 `prompts.json`, `verification.json`을 함께 저장했다. built-in image_gen을 사용했다.
- CartState 5개 멤버와 CouponRules 2개 멤버, CalculateTotal 식은 현재 Checkout 소스를 기준으로 했다. 4번은 실제 ApplyCoupon의 CalculateTotal/IsValid 호출이다. 1·2·5번의 케이블 배치와 6번 배경선은 공간 표현 예시이며 정확한 소스 그래프가 아니다. 3번 흰 점선은 포함 관계다. 회전 고리는 조작 시안이지 정확한 축/운동학 명세가 아니다.
- 여섯 이미지는 직접 확인했다. 이전 레퍼런스·코드·EXE를 보존했고 이번에는 Unity 코드를 바꾸지 않았다. 큐브 상호작용 구현, MR 기기 실행, 사용자 디자인 최종 승인으로 기록하지 않는다.

## 2026-10-31 22:38 — 현재 구현 재거부, 입체 MR 레퍼런스 6장

- 사용자는 22:10 결과도 원래 구상과 크게 다르고 실제 3차원 공간이 부족하다며 거부했다. 116/81개 검사 통과를 시각적 요구 충족으로 취급하지 않는다. 이번 요청은 현재 프로젝트 기준 레퍼런스 5장 이상이며, 새 이미지 6장을 제작했다. 구현 추가 작업 요청/디자인 승인으로 확대하지 않는다.
- 최종 갤러리: [입체 MR 레퍼런스 6장](design/references/mr-volume-20261031/index.html). 전체 공간, 13개 모듈의 전체 구성, 깊이 확인 측면, 텍스트/이미지 사용처 15개 구성, 소스/수준별 설명, 두 프로젝트 통합 제안의 여섯 장면이다. 원본 PNG와 `prompts.json`, `verification.json`을 같은 폴더에 저장했다. `*-draft.png`는 교정 전 초안이며 최종 기준으로 쓰지 않는다.
- 얇은 평면 카드 대신 두께와 옆면이 보이는 논리/상태/행동/에셋 몸체, 서로 다른 XYZ 위치, 공간에 붙은 읽기 면을 제안했다. 3번은 깊이 확인을 위해 관계선을 숨기고, 4번은 선택한 바인딩만 강조한다. 6번의 점선은 재사용 후보 연관을 나타내는 설계 표현이며 실제 호출 방향이나 통합 적용 완료의 근거가 아니다.
- built-in image_gen으로 생성했다. 현재 Checkout 소스의 함수/파일/금액을 대조했고 잘못 생성된 코드 서명과 파일명을 교정했다. 이미지 자체는 구현 완료 화면, Meta 실제 응답, MR 기기 동작 검증이 아니다. 사용자 승인도 아직 없다. 기존 코드·EXE·시안·캡처를 보존했다.

## 2026-10-31 22:10 — 텍스트·이미지 사용처 연결, 공간 유지와 새 EXE

- **[프리뷰 소스 연결·공간 유지 검증](docs/SPATIAL-SOURCE-REVIEW-2026-10-31.md)을 먼저 읽는다.** 사용자는 아래 46개 검사 화면도 거부했다. 텍스트가 선택되지 않고 이미지 사용처가 없으며 MR 방향의 공간에서 갑자기 PC 구성판으로 전환된다는 지적이다. 구형 평면판 성공을 사용자 요구 충족으로 기록하지 않는다.
- 현재 프리뷰의 18개 텍스트·값·이미지 요소를 실제 JSON 정의 위치/소스 코드/에셋에 연결했다. ID와 근거는 정식 graph에 포함돼 AI와 UI가 공유한다. 이미지 선택은 실제 선언된 사용처도 포함한다. 범용 런타임 UI 자동 발견으로 과장하지 않는다.
- 공간뷰는 카메라와 몸체를 유지하고 전체 구성 ID를 동시에 모은다. 그래프 스프링 배치, 관계별 색, 중복 참조 위치 보존, 드래그/확대, 작은 몸체 요약, 확대 해상도, 속성/코드/설명 접근을 연결했다. 큰 평면판은 명시적으로 여는 Workbench에만 남긴다. 자동 Meta 분석 완료의 강제 목록 팝업도 없앴으며 이 분기는 새 실제 모델 회신 검증이 아니다.
- 서비스 **214개** 회귀 통과. 실제 Play Mode **116개**, 최신 `artifacts/unity-live-20261031-220626/`(3회 왕복, 영상 26프레임/3전환). 실제 새 Windows EXE **81개**, `artifacts/windows-spatial/proof-spatial-20261031-220934/`(3회 구성과 실제 1680/1280 창 변경). 캡처를 직접 확인했다. 첫 숨김 실행의 검은 캡처를 화면 검증으로 사용하지 않는다. OS 포인터 자동화/헤드셋 검증은 아니다.
- 새 EXE는 `artifacts/windows-spatial/Depth AI.exe`; `scripts/run-spatial.ps1`이 최신 서비스·빈 포트·저장소 `.env`를 연결한다. 이전 EXE/시안은 보존했다. 키를 출력/복사하지 않는다. MCP가 WorldVR여서 MetaAIHack 로컬 검증 명령을 사용했고 WorldVR는 변경하지 않았다.
- 현재 MetaAIHack Editor 프로세스에는 `service-spatial-bindings`와 포트 52691을 지정했다. Editor 재시작 후에는 이 임시 환경이 사라진다. 일반 Release는 PID 39740 잠금이 남는다. 실제 MR 런타임/GLB/임의 프로젝트 UI 자동 추적/사용자 최종 디자인 승인/전체 기능 100% 완료를 주장하지 않는다.

## 2026-10-31 21:21 — 공간 확보 후 실제 전체 구성 UI 검증 통과

- 사용자가 디스크 공간을 확보했고 약 8GB 여유를 확인했다. 대기 중 stop 처리, MetaAIHack MCP 경로와 Editor 정지 상태를 확인한 뒤 최신 코드를 실제 Editor에 반영했다. 아래 20:57의 실행 차단은 이번 UI 검사에 대해서는 해소됐다.
- 최신 `artifacts/unity-live-20261031-211828/report.json`: **3회 반복을 포함한 46개 검사 통과**. 프리뷰 왼쪽 이동, 전체 13개 모듈/17개 실제 관계, 배경 페이드, 구성 내부 선택 시 rootId 유지, 코드 왕복, 클래스 멤버, 속성 draft, 1280/1600 레이아웃과 스크롤, 모션 줄이기, Workbench 왕복을 실행했다. 픽셀 캡처와 중간 프레임도 직접 열어 확인했다.
- 중간 프레임에서 구성판이 프리뷰를 가리는 문제를 발견해 이동 중에도 두 작업판을 분리했다. 그룹 폭을 고정해 이동 중 열 재배치를 막는다. 다크 상단/상태바 대비도 수정했다. 최신 runtime/Editor DLL은 모두 21:17:32다.
- 검증기 버튼 이벤트에 명시적 target/focus를 추가했다. 첫 실행 `211001`은 버튼 동작 전 실패했고, `211406`은 42개 후 Play Mode가 종료돼 interrupted로 기록했다. `211616`의 43개 통과 후 위 시각 수정과 전환 중 겹침 검사를 추가한 최종 결과가 46개다. 앞으로 중도 Play Mode 종료는 검증기에서 자동으로 interrupted로 기록한다. `refresh` 로컬 명령도 추가했다.
- 영상/프레임 리뷰: `artifacts/unity-live-20261031-211828/motion-review.mp4`, `motion-review.html`; 최종 화면 `composition-final.png`. 41개 캡처/5개 전환을 묶은 약 10fps 표본이며 OS 마우스 자동화나 실행 FPS 측정은 아니다. 새 Meta 호출은 없었다. 전체 제품/임의 프로젝트/새 EXE/디자인 최종 승인으로 확대하지 않는다.
- 일반 Release의 기존 프로세스 잠금을 강제로 풀지 않았다. MCP에서 **현재 MetaAIHack Editor 프로세스에만** `DEPTH_SERVICE_EXECUTABLE=.../artifacts/service-composition/Depth.Service.exe`, `DEPTH_PORT=58735`를 지정했다. 다음 일반 Play도 최신 서비스 빌드를 사용하며 씬/프로젝트 설정 파일은 바꾸지 않았다. Editor 재시작 후에는 정상 Release 재빌드 또는 명시적 환경 지정이 다시 필요하다. 테스트는 종료됐고 대기 명령은 없다.
- 서비스 소스는 이번에 변경하지 않았다. 이전 최신 전체 서비스 결과 205개는 유지되지만 이번 UI 재실행에서 재검사했다고 쓰지 않는다. 자세한 실행 이력은 [전체 구성 기록](docs/COMPOSITION-REVIEW-2026-10-31.md)의 최신 절을 읽는다.

## 2026-10-31 20:57 — 단일 모듈 확대 거부, 전체 구성으로 교체 중

- 사용자는 이전 32개 모션 검사 화면을 거부했다. 요구는 **프리뷰 왼쪽 이동 → 무관한 모듈 페이드아웃 → 선택 기능에 사용된 전체 모듈이 함께 앞으로 모이고 실제 연결선을 표시**하는 것이다. 한 장씩 확대하거나 대표 몇 개만 표시하는 방식은 요구 충족이 아니다.
- [전체 구성 수정과 실행 차단 기록](docs/COMPOSITION-REVIEW-2026-10-31.md)을 먼저 읽는다. 새 `DepthComposition.cs`는 모든 구성 ID를 네이티브 UI 카드로 동시에 표시한다. 카드 선택은 전체 기능의 rootId를 유지한다. 속성 draft/검토와 코드/설명/이미지 확인을 보존한다. 클래스 선택은 소유 멤버도 포함하고 참조된 다른 클래스의 무관한 형제 메서드는 포함하지 않는다.
- 전체 서비스 205개 검사 통과(`artifacts/self-test-composition.log`, `DOTNET_gcServer=0`). 첫 204개 통과 뒤 클래스 검사 추가 실행은 OOM으로 중단됐고, workstation GC로 재실행한 최신 205개가 성공했다. 모의 Meta 검사이며 새 실제 모델 검증이 아니다. 최신 서비스는 `artifacts/service-composition/`이다.
- 런타임은 실제 Unity rsp로 참조 컴파일 통과. 새 Editor 검사 파일은 기존 rsp 복사본에 추가하고 최신 런타임 참조로 컴파일했다. **실제 Editor 반영·새 화면·새 Play Mode 검사 통과가 아니다.** Editor DLL은 여전히 20:37:11이며, 새 검증을 시작하려던 Editor가 `Reloading assemblies for play mode.`에서 멈췄다. MCP는 WorldVR로 바뀌거나 무응답, 대상 고정 relay도 실패했다.
- `artifacts/unity-verification-command-v2.txt`의 **stop이 대기 중**이다. 사용자에게 MetaAIHack 창의 진행창/팝업 상태를 질문했고 답변은 아직 없다. 자동 승인 검토가 이전 `service-agent-check` 빌드 폴더 삭제를 막았으며 실행하지 않았다. 디스크 여유 0으로 추가 컴파일도 한 차례 실패했고 이번 임시 파일 정리 후 참조 컴파일을 복구했다. 기존 소스·이미지·이전 캡처는 보존했다.
- 일반 Release는 이전 검증 서비스 PID 39740이 exe/DLL을 잠가 갱신 실패했으며 해당 프로세스 종료도 접근 거부다. 복구 후 먼저 stop/테스트 격리를 정리하고 정상 Release 빌드와 AssetDatabase.Refresh를 완료한다. `DepthCompositionChecks`가 실제 Editor rsp/DLL에 들어간 다음 `unity-composition-only.txt`에 `composition`, 명령 파일에 `start`를 기록해 새 3회 검사를 실행하고 캡처를 직접 검토한다. 구버전 32개 모션 검사나 소스 컴파일을 새 화면 승인으로 보고하지 않는다.

## 2026-10-31 20시 후속 — 애니메이션과 UI 흐름

- [모션 수정·화면 검토](docs/MOTION-REVIEW-2026-10-31.md)를 먼저 읽는다. 고정 0.9초 선택 대기 제거, 도착 진행도와 패널 연결, 복귀/재선택, 모달/보조 패널/연결선/콘텐츠 표시, 읽는 위치를 유지하는 채팅 스크롤, 모션 줄이기를 연결했다. 글자가 몸체와 함께 커지던 중간 프레임도 수정했다.
- 실제 MetaAIHack Play Mode 3회 반복을 포함한 모션 검사 32개 통과. 마지막 실제 결과는 `artifacts/unity-live-20261031-201529/`이며 MP4와 프레임별 HTML 리뷰가 있다. 실제 Meta PNG를 재사용한 이미지 표시 검사이며 새 모델 호출/전체 이미지 인수 검사가 아니다.
- 마지막 모션 줄이기 재표시 보완과 추가 2개 검사는 참조 컴파일만 통과했다. Editor가 구버전 테스트 DLL을 사용했으므로 **34개 통과라고 쓰지 않는다.** MetaAIHack Refresh 후 재생 필요. MCP가 다시 WorldVR로 바뀌어 경로 가드로 변경을 막았다. 신규 EXE/성능 측정/사용자 시각적 승인은 아니다.

## 2026-10-31 19:46 직접 실행 후속

- [직접 실행 결과](docs/DIRECT-RUN-2026-10-31.md)를 먼저 읽는다. 메모리 확보 후 전체 서비스 회귀 **201개 통과**, 최신 Unity 런타임/Editor 참조 컴파일 통과. 실제 MetaAIHack Play Mode를 실행해 기본 3회/39개와 실제 Meta Queue/FIFO 수준별 설명 UI까지 **41개** 확인했다. 전체 Unity 완료는 아니다.
- MCP는 여전히 `Transport closed`. 기존 Editor의 명시적 검증 명령으로 실행했다. 새로 띄운 Unity는 라이선스 IPC 오류여서 그 프로세스만 종료했다. 기존 Depth 씬과 테스트 Workbench 중복을 발견해 테스트 격리를 수정했으나 마지막 수정은 실행 미검증이다.
- 이미지 API HTTP 200 뒤 Editor의 검증 진행과 stop 명령 처리가 멈췄다. 사용자에게 창 팝업/일시정지 상태를 질문했다. `artifacts/unity-verification-command-v2.txt`의 stop이 아직 대기 중이다. 복구 후 정리를 먼저 확인한다. 현재 보고서는 `artifacts/unity-live-20261031-194657/report.json`; 41개 중간 결과를 전체 성공으로 바꾸지 않는다.

## 2026-10-31 최종 후속 — 실제 Meta 성공, Unity 1차 통과와 후속 차단

- 먼저 [실제 Meta·Unity 검증 기록](docs/LIVE-VERIFICATION-2026-10-31.md)을 읽는다. **아래 과거의 Meta 인증 전 실패 기록은 최신 상태가 아니다.** 저장된 키로 실제 모델 목록·Muse Spark·Muse Image 성공. 키를 출력하지 않는다.
- 실제 Meta 분리/통합/설명/승인 이미지/undo를 서로 다른 프로젝트로 3회 검증했다. 87개 검사, 독립 행동 사례 768회, PNG 6개 생성 성공. 별도 실제 채팅 초보자/숙련자 2세션의 도구 호출도 성공했다. CLI는 명시적 Python 인증서 검증 HTTPS를 썼고 Unity가 실행한 기본 .NET 전송의 실제 추론도 별도로 성공했다. fixture와 혼동하지 않는다.
- 실제 MetaAIHack Play Mode에서 첫 3회/39개 검사 및 화면 캡처 통과. 이후 도메인 reload의 Update 예외를 발견해 초기화/종료와 프로젝트 보존을 수정했다. **최신 재진입/설명·이미지 UI 확장 검사는 미완료**다. 기본 Release가 잠겨 최신 서비스는 `artifacts/service-verified-current/`에 별도 빌드했다.
- 후속 MCP가 WorldVR로 바뀌거나 미응답이었고 마지막 읽기 호출은 `Transport closed`다. WorldVR는 변경하지 않았다. project-path relay는 named pipe 접근 거부. Windows 사용 가능 커밋 약 90 MiB에서 전체 self-test가 OOM으로 중단됐다. 프로세스 종료도 접근 거부여서 사용자에게 메모리 확보와 MetaAIHack 활성화/연결 복구를 비동기로 요청했다.
- 예약 실행 파일은 제거했다. 메모리/연결 복구 후 실제 대상부터 확인하고 일반 Release 빌드, 최신 Unity 컴파일/재진입·생성물 UI 검사, 전체 회귀 검사를 끝낸다. GLB 메시/MR/임의 프로젝트 100% 보존이나 새 EXE·디자인 승인을 완료로 쓰지 않는다.

## 2026-10-31 후속 — Unity 코드 점검, 이번 Play Mode 검증 미완료

- [Unity MCP 코드 점검 기록](docs/UNITY-MCP-REVIEW-2026-10-31.md)을 읽는다. Editor가 10/29 Debug 서비스를 실행하던 경로를 최신 빌드 방식인 Release로 수정했다. 명시적 apphost 실행 파일은 `DEPTH_SERVICE_EXECUTABLE`로 지정한다.
- 연결선의 매 프레임 List/ToArray/GetComponent를 보관 배열/참조로 교체했다. 프로젝트/관계 캐시 갱신, 요청 세대/진행 수/중복 폴링, 생성 이미지 캐시와 닫힌 창 응답 폐기, 카메라/UIDocument/요청/RenderTexture 종료 처리를 수정했다. 실제 Unity compiler response로 참조 컴파일 통과. 성능 실측/Play Mode 검증으로 주장하지 않는다.
- 직전 턴 MCP는 MetaAIHack에 정상 연결돼 있었지만 이번 상태 명령은 수분간 미응답, 콘솔 및 최소 재조회도 15초 내 응답이 없었다. 사용자가 연결 상태를 확인하도록 비동기 요청했다. 이번에는 씬 변경/Play Mode 실행이 없고 해당 작업은 남아 있다.
- Meta preflight 역시 프록시 ConnectionRefused다. 새 모의 검사로 실제 모델 검증을 대신하지 않는다. 연결을 복구한 뒤 실제 프로젝트와 Editor 상태부터 재확인하고 위 기록의 실행 검증을 이어간다.

## 2026-10-31 최신 수정 — Unity 컴파일 오류와 셰이더

- 실제 MetaAIHack Editor.log에서 `DepthMetaWorkspace.cs`의 `UnityWebRequestTexture`/`DownloadHandlerTexture` CS0103 두 건을 확인했다. `com.unity.modules.unitywebrequesttexture` 내장 모듈을 manifest/lock에 추가했다. 사용자가 추가한 Unity AI Assistant 패키지는 유지했다.
- Unity가 생성한 `Assembly-CSharp.rsp`로 오류를 재현하고, 누락 모듈 참조만 추가한 복사본으로 컴파일 성공을 확인했다. `artifacts/unity-error-fix/` 참조. 설치 DLL 전체를 참조하던 이전 스크립트는 누락 패키지를 놓쳤다. `scripts/check-unity-scripts.ps1`은 이제 실제 Unity 컴파일 입력을 사용하며 manifest보다 오래된 입력은 거부한다.
- ContactShadow/SpatialFloor/Pearl의 `CGPROGRAM`/`ENDCG`를 각각 별도 행으로 분리했다. 기존 shadercompiler 로그의 `#line` 전처리 오류에 대한 수정이다. 수식·색상·GUID는 유지했다. 실제 셰이더 재컴파일·화면 검증은 아직 아니다.
- MCP는 재확인해도 WorldVR에 연결돼 있었다. 사용자에게 MetaAIHack 창을 활성화해 패키지 반영/재컴파일하도록 요청한 상태다. 현재 소스의 Editor reload/Play Mode/셰이더 컴파일 성공으로 확대 보고하지 않는다.

## 2026-10-31 최신 정정 — 실제 호출과 Unity MCP를 먼저 확인

- 사용자가 모의 테스트보다 실제 API 호출 성공 확인을 먼저 하라고 지적했다. 이후 live acceptance는 `/models`와 작은 실제 텍스트 추론을 먼저 통과해야 예제 프로젝트를 만든다. 이번 재실행은 `ConnectionRefused`로 **프로젝트 검사 0회**, exit 2다. 모의 검사를 대신 더 돌리지 않는다.
- 실제 실패 경로는 세션의 HTTP/HTTPS/ALL proxy `127.0.0.1:9`. DNS는 해석됐지만 프록시 연결이 거부됐다. Meta 서버의 인증 결과가 아니므로 키 오류라고 말하지 않는다. `MetaConnectivity`가 키/응답 원문 없이 stage/route/socketError를 기록한다. 프록시를 임의로 해제하거나 다른 도구를 우회 통로로 쓰지 않는다.
- Unity MCP에 실제 읽기 명령을 보냈으나 `WorldVR/Assets`, `WorldOcean.unity`가 응답했다. **MetaAIHack 연결이 아니다.** WorldVR를 변경하거나 종료하지 않았다. MCP 사용 전 반드시 `Application.dataPath`가 이 저장소의 `unity/Depth.Desktop/Assets`인지 확인한다.
- C# 감사 결과 GameObject.Find 및 매 프레임 씬 Find는 없었다. Editor 브리지의 `FindFirstObjectByType` 1곳을 소유 객체 참조로 변경하고 창 종료 시 정리한다. 남은 `Shader.Find` 3곳은 셰이더 조회다. 브리지 참조 컴파일만 확인했으며 MetaAIHack Play Mode 검증은 아니다. `artifacts/connection-audit-20261031.json` 참조.

## 2026-10-31 최신 반복 검증 — 실제 예제 프로젝트

- [반복 검증 보고서](docs/ACCEPTANCE-2026-10-31.md)를 읽는다. 두 실제 .NET 프로젝트를 회차마다 생성해 3회 분리/통합/undo를 검증했다. 적용 전 복사본과 적용 후 프로젝트에서 **768회 행동 사례 실행**, 작업 흐름 검사 87회 통과. Meta 응답은 명시적 fixture이며 실제 모델 품질 검증이 아니다.
- 기존 PNG 헤더 검사가 손상 이미지를 수락하는 결함을 발견하고 청크 CRC·압축/스캔라인·zlib 체크섬 검사로 수정했다. 전체 서비스 **199 assertions**, 마지막 Meta 대상 80개, HTTP/MCP·Dart/Web·Unity 참조 컴파일 통과. 이전 189개/173개는 과거 결과다.
- 실제 Meta 연결은 여전히 인증 전에 실패해 `blocked`. 키 유효성은 미판정이다. 새 Unity 빌드도 이번에 Package Manager IPC 30초 실패로 exit 1. 실제 추론/생성/새 EXE/GLB/MR/임의 프로젝트 행동 보존을 완료로 표시하지 않는다.
- `scripts/test-acceptance.ps1` 기본은 실제 Meta, `-Fixture`만 모의 응답이다. 자동 fallback은 없다. 결과와 실제 예제는 `artifacts/acceptance-*`에 남기며 Git에 포함하지 않는다.

## 2026-10-31 최신 정정 — Meta Model API와 .env

- 사용자는 제공한 Meta 키를 `.env`에 저장하라고 명시했고 완료했다. `.env`는 Git/검증 복사본에서 제외한다. 키 값을 출력하거나 문서/응답에 쓰지 않는다. 재발급을 작업 진행의 필수 승인 단계로 요구하지 않는다.
- **기본은 현재 Meta Model API** `https://api.meta.ai/v1/`의 Muse Spark(`muse-spark-1.3`)와 Muse Image(`muse-image-1.0`)다. 같은 `MODEL_API_KEY`를 사용한다. 이전 Llama SDK만 보고 이미지 API가 없다고 안내한 것은 오류였으며 아래 옛 지침보다 이 정정이 우선한다. [공식 개요](https://dev.meta.ai/docs/overview), [구현 문서](docs/META-MODULES.md).
- SAM/Chameleon 설치는 기본 요구가 아니다. 기존 worker는 명시적 protocol=worker 호환 코드로만 보존한다. UI는 Meta API의 2D/3D 스타일 PNG 생성으로 변경했다. 실제 GLB 메시 생성은 별개이며 현재 공식 Model API의 지원으로 확인되지 않았다. 이를 PNG 생성으로 완료했다고 주장하지 않는다.
- `.env` 로딩/키 비노출, 현재 Chat API/Muse Image 계약, 기존 검토/승인 가져오기를 연결했다. 서비스 189 assertions와 Unity 참조 컴파일 통과. 실제 `/models` 호출은 이 세션의 네트워크 연결이 인증 전에 실패했다. 키 유효성/실제 추론·생성/새 EXE는 미검증이다. `scripts/check-meta.ps1`은 일반 터미널용 연결 검사다.

## 2026-10-31 후속 요구 — 이해 수준별 설계 설명

- 모듈에는 목적 외에도 **왜 만들었는지, 어떤 개념/자료구조를 왜 썼는지, 동작·예시·대안·주의점·코드 근거**가 있어야 한다. Queue가 실제 사용됐다면 FIFO를 초보자도 이해하도록 설명한다. `docs/META-MODULES.md`의 설명 수준 절을 읽는다.
- beginner/intermediate/expert는 같은 구조화 기록을 다른 자세함으로 표시한다. AI 기본 계약은 압축 표현을 사용하며 수준 전환은 모델을 재호출하지 않는다. UI 선택을 저장하고 Meta 채팅에도 전달한다. 모델의 비공개 추론 원문을 수집하는 기능이 아니다.
- 생성 시 기록한 Meta 제안 이유와 기존 소스에서 추정한 이유를 구분한다. 정확한 코드 인용/소스 변경/구형 캐시 업그레이드를 검사한다. 의미적 설명 품질은 실제 Meta 호출 전까지 미검증이다. 새 UI도 Unity 참조 컴파일과 플레이어 검증을 구분한다.
- 최신 검증은 서비스 **173 assertions**, 실제 HTTP/MCP의 수준별 설명 일치·추가 추론 없음, 기존 native workspace 검증, Unity 스크립트 참조 컴파일 통과다. `artifacts/self-test-explanations.log` 참조. 모델 응답은 fixture이며 아래 151개는 이전 결과다.

## 2026-10-31 최신 Meta 요구

- **[Meta 모듈/변환/생성 구현](docs/META-MODULES.md)을 읽는다.** 제품 기본 Meta Llama는 개발 도구 Codex와 구분한다. 수학적 분할·계약 캐시, 실제 파일 split/두 프로젝트 integration 제안, Chameleon/SAM 3D worker 연결을 추가했다. 다른 모델로 자동 대체하지 않는다.
- 서비스 151 assertions와 Meta HTTP/MCP fixture 검증을 통과했다. 모의 Meta 응답과 실제 복사본 빌드/실행이다. 실제 모델 품질/새 Unity EXE/범용 행동 보존 완료가 아니다. Python 등 추가 언어는 파일 단위 fallback이다. 아래 118개 기록은 이전 결과다.
- 실제 Meta 자격 증명/가중치가 없다. RTX 5060 8 GiB는 SAM 3D 공식 환경에 부족하다. 새 플레이어는 기존 Package Manager/라이선스 IPC 제한이 남고 참조 C# 컴파일만 통과했다. GLB 앱 내 렌더링과 MR 런타임도 미완료다.

## 다음 CLI의 첫 진입점 — 2026-10-31 작업

**먼저 [10월 31일 작업·프로젝트 분석·남은 검증](docs/HANDOFF-2026-10-31.md)을 읽는다.** 아래 10월 30일/29일 기록과 시각적 기준도 함께 유지한다.

- 이번 소스에는 줄 diff, 사용자 지정 빌드/테스트의 변경 복사본 실행기, 필수 검증의 Apply 차단, 분류 캐시/재시작 복원과 프로젝트 간 제안 격리가 추가됐다.
- 후속 요청으로 영속 제안·중단 적용 복구·검토형 undo, csproj 컴파일 입력/프로젝트 참조, Dart resolved 관계, Web JS/TS/JSX 분석을 추가했다. 서비스 118 assertions와 HTTP/MCP·Dart/Web 검증을 통과했다. 소스 편집·이력·런타임 선택 UI는 여전히 참조 컴파일만 통과했다.
- CLI 실제 계정 호출은 `.codex` 임시 경로/app-server 초기화 접근 거부로 모델 실행 전에 실패했다. 이 실패를 실제 모델 검증 완료로 기록하지 않는다. `tests/live_cli_workspace.py`는 직접 실행하는 실제 계정 검사이며 기본 offline 검사에 포함하지 않는다.
- 변경안은 `Edit.operation=replace/create/delete`를 지원한다. 생성·삭제의 검토/복사본 빌드·실행/적용/중단 복구/undo를 검증했다. 의미적 import 갱신·Unity asset GUID 이동·범용 자동 재구성 완료가 아니다. 캡처된 C# 소스 목록 변경은 아직 거부한다.
- 서비스/HTTP/MCP는 검증했지만 새 Unity EXE는 Package Manager·라이선스 IPC 오류로 빌드하지 못했다. Unity 참조 C# 컴파일 통과를 플레이어 빌드/렌더링 검증으로 확대하지 않는다.
- 공간뷰 작은 창 가독성·긴 제목·변경 검토/profile/로그 UI는 소스 변경 상태다. 실제 EXE 캡처와 사용자 시각적 승인은 없으며, 기존 EXE를 이번 수정본으로 취급하지 않는다.
- 대상 검증 명령은 사용자가 설정하고 실행해야 한다. 복사본은 파일 변경 격리이며 OS sandbox가 아니다. 미설정/미실행 검사는 계속 `not-run`이고 테스트 명령 성공도 행동 보존 증명이 아니다.

## 다음 CLI의 첫 진입점 — 2026-10-30 최종 인수인계

**먼저 [오늘 작업·검증·남은 작업](docs/HANDOFF-2026-10-30.md)을 읽는다.** 이 문서가 현재 상태의 기준이며 아래 10월 29일 실패 기록도 함께 읽고 목표 이미지와 실제 캡처를 직접 비교한다.

- 최신 요청으로 PC 공간뷰에 `Impact`(공유 구현의 직접/간접 사용처), 검토 시 수정 ID·해시/구문 검사, 사람·MCP·CLI·API 공통 문맥 패킷을 구현했다. 의미적 재구성·원본 동작 보존·토큰 절감 검증 완료가 아니다.
- 서비스 54 assertions, 실제 HTTP/MCP, macOS 네이티브 격리 적용·재분석과 3가지 크기의 화면 검증을 통과했다. Windows는 빌드만, 실제 모델/OS 포인터 자동화/MR 기기 실행은 미검증이다.
- 사용자 요청으로 오늘 변경과 인수인계를 Git에 커밋·푸시한다. 생성 이미지·캡처·소스는 보존하고 `artifacts/`와 자격 증명은 커밋하지 않는다.
- 최신 실제 PC 결과에 대한 시각적 최종 승인은 여전히 없다. MR 레퍼런스 방향의 긍정 피드백을 PC 완성 승인으로 확대하지 않는다.
- macOS는 `.app` 옆 `runtime/dotnet` 공식 런타임으로 서비스를 실행한다. `build-macos.sh`가 체크섬 검증 후 패키징한다. 서명/공증 완료 주장은 금지한다.

## 2026-10-30 후속 요청 — PC 공간뷰

- 사용자는 `design/references/mr-workspace-20261030/`의 MR 레퍼런스에 “너무 좋은데?”라고 답하고, PC에도 그 기준으로 중앙 프리뷰와 둥둥 떠 있는 모듈 뷰어를 구현하라고 요청했다. 이는 **MR 레퍼런스 방향에 대한 긍정 피드백**이며 이전 PC 결과의 승인으로 확대하지 않는다.
- 앱 기본 진입은 `Spatial workspace`다. 실제 ID의 모듈 10개를 역할별로 공간에 표시하고 검색·프로젝트 트리·More modules로 나머지에 접근한다. 중앙 프리뷰, 선택한 몸체만 전진·정면 회전, 원래 자리 윤곽, 실제 참조선과 소스 작업판을 연결한다.
- `Workbench`에서 아래 2+3 편집뷰를 계속 사용할 수 있다. MR 기기 런타임은 아직 구현하지 않았다. 새 PC 공간뷰는 `DepthSpatialField.cs`, `SpatialWorkspace.uss`를 사용한다.
- 카메라 이동은 누른 상태의 드래그만 허용한다. 자동 부유와 사용자 카메라 이동을 구분한다. 마우스를 놓은 뒤 포인터를 따라 움직이는 동작으로 되돌리지 않는다.
- 작업 후 유사 프로젝트 조사와 AI 산업에 대한 잠재적 영향 평가도 요청했다. 신규성·성능·토큰 절감을 검증 없이 단정하지 않는다.

## 2026-10-30 최신 사용자 방향 — 아래 이전 배치 지침보다 우선

- 사용자는 6번을 따른 구현도 각도·몸체·연결 구조가 원본과 다르다고 거부했다. 승인된 화면으로 기록하지 않는다.
- 새 요청은 초기 갤러리 [2번](design/explorations/preview-collection-20261029/02-dark-glass-edit.png)과 [3번](design/explorations/preview-collection-20261029/03-ivory-collect.png)의 혼합이다. 현재 작업은 2번의 좌측 하이어라키·큰 프리뷰·우측 기능 구성·하단 CLI/모듈 라이브러리와 3번의 진주빛 모듈 몸체·방향선·설계 근거를 결합한다. 스타일은 `Workbench23.uss`에 있다. `Workbench6.uss`는 이전 거부된 시도다.
- MR 확장이 제품의 목적이다. 중앙 프리뷰를 중심으로 실제 코드·상태·에셋 모듈을 주변 공간에 배치하고 선택한 모듈을 앞으로 가져오는 방향을 검토한다. PC 편집뷰와 공간뷰, MR 뷰어는 같은 모듈 ID·관계·선택 문맥을 공유해야 한다.
- 사용자는 PC 작업 뒤 MR 레퍼런스 이미지 약 5장을 요청했다. MR 이미지는 설계 참고이며 XR 뷰어 구현/헤드셋 실행 검증과 구분한다.
- 여전히 사용자의 시각적 최종 승인은 없다. 기능 검증 통과를 디자인 승인으로 바꾸어 기록하지 않는다.

작업 시작 전에 [2026년 10월 29일 인수인계](docs/HANDOFF-2026-10-29.md)를 반드시 읽고, 문서에 연결된 **목표 레퍼런스 이미지와 현재 EXE 캡처를 직접 비교**한다.

## 현재 상태와 사용자의 명시적 지적

- 현재 Unity EXE의 디자인은 사용자가 원한 레퍼런스 재현에 **실패한 상태**다. 승인된 완성 화면으로 취급하지 않는다.
- 이전 갤러리 위쪽의 단순한 HTML 배치 예시는 제품 디자인이 아니었다. 어시스턴트는 실제 EXE도 그 예시에 가까운 평면적인 UI로 만들었고, 사용자는 이를 명확하게 거부했다.
- 레퍼런스 분위기가 사라졌다는 사용자의 지적을 축소하거나, 빌드·동작 테스트 통과로 디자인이 완성됐다고 주장하지 않는다.
- 사용자는 한 시간 이상 소요된 작업과 토큰 낭비에 강하게 불만을 표시했다. 다음 작업은 이미지/계획 반복이나 기능 범위 확장보다 **레퍼런스에 맞는 실제 구현 화면**을 우선한다.
- 2026-10-29 마지막 요청은 개발을 중단하고 실패와 다음 작업을 기록해 Git에 푸시하는 것이었다. 새 개발은 다음 사용자 요청에서 재개한다.

## 반드시 유지할 제품의 핵심

Depth AI는 웹·앱·게임의 **실제 코드와 에셋을 의미 있는 모듈로 이해하고 수정·재사용·재구성하는 플랫폼**이다. 쇼핑 앱이나 단순 노드 뷰어를 만드는 프로젝트가 아니다. Checkout은 실제 소스 연결을 검증하는 예제일 뿐이다.

- 사람과 AI가 같은 모듈 ID·소스 근거·관계·설계 요약을 사용한다.
- 프리뷰에서 요소/기능 선택 → 관련 모듈을 모아 구성 표시 → 속성/코드/AI 설계 근거 확인 → 변경 검토·적용 → 재분석.
- AI 기록은 목적·생성 이유·검증 가능한 설계 근거다. 사용자 댓글이나 모델의 내부 추론 원문이 아니다. 폰트 같은 단순 에셋에 장문의 생성 이유를 강요하지 않는다.
- 공유 구현은 하나의 ID와 여러 참조로 유지한다. 시각적으로 모이는 것을 코드 복사·기능 통합이 완료된 것으로 표현하지 않는다.
- 소스에서 확인한 관계, 런타임 관찰, AI 추정, 미검증 상태를 구분한다.
- 기존 CLI는 MCP로 연결한다. API 키 채팅도 같은 프로젝트 도구와 변경 검토 흐름을 사용한다.

## 시각적 기준

- 사용자가 선호한 Meta 분위기: 진주빛/반투명 유리, 블루·바이올렛 계열의 절제된 빛, 공간의 깊이, 높은 그래픽 완성도. 파란색 사용은 허용됐다. 베이지·브론즈·세이지 배색으로 돌아가지 않는다.
- 기존 로고를 유지한다. 현재 복원 기준은 초기 4번의 파란 입체 심벌이다. 금색 A/삼각형 로고는 거부됐다. 별도 확인이 있었다고 꾸미지 않는다.
- 전체 탐색 상태에서는 작은 실제 모듈들이 공간에 존재한다. 최신 1번 시안은 너무 난잡하다는 지적을 받았다. 가시적 밀도·빛·테두리를 줄여야 한다.
- 선택 후에는 **선택한 기능이 오른쪽 정면 작업판**, **전체 프로젝트와 하이어라키는 아래 탐색대**로 이동한다.
- 프리뷰·코드·텍스트·입력·선택한 모듈의 조작면은 정면으로 읽고 클릭할 수 있어야 한다. 사선과 3D는 전체 탐색 공간과 모듈 몸체에 사용한다.
- 단순 평면 박스에 선만 연결한 현재 UI를 최종 구현으로 계속 다듬는 것으로 목표를 대체하지 않는다. 재질·역할별 아이콘·계층·간격·시선 흐름을 레퍼런스와 대조한다.
- imagegen은 실제 UI에 연결할 그래픽 자산과 정밀 기준 시안에 사용한다. 이미지 생성만으로 구현 완료를 주장하지 않는다.

## 다음 구현 시 진행 방식

1. 인수인계와 시안/실제 캡처를 읽는다. 미완료를 인정하고 현재 상태부터 이어간다.
2. 하나의 실제 Unity 화면에서 레퍼런스의 재질·밀도·가독성을 먼저 맞춘다. 소스 인덱스 연결을 유지한다.
3. 실제 EXE를 눈으로 확인하고 캡처를 레퍼런스 옆에 놓아 비교한다. 비슷하지 않으면 완료라고 보고하지 않는다.
4. 한 시간 동안 큰 범위를 계속 늘리지 않는다. 작은 검증 가능한 변경을 만들고 진행 상황을 짧게 공유한다.
5. 사용자가 승인하지 않은 파괴적 초기화나 이전 시안 삭제를 하지 않는다.
