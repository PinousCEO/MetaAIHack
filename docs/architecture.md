# Depth AI 데스크톱 구조

2026-11-01부터 Unity·MR 클라이언트를 폐기했습니다. 과거 설계는 [이전 기록](history/architecture-unity-20261031.md)에 보관했습니다.

## 구성

- `desktop/main.cjs`: Windows 창, 폴더 선택, 전용 서비스 프로세스, 무작위 localhost 포트·인증 토큰, 허용된 API 경로의 IPC 브리지.
- `desktop/preload.cjs`: 격리된 렌더러에 제한된 요청·프로젝트 선택 기능만 노출.
- `desktop/ui/`: 프로젝트/모듈 탐색, 소스·실제 관계·AI 문맥, 수준별 설명, Meta 질문, 분리·통합 제안, 검토·검증·승인·이력.
- `desktop/ui/assembly.js`: 구성 root와 검사 대상 분리, 실제 전체 관계의 DOM/SVG 작업면, 포트·드래그·이동/확대. 프리뷰 바인딩과 기능 라이브러리는 같은 소스 ID를 사용한다. 배치는 실행 순서를 추정하지 않는다.
- `src/Depth.Service/`: 기존 Roslyn/Web/Dart 분석, 공통 ID·해시·revision, 수학적 분할, Meta 계약과 설명 캐시, 소스 변환, 적용·복구·undo.
- `adapters/`: 언어 분석 및 명시적 자산 worker 호환 도구. Unity 클라이언트 의존성 없음.

## 실행·신뢰 경계

[Electron 보안 지침](https://www.electronjs.org/docs/latest/tutorial/security)에 따라 렌더러는 nodeIntegration 없이 contextIsolation과 sandbox를 사용합니다. 로컬 전용 depth 프로토콜과 CSP로 실행 소스를 제한하며 새 창·외부 탐색을 막습니다. main 프로세스는 요청 송신 프레임과 경로를 검사합니다. 서비스 토큰과 Meta 키는 렌더러에 전달하지 않습니다.

서비스는 localhost에만 바인딩하고 Origin 헤더 요청을 거부합니다. 화면의 요청은 main 프로세스가 중계합니다. 서비스는 부모 데스크톱 프로세스가 종료되면 자동 종료됩니다. 일반 종료 시 main도 자신의 서비스 프로세스를 정리합니다.

## 데이터 흐름

프로젝트 import → graph와 functional catalog → 모듈/요소 선택 → source/relations/context → Meta explanation 또는 split/integrate proposal → diff와 assessment → 사용자가 지정한 검증 명령 → 승인 적용 → 재인덱싱.

화면 구성: `/view`의 프리뷰 바인딩 → `/composition/{id}`의 전체 모듈/관계 → 구성 유지 상태에서 개별 모듈 검사. `/project-assets/{id}`는 인덱싱된 PNG/JPEG만 크기와 해시를 확인해 JSON 이미지로 전달하며 임의 파일 URL을 렌더러에 노출하지 않는다.

관계의 static/observed/inferred 근거를 유지합니다. 폴더 또는 화면상 묶음과 실제 코드 분리를 구분합니다. 소스는 항상 사용자 프로젝트가 원본이며 서비스 캐시는 파생 데이터입니다. 생성 이유와 소스에서 추정한 이유를 구분하며 모델의 내부 추론 원문은 수집하지 않습니다.

## 배포

[공식 수동 배포 구조](https://www.electronjs.org/docs/latest/tutorial/application-distribution)를 사용합니다. scripts/build.ps1은 Electron 파일, 앱 소스, 서비스와 설치된 공식 .NET 8 런타임을 artifacts/desktop에 묶습니다. Node 런타임과 Web 어댑터를 포함합니다. Unity·SDK·저장소 .env는 포함하지 않습니다. Windows EXE 서명과 설치 프로그램은 아직 없습니다.

독립 실행의 키 설정은 EXE 옆 .env 또는 DEPTH_ENV_FILE입니다. 저장소 안에서 실행하면 저장소 .env를 읽을 수 있습니다. 사용자 상태는 Electron userData 아래에 저장합니다.

## 검증 구분

desktop/dom-test.cjs는 실제 서비스와 렌더러 스크립트를 DOM 환경에서 검사합니다. desktop/smoke.cjs는 실제 EXE에서 클릭 흐름과 픽셀 캡처를 수행합니다. 전자는 후자의 대체 증명이 아닙니다. 이번 환경의 Chromium IPC 접근 거부로 후자는 미완료입니다.
