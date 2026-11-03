# 공통 시안 기반 데스크톱 구현 — 0.4.0

사용자가 `product-cohesion-20261101`의 8장에 대해 “일단 저대로 구현해봐”라고 요청했다. 이번 작업은 디자인 생성이 아니라 실제 Electron 클라이언트 구현과 새 EXE 패키징이다. 시각적 최종 승인이나 모든 기능 100% 완료로 해석하지 않는다.

## 실제 반영한 화면

- 공통 화면: 밝은 상단/메뉴/검사창, 어두운 작업면, DEPTH AI 워드마크, 하나의 SVG 아이콘 체계, 코랄 함수·민트 상태·라벤더 타입·샌드 에셋, 인디고 선택/버튼. 모션 줄이기 설정과 작은 창의 검사창 접기, 검색 탐색기를 연결했다.
- 지도: 실제 클래스/멤버/선언된 프리뷰/에셋을 몸체 안에 표시한다. 공유 구현을 복제하지 않는다. 프리뷰 요소는 같은 View 몸체 안에서 스크롤해 접근한다. 연결은 소스 관계이며 포함은 경계로 표현한다.
- 기능 구성: `/composition`의 전체 ID와 관계를 사용한다. Checkout 13개/17개 및 선언된 19개 프리뷰 바인딩을 유지했다. 멤버 검사와 구성 root를 분리하고, 드래그·확대·연결 근거·소스 읽기를 유지했다. 배치는 창 비율에 맞는 열 수를 선택한다.
- 이해: 타입의 모든 내부 멤버, 실제 소스, 수준별 설명, 제공/요구 계약을 표시한다. 실제 소스에 Queue/Enqueue/Dequeue가 있을 때만 FIFO 조작 예시를 제공하며 런타임 값과 구분한다. Meta 분석 후 검사 대상이 root로 바뀌던 문제를 수정했다.
- 관계 분석: 실제 가중치와 모듈 경계에서 계산한 `PᵀAP` 행렬, 종류 필터, 영향 범위, 순환/경계 수치를 표시한다. 행렬은 최대 10개 모듈을 표시하고 전체 수를 명시한다. 시안 2번의 잘못 생성된 화살촉은 코드에 복사하지 않았다.
- 분리/통합: 실제 대상과 원본 모듈 선택, 목적지/지시 입력, 소스 계약과 재사용 후보, Meta 제안 생성, 검토 이동을 전용 화면에 연결했다. 응답 전에는 가상의 변경 후 파일을 만들어 보여주지 않는다.
- 에셋: 2D/3D 스타일 PNG 생성 요청, 서비스가 검증한 생성 이미지 미리보기, 승인 가져오기, 실제 선언 사용처, 실패/승인 전/가져옴 상태를 연결했다. 여러 사용처는 같은 에셋을 가리키며 사용처끼리 연속 호출하는 것으로 그리지 않는다. GLB 메시 생성은 지원 완료로 표시하지 않는다.
- 검토/이력: 파일 변경 전후와 실제 줄 diff, 구문/해시/빌드/테스트 상태, 명령 실행 확인, 적용 차단, 승인, 이력/undo를 같은 작업면에서 제공한다.

기능 데이터와 소스는 기존 .NET 서비스가 소유한다. `desktop/ui/product.js`는 화면 구성, `product.css`는 공통 시각 규칙, `icons.js`는 아이콘, `assembly.js`는 구성의 배치/관계/조작을 담당한다. `desktop/service-client.cjs`는 Electron과 통합 검사에서 공유하는 제한된 API 전송 코드이며 이미지 원문은 검증된 PNG/JPEG의 data URL로만 전달한다.

## 검증

| 범위 | 결과 | 기록 |
|---|---|---|
| 실제 HTTP 서비스 + 렌더러 DOM 회귀 | 86개 통과 | `artifacts/desktop-dom-1793499979083/report.json` |
| 새 화면·Queue·행렬·분리/통합·에셋 흐름 | 37개 통과 | `artifacts/cohesion-contract-1793499989445/report.json` |
| 호스트 종료 후 서비스 정리 | 통과 | `artifacts/desktop-lifecycle/report.json` |
| 배포 파일 일치/예제/키 제외 | 13개 배포 코드·UI 파일 일치, TaskRunner 포함, `.env` 없음 | `artifacts/cohesion-package-check.json` |
| 최신 EXE 실행 | Windows Mojo IPC Access denied (0x5), 화면 검사 미완료 | `artifacts/cohesion-native-20261101/` |
| 실제 Meta preflight | model-list 단계 SecureConnectionError, 키 유효성 미판정 | `artifacts/cohesion-meta-preflight.json` |

37개 검사는 **명시적 loopback 모델/에셋 fixture**다. 실제 서비스의 제안·파일 작업·검증 복사본을 사용해 `dotnet build`와 TaskRunner의 Pricing/FIFO/통합 Rewards 행동 검사를 실행했다. 실제 모델의 추론 품질이나 Model API의 이미지 응답 검증은 아니다. 제품은 계속 기존 Meta Model API 기본 설정을 사용하며 모의 서버나 다른 모델로 대체하지 않는다. 86개와 합쳐 123개는 렌더러 DOM/서비스 검사 수이며 픽셀 검사 수가 아니다. 과거 서비스 214개 회귀를 이번 턴에 다시 실행했다고 쓰지 않는다.

브라우저 픽셀 검증도 시도했다. `desktop/browser-check.cjs`는 같은 UI 파일을 임시 loopback 서버에서 서비스와 연결하고 별도 Firefox 프로필로 캡처하는 도구다. 이번 세션의 Node 실행은 `spawn EPERM`이었고 별도 headless 실행도 PNG를 만들지 못했다. 해당 별도 프로세스만 생성 시각과 프로필 경로를 대조해 종료했다. 브라우저/EXE 캡처는 없으며 레퍼런스와 실제 픽셀을 비교 완료했다고 주장하지 않는다. 기본 Electron sandbox는 유지했다.

## 실행과 남은 확인

실행 파일은 `artifacts/desktop/Depth AI.exe`다. EXE와 같은 폴더의 resources/runtime이 함께 있어야 한다. 새 `samples/TaskRunner`는 실제 Queue와 Pricing 코드 및 간단한 실행 검사를 포함하며 배포 폴더에도 들어간다.

```powershell
node desktop/dom-test.cjs
node desktop/product-test.cjs
node desktop/browser-check.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-desktop.ps1 -Native
```

현재 남은 항목은 일반 Windows 환경에서 새 EXE의 8개 화면/작은 창/포인터 동작을 캡처해 시안과 비교하는 것, 실제 Meta 연결 복구 후 신규 UI에서 실제 모델 제안·생성을 검수하는 것이다. 생성 이미지와 코드만으로 시각적 일치를 확정하지 않는다.
