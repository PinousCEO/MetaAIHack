# Depth AI

**2026-11-03 — Depth Lens 0.2.0: CLI 옆의 작업 지도.** [실행 파일·실제 화면·검수](deliverables/2026-11-03/implementation/companion.html), [실행·MCP 연결 안내](lens/README.html)를 확인하세요. `artifacts/depth-lens/Depth Lens.exe`가 새 Windows 앱입니다. 연결한 CLI 창을 따라가며 현재 작업의 변경 모듈·직접 관계·Meta 설명을 보여 줍니다. 실제 Node 명령과 별도 검수 창에서 확인했으며 사용자의 Windows Terminal/Codex 실사용 창 검수와 구별합니다. .NET 8 Windows Desktop Runtime이 필요합니다. 아래 Depth AI는 보관된 기존 제품의 기록입니다.

[기존 프로젝트 포트폴리오](deliverables/2026-11-03/portfolio/index.html), [투명 패널 레퍼런스 12장](deliverables/2026-11-03/references/index.html), [전체 자료](deliverables/2026-11-03/index.html)는 보존했습니다.

마지막 보관 코드 **0.9.1**은 실제 웹 실행/로컬 서버와 Unity·Flutter·WinForms 개발 어댑터를 프리뷰·CLI·모듈 탐색에 연결하는 프로토타입입니다. 독립 WinForms 앱의 실제 클릭·텍스트 입력·PDB 소스 추적을 검증했습니다. Unity/Flutter는 컴파일·정적 분석을 통과했지만 실제 엔진 실행과 새 Depth AI EXE 화면 검수는 환경 문제로 미완료입니다. 임의 프로젝트 전체 지원을 뜻하지 않습니다. [구현·검증·남은 범위](docs/DESKTOP-ENGINE-BRIDGES-20261102.md)를 확인하세요.

실제 코드를 모듈로 탐색하고 Meta로 분리·통합 변경안을 만드는 **Windows 데스크톱 프로그램**입니다. 2026-11-01부터 Unity·MR·3D 공간 UI를 제품에서 제거하고 Electron 화면과 독립 .NET 분석 서비스를 사용합니다.

## 실행

빌드된 프로그램: `artifacts/desktop/Depth AI.exe`

EXE만 떼어 옮기지 말고 **desktop 폴더 전체**를 사용하세요. Electron, .NET 8 실행 런타임, 분석 서비스와 Web 분석 어댑터가 포함됩니다. Unity나 별도의 .NET 설치는 실행에 필요하지 않습니다. 대상 프로젝트의 빌드·테스트에는 해당 프로젝트의 SDK가 별도로 필요합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run.ps1 -ProjectPath C:/Projects/MyProject
```

새 설치의 기본 예제는 독립 웹 앱 **RuntimeWeb**입니다. Preview의 **Run** 또는 CLI의 **`/preview run`**으로 실제 프로젝트를 실행합니다. 실행 화면이 없으면 연결 안내를 표시합니다. 프로젝트 폴더를 앱에 드래그 앤 드롭하거나 상단 프로젝트 이름을 눌러 폴더를 선택하면 실제 파일·선언·관계를 인덱싱합니다. `.sln`, `.csproj`, `package.json` 같은 프로젝트 파일은 부모 폴더를 엽니다. 마지막 프로젝트와 변경 이력은 유지됩니다.

## 작업 흐름

1. **지도**에서 실제 클래스와 내부 멤버를 살펴보거나 관계 분석으로 이동합니다. 상단 검색과 **Hierarchy**의 파일/멤버 트리·최근 모듈로 소스를 찾습니다.
2. **기능 구성**에서 실제 프리뷰의 **Inspect**를 켜고 요소를 선택하면, 연결된 모든 소스의 관련 코드와 전체 구성을 함께 봅니다. 정적 HTML/명시적 웹 바인딩과 엔진 어댑터의 소스 위치를 사용하며, 모르는 요소는 연결 없음으로 표시합니다. 모듈 선택은 연결된 영역을 별도 강조합니다. 엔진 어댑터 없이 창만 캡처한 경우 소스 자동 추적은 지원하지 않습니다. **모듈 내부**에서는 멤버와 코드, 수준별 설명, AI 계약을 읽습니다.
3. **Meta 분석**은 선택한 모듈의 설명을 생성합니다. 초보자·중급자·숙련자 전환은 기존 설명을 재사용합니다. Queue 소스에서는 FIFO 개념 예시를 조작할 수 있습니다.
4. **분리**는 실제 파일 추출 변경안을, **통합**은 선택한 원본 프로젝트의 모듈을 가져오는 변경안을 만듭니다. 재사용 후보의 이름 유사도를 동작 호환성으로 취급하지 않습니다.
5. **에셋**에서 Meta PNG를 생성하고 미리본 뒤 승인하여 가져옵니다. 3D 스타일도 PNG이며 GLB 메시 생성과 다릅니다.
6. **검토**에서 파일 변경 전후와 줄 diff, 검증 상태를 확인합니다. 지정한 빌드·테스트 명령은 승인 후 변경 복사본에서 실행하며 필수 검증 실패 시 적용을 차단합니다. 적용 이력의 되돌리기도 검토 가능한 제안입니다.

모듈의 값 버튼 또는 **Values**를 누르면 해당 모듈과 의존 코드의 숫자·문자열·불리언을 직접 수정할 수 있습니다. **Apply edits**는 바뀐 여러 값을 실제 소스에 함께 저장하며 **Undo last value edit**로 되돌립니다. C#/JavaScript/TypeScript/Dart의 지원되는 AST literal만 편집하고 필수 프로젝트 검증을 우회하지 않습니다. 적용 후 연결된 런타임의 갱신을 요청합니다.

모듈의 화면상 분류와 실제 파일 분리는 다릅니다. 분석 전 설명은 미분석으로 표시합니다. 언어에 따라 파일 수준 분석으로 제한되며 임의 프로젝트의 자동 행동 보존을 보장하지 않습니다.

패널 제목 탭을 끌어 위치를 옮기고, 가장자리에는 분할·중앙에는 탭으로 결합합니다. 구분선으로 크기를 조절하고 `⋯`로 이동하거나 앱 내부에 띄울 수 있습니다. 닫은 패널은 **Panels**, 저장한 배치는 **Layout**에서 복원합니다. Console은 짧은 하단 패널로 시작하며 Meta CLI는 별도 탭입니다. 현재 실제 실행 연결은 `depth.runtime.json`, 감지된 웹/Flutter 실행 설정 또는 명시적으로 선택한 앱 창을 사용합니다. 모든 런타임의 요소별 소스 추적을 자동 지원하는 상태는 아닙니다.

## Meta 설정

저장소의 기존 `.env`를 사용하며 키를 번들에 복사하지 않습니다. 배포 폴더에서는 EXE 옆의 `.env` 또는 `DEPTH_ENV_FILE`로 설정 파일을 지정할 수 있습니다. 설정 항목은 [.env.example](.env.example)을 참고하세요. UI의 ‘키 설정됨’은 인증 성공을 뜻하지 않으며 옆의 연결 검사 버튼으로 실제 호출을 확인합니다.

현재 설정은 `muse-spark-1.3`(의미 분석·설명·코드 변경 제안·Meta CLI), `muse-image-1.0`(PNG)입니다. 상단 **AI models**에서 설정과 역할을 확인합니다. 실제 소스 위치/관계는 컴파일러 분석기, 직접 값 수정은 정확한 AST 치환, 프리뷰는 실제 런타임을 사용합니다. 모든 기능이 모델 호출인 것은 아닙니다. 실제 GLB 생성은 미지원입니다.

## 빌드·검사

Windows 빌드에는 Node.js 24 이상, .NET 8 SDK 및 설치된 .NET/ASP.NET Core 8 런타임이 필요합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1
node desktop/dom-test.cjs
node desktop/project-drop-test.cjs
node desktop/product-test.cjs
# 실제 Electron 화면/캡처 검증 — Windows 데스크톱에서 실행
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-desktop.ps1 -Native
```

- 현재 UI: **0.9.0**. 기존 [도킹 시안](design/references/dockable-workspace-20261102/index.html)의 패널 배치를 유지하면서 실제 실행 프리뷰와 모듈 내부 값 편집을 연결합니다. Preview / Modules / Hierarchy / Console / Meta CLI / Details / Source와 Field Guide/Route Atlas/Orbit을 사용합니다. 새 서비스는 `service-0.9.0`에 함께 배포되며 EXE 재시작이 필요합니다. 새 실제 화면 검수와 사용자 승인은 미완료입니다.
- 프리뷰 전용 프레임과 어두운 모듈 작업면을 분리하고 양방향 선택과 관련 요소 강조를 연결했습니다. 패널은 이동·분할·탭·접기·저장할 수 있습니다.
- 함수·상태·클래스·이미지·뷰는 서로 다른 SVG 몸체를 사용합니다. 코드와 설명은 Source / Why this design 탭으로 나뉘며 지도·분리/통합·에셋·검토도 각 작업에 맞는 구성을 사용합니다.
- 최신 값 편집 검사는 서비스240개, 실제 서비스·렌더러 DOM/HTTP/프로젝트 JS52개, 실제 Dart 수정·실행·undo9개입니다. 실제 TypeScript 빌드 검증도 통과했습니다. 명시적 Electron host fixture38개와 제품39개도 통과했으며 모델/에셋은 fixture입니다. 서로 다른 검사 수를 기능 수나 실제 플랫폼 성공으로 합산하지 않습니다.
- 과거0.6.1의 DOM244개와 [실제 캡처34개](artifacts/native-review-20261102/index.html)는 옛 Checkout 투영 화면 검수입니다. 새 실제 런타임의 시각 증거가 아닙니다. 현재0.9.0 네이티브 실행도 Mojo IPC0x5로 막혀 **새 실제 캡처0장**입니다. [최신 값 편집·검수 기록](docs/DESKTOP-SOURCE-VALUES-20261102.md)과 [엔진별 미완료 범위](docs/DESKTOP-ENGINE-BRIDGES-20261102.md)를 확인하세요.
- 이번 드롭/UI 작업에서 새 Meta 호출은 하지 않았습니다. 이전 네이티브 Meta 연결 성공과 설명 출력 한도 실패는 [당시 기록](docs/DESKTOP-NATIVE-REVIEW-20261101.md) 및 AGENTS.md에서 구분하며 전체 기능 성공으로 확대하지 않습니다.
- 배포 폴더에 RuntimeWeb, Checkout, TaskRunner를 포함했습니다. RuntimeWeb은 실제 실행 가능한 웹 앱이며 TaskRunner는 Queue/FIFO와 Pricing 분리용 소스 예제입니다.

[최신 도킹·양방향 선택·검수 기록](docs/DESKTOP-DOCKING-FOCUS-20261102.md) · [역할별 몸체·화면 구성](docs/DESKTOP-VISUAL-IDENTITY-20261102.md) · [프로젝트 드롭 구현](docs/DESKTOP-PROJECT-DROP-20261102.md) · [데스크톱 전환 기록](docs/MIGRATION-DESKTOP-20261101.md)

이전 Unity 소스·전용 도구는 `artifacts/retired-unity-20261101/`에 복구용으로만 보관했습니다. 활성 소스와 빌드에는 포함되지 않습니다.
