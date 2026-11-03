# 프로젝트 드롭과 실제 실행 화면 검토

사용자가 EXE를 실행했다고 알리고 프로젝트를 프로그램에 드래그 앤 드롭할 수 있어야 한다고 요청했다. Electron/.NET 데스크톱 방향을 유지했다.

## 반영한 동작

- 탐색기에서 프로젝트 폴더 하나를 앱 안에 놓으면 기존 `/import` 분석 경로로 열고 Composition으로 이동한다. 폴더 선택 버튼과 같은 처리이며 원본 파일을 복사하거나 실행하는 기능은 아니다.
- `.sln`, `.slnx`, `.csproj`, `.fsproj`, `.vbproj`, `package.json`, `pubspec.yaml`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `pom.xml`, `build.gradle`, `build.gradle.kts`, `CMakeLists.txt`를 놓으면 그 파일의 부모 폴더를 연다. 이 입력 형식 지원이 모든 언어의 의미 분석 지원을 뜻하지는 않는다.
- 드래그 중 영어 안내를 표시한다. 내부 텍스트/모듈 드래그는 그대로 두고, 외부 파일의 기본 페이지 이동은 막는다. 자식 컨트롤을 지날 때 안내가 깜빡이지 않도록 드래그 진입 수를 유지한다.
- 여러 프로젝트, 압축 파일, 일반 소스 파일, 존재하지 않는 경로는 설명을 표시하고 현재 프로젝트를 유지한다. 압축 파일은 먼저 풀어 폴더를 놓는다. 현재 작업 중이거나 대화상자가 열려 있으면 다른 프로젝트로 교체하지 않는다.
- 큰 프리뷰 비교 화면에서도 드롭할 수 있다. 성공하면 방금 가져온 프로젝트를 유지하여 기본 작업면으로 이동한다. Meta 호출이나 코드 적용을 드롭만으로 시작하지 않는다.

`project-drop.js`는 브라우저 이벤트를 처리하고, preload는 실제 File을 [Electron webUtils.getPathForFile](https://www.electronjs.org/docs/latest/api/web-utils)로 변환한다. 전용 IPC는 기존 main-frame 신뢰 검사를 거친 뒤 `project-drop.cjs`에서 단일 절대 경로, 실제 파일 종류와 허용 프로젝트 파일명을 확인한다. 임의 파일 읽기 API를 렌더러에 노출하지 않았다. contextIsolation과 sandbox 설정을 유지했다.

## 사용자가 실행한 실제 화면

`artifacts/desktop/resources/artifacts/desktop-smoke-2026-11-02T02-29-51-421Z/`에서 **failed / 선행 검사 89개 / PNG 18장 / renderer errors 0**을 확인했다. `liveMetaRequested:false`다. 18장을 모두 직접 열어 보았다. 새 드롭 구현 이전 패키지의 실행 결과다.

| 캡처 | 확인 및 조치 |
| --- | --- |
| 00, 07, 08, 09, 17 | 큰 프리뷰와 13개 구성/이미지 선택의 15개 구성 표시, 선택에 따른 관계 강조를 확인했다. 프리뷰 총액이 첫 화면 아래로 밀리고 제목·상품 설명이 한 줄로 붙어 있었다. 이미지 높이와 여백을 줄이고 제목·설명을 분리했다. |
| 01, 02 | 전체 지도와 내부 구성, 실제 소스 기반 설명/Meta 미생성 구분이 보인다. 아래 항목은 스크롤이 필요하다. |
| 03 | 관계 구성 표시와 선 방향을 확인했다. 긴 식별자가 단어 중간에서 끊겨 CamelCase 줄바꿈 기회를 추가했다. 행렬은 이 캡처 아래에 있어 화면에 보이지 않는다. |
| 04, 05 | 분리/통합 입력 화면이 표시된다. 생성 결과가 없는 상태이며 실제 Meta 분리·통합 성공 증거는 아니다. 통합 빈 상태 설명의 대비를 테마 변수로 수정했다. |
| 06, 16 | 라이트/다크 에셋 화면의 머그 이미지가 프레임 안에 보인다. 기존 프로젝트 PNG이며 이번 실행에서 생성한 이미지가 아니다. 3D 메시 미지원 상태를 확인했다. |
| 10, 11 | 관계 목록과 소스 패널, 실제 변경의 전후 파일·검증 구분이 표시된다. 스크롤 가능한 코드 영역의 화면 밖 줄까지 검토한 것으로 확대하지 않는다. |
| 12, 13 | 작은 창과 집중 보기에서 긴 이름의 부자연스러운 줄바꿈을 확인했다. 식별자 줄바꿈을 수정했다. |
| 14, 15 | 다크 지도는 적용되지만 프리뷰가 흰색이었다. 높은 우선순위의 이전 CSS를 테마 변수로 덮어쓰도록 수정했다. |

실패 지점은 `18-light-rationale`의 새 프레임 표식 검사다. 기존 표식은 body 위의 고정 요소여서 modal dialog의 top layer/backdrop에 가려졌다. 열린 dialog 안으로 표식을 옮기고 실제 표식 좌표를 측정해 PNG 색을 대조하도록 수정했다. 새 프레임 검사를 제거하거나 실패를 성공으로 처리하지 않았다. 모달 캡처와 위 CSS 수정의 **새 실제 픽셀 결과는 아직 없다**.

## 이번 검증 결과

- 경로/프리로드/드롭 이벤트 **23개**: `artifacts/project-drop-1793587333627/report.json`. 공백·유니코드 폴더, 프로젝트 파일, 거부 입력, 실제 File 전달용 명시적 preload fixture, 중복/작업 중 드롭, 내부 드래그, 안내 해제를 확인했다.
- 기본 렌더러 + 실제 HTTP 서비스 **198개**: `artifacts/desktop-dom-1793587165990/report.json`, `artifacts/drop-dom-20261102.log`. 드롭 이벤트의 경로 변환은 명시적 host fixture이며 import/소스 분석은 실제 서비스다. 드롭 폴더의 전체 구성 ID, 프리뷰 복원, 파일/폴더 거부 시 기존 프로젝트·선택 유지, 프로젝트 파일의 부모 열기와 실패 후 복구를 확인했다.
- 제품 흐름 **39개**: `artifacts/cohesion-contract-1793587220920/report.json`. 실제 서비스·변경 복사본 빌드/실행과 명시적 Meta/이미지 fixture다. 새 외부 Meta 호출이 아니다.
- 비교 화면 **172개**, 프리뷰 흐름 **364개**, 레이아웃 사각형 fixture **6개**: `artifacts/style-study-checks-1793587243373/`, `artifacts/preview-flow-1793587244416/`, `artifacts/drop-study-20261102.log`. PowerShell이 npm notice를 stderr 오류로 기록했지만 각 검사 보고서는 passed다. 픽셀 검사가 아니다.
- 캡처 주입식 **6개**, 모달 표식 DOM **3개** 및 변경 JS 구문 검사 통과. 실제 modal PNG 검증으로 확대하지 않는다.
- 배포 앱 파일 **32개** SHA-256 일치: `artifacts/project-drop-package-20261102.json`. 서비스/런타임은 바꾸지 않았고 `.env`를 복사하지 않았다.

각 검사는 서로 겹치며 기능 수나 실제 모델/OS 입력 검사 수로 합산하지 않는다.

## 다음 실제 실행에서 확인할 것

기본 `--smoke`에 초기 창 총액 경계 검사와 `smoke-drop.cjs`를 추가했다. 격리된 TaskRunner 폴더와 프로젝트 파일을 [Chromium Input.dispatchDragEvent](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/browser_protocol.json)의 실제 파일 경로 입력으로 놓는다. 안내 표시, 실제 preload/IPC/import, 잘못된 파일·여러 폴더 거부, 기존 프로젝트 복귀를 검사하고 드롭 캡처 3장을 추가한다. Windows 탐색기를 사람이 직접 끌어 놓은 결과와는 구분한다. 보고서는 `schema: desktop-project-drop-1`과 실행 소스 해시를 저장한다.

새 패키지의 직접 실행 PID 28188은 `artifacts/project-drop-native-20261102/stderr.log`의 **Mojo IPC Access denied (0x5)**로 종료됐다. sandbox/ACL을 변경하지 않았다. 따라서 이 드롭 검수기의 실제 실행 통과와 새 화면의 최종 승인은 미완료다. 사용자에게 일반 cmd 재실행을 요청했다.

```cmd
"C:\Users\dlfgu\Documents\GitHub\MetaAIHack\artifacts\desktop\Depth AI.exe" --smoke
```

새 `artifacts/desktop/resources/artifacts/desktop-smoke-<시각>/report.json`과 PNG를 읽어 이어서 검수한다. 이전 18장으로 새 CSS/드롭 구현 성공을 대체하지 않는다.
