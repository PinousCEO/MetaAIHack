# 실제 도킹 작업면과 프리뷰 ↔ 모듈 선택

사용자는 도킹 레퍼런스를 승인하고 실제 앱에 반영하도록 요청했다. 또한 프리뷰의 요소와 모듈을 양방향으로 선택하고, 선택한 모듈과 무관한 프리뷰 요소는 흐려져야 한다고 명시했다. 이 문서는 **Electron UI 0.6.0의 실제 구현** 기록이다. 레퍼런스 승인과 새 EXE의 실제 픽셀 검수 완료는 구분한다.

## 구현한 동작

- Preview / Modules / Hierarchy / Console / Meta CLI / Details / Source의 일곱 패널을 이동·도킹·탭 묶기·분할 조절·접기·최대화·닫기/복구할 수 있다. 기본 배치는 큰 왼쪽 프리뷰, 오른쪽 모듈, 얇은 왼쪽 하단 콘솔, 오른쪽 하단 탐색 영역이다. 레이아웃 자동 저장과 별도 Save layout / Saved layout, 기본 복원, CLI at right와 Preview focus 프리셋이 있다.
- 탭을 끌면 가장자리 분할 또는 중앙 탭 결합 안내가 나온다. 작업영역 전체 가장자리에도 도킹한다. `⋯` 이동 메뉴와 키보드 구분선 조작을 지원한다. 플로팅은 **앱 작업영역 안**의 이동 패널이다. OS 별도 창과 다중 모니터 분리는 구현하지 않았다.
- 기존 실제 Meta 입력·응답·전송 버튼, 소스, 코드/설명, 검토 화면의 DOM을 그대로 이동한다. 숨긴 탭도 DOM에 보존하여 ID·초안·서비스 이벤트 연결을 잃지 않는다. Console은 실제 앱 상태 로그와 `/help`, `/clear`, `/refresh`, `/inspect 이름`, `/layout reset` 명령을 제공한다. Meta 대화는 별도 Meta CLI 패널에서 한다. 임의 셸 실행 기능은 아니다.
- 선언된 프리뷰의 이미지·텍스트·가격·합계·버튼을 누르면 해당 바인딩의 전체 모듈 구성과 연결을 연다. 바탕이나 빈 공간은 화면 전체 View를 선택한다. 닫힌 Modules 패널도 다시 연다. 빠른 연속 선택은 마지막으로 누른 요소를 처리한다.
- 모듈을 선택하면 해당 모듈의 역방향 정적 소스 의존성을 따라 실제 프리뷰 바인딩을 찾는다. 관련 요소는 밝게 남고 나머지 선택 대상은 opacity 0.18로 흐려진다. 흐려진 대상도 클릭과 키보드 선택이 가능하다. `Show all` 또는 Escape로 해제한다. 모션 줄이기 설정과 시스템 설정을 따른다.
- 프리뷰 아래에 화면 이름·선택 모듈·관련 요소 수와 모든 일치 요소의 이동 버튼을 표시한다. 이동 버튼은 선택한 소스 모듈을 유지하면서 해당 요소로 스크롤/포커스한다. 툴팁에는 실제 관계 ID로 구성한 소스 경로를 표시한다. 하이어라키는 실제 파일/소유 선언, 검색, 최근 모듈을 제공한다.
- 소유 관계 `contains` 및 공통 화면 `view-owner`를 의존 관계로 잘못 따라가 화면 전체를 관련 있다고 표시하지 않는다. 타입 선택은 실제 소유 멤버들을 출발점으로 사용한다. 관련 선언이 없으면 `No declared preview relationship`을 표시하며 연결을 만들어 내지 않는다.
- 프리뷰의 상품과 요약을 폭에 따라 나란히 배치하여 총액이 과도하게 아래로 밀리는 문제를 줄였다. 기존 Field Guide / Route Atlas / Orbit, 영어 기본·테마·프로젝트 드롭·분리·통합·소스/설명·변경 검토 기능을 유지한다.

## 적용 범위

현재 프리뷰는 `depth.preview.json` 어댑터가 제공하는 화면이다. Checkout의 **19개 선언 바인딩과 화면 바탕**을 검사했다. 임의 프로젝트의 실행 창이나 DOM을 자동 발견하는 기능, 다중 실행 화면의 자동 캡처/전환, 동적 런타임 실행 추적이 추가된 것은 아니다. 프리뷰가 없는 프로젝트도 실제 모듈/소스를 탐색하지만 UI 관계를 꾸며서 표시하지 않는다.

선택의 근거는 인덱싱된 소스 관계이며 Meta의 내부 추론이나 런타임 실행 순서로 표시하지 않는다. 이번 변경은 UI와 검수 코드이며 새 실제 Meta 호출, 3D 메시 생성, 임의 프로젝트의 의미 보존을 검증한 작업이 아니다. Unity/MR 폐기는 유지한다.

## 확인한 결과

|검사|결과와 기록|증명 범위|
|---|---|---|
|실제 HTTP 서비스 + 렌더러 DOM|**243개 통과**, `artifacts/desktop-dom-1793602669297/report.json`|19개 바인딩, 전체 구성 ID, 정적 역방향 연결, 흐려진 요소 재선택, 모든 위치 이동, 연속 클릭, 닫힌 패널 복구, 원래 Meta 입력 노드/초안 보존, 기존 소스/검토/드롭 흐름|
|제품 흐름|**39개 통과**, `artifacts/cohesion-contract-1793602750034/report.json`|실제 서비스·복사본 빌드/실행·분리/통합·적용/undo·PNG 가져오기. 모델/이미지 응답은 명시적 로컬 fixture|
|순수 관계/도킹 모델|**10개 통과**, `desktop/preview-links-test.cjs`|직접/간접 연결, 타입, 순환, 소유 관계 배제, 미연결/어댑터 없음, 일곱 패널 보존|
|드롭|**23개 통과**, `artifacts/project-drop-1793602339790/`|기존 preload/경로/DOM 흐름. 실제 OS 포인터 드롭 성공으로 확대하지 않음|
|검수 프로토콜|**20개 입력 사례 통과**, `desktop/visual-review-test.cjs`|허용된 화면/패널/프리셋/크기 요청만 수락|
|검수기 fixture|기존 6개 기하/3개 모달/5개 경계, 레이아웃 없는 DOM 거부|실제 픽셀 성공이 아님. 새 도킹 경계 검사기도 레이아웃 없는 DOM을 실패 처리|
|배포 일치|**46개 파일 SHA-256 일치**, `artifacts/docking-package-20261102.json`|기존 EXE가 읽는 실제 앱/UI/검수 코드를 갱신. 런타임과 서비스는 변경하지 않음. 패키지 `.env` 없음|

이 수치는 중복 범위를 포함하므로 기능 개수 또는 실제 모델/픽셀 검수 개수로 합산하지 않는다. 마지막 직접 Node 실행은 `artifacts/docking-dom-verified.log`, 종료 코드 **0**은 `artifacts/docking-dom-exit.json`에 남겼다. 최종 모델/검수기 검사도 별도 Node 직접 실행으로 확인했다. 125%에서 이전 작은 창용 `body` 높이 규칙이 도킹 작업면을 축소하지 않도록 고정하고, 구성의 Previous 버튼을 숨긴 옛 헤더에서 실제 모듈 헤더로 옮겼다. 이 후속 수정까지 최종 243개 결과에 포함된다.

## 실제 화면 검수는 대기

이번 직접 실행 PID **39572**는 `artifacts/docking-native-20261102/stderr.log`에 **Mojo IPC Access denied (0x5)**를 남겼다. `visual-review-2026-11-02T06-52-42-117Z/`에는 ready/PNG가 없다. 치명 오류 후 이 시도의 PID만 종료했다. sandbox·권한·인증서 설정을 낮추지 않았다. 이전 UI의 PNG를 새 도킹/강조 화면의 증거로 사용하지 않는다.

배포 후 사용자에게 일반 cmd에서 다음을 실행하고 창을 유지하도록 비동기로 요청했다. 응답/새 ready.json은 아직 없다.

```cmd
"C:\Users\dlfgu\Documents\GitHub\MetaAIHack\artifacts\desktop\Depth AI.exe" --visual-review
```

검수 모드는 격리된 Checkout 복사본을 사용한다. 정상 앱에는 수신기가 없다. `artifacts/desktop/resources/artifacts/visual-review-<시각>/ready.json` 생성 후 같은 폴더의 제한된 `request.json`으로 실제 포인터 선택과 캡처를 이어간다. 기존 프로토콜에 `workspace: default|cli|preview`, `panel: preview|modules|hierarchy|console|chat|details|source`를 추가했다. 임의 JS·셸·Meta 호출·소스 변경은 받지 않는다.

```json
{"id":"01-total","workspace":"default","view":"feature","theme":"light","layout":"guide","previewKey":"total","width":1600,"height":1000,"zoom":1}
```

```json
{"id":"02-calculation-focus","moduleName":"CalculateTotal"}
```

`--smoke`의 schema는 `desktop-docking-focus-1`이다. 새 검수기는 실제 포인터 구분선 조절·Meta CLI 탭 드래그·콘솔 접기·역방향 강조 opacity·흐려진 이미지 선택·테마·125%와 추가 캡처를 수행하도록 구현했다. **검수기 구현과 실제 실행 통과는 다르다.** 실제 새 PNG에서 기본/재배치/다크/작은 창/125%의 가독성과 겹침을 검수한 뒤에만 시각적 완료를 판단한다.

### 직접 검수 후 스크린샷만 전달하라는 후속 요청

사용자가 에이전트에게 직접 실행·검수하고 스크린샷만 보내라고 요청했다. 배포 EXE를 기본 보안의 `--visual-review`로 직접 재실행했으나 PID 33784는 다시 Mojo IPC 접근 거부 0x5로 종료됐다. 기록은 `artifacts/direct-screen-20261102-163902/attempt.json`, `stderr.log`다. `visual-review-2026-11-02T07-39-02-654Z/`에 ready 없음·PNG 0장임을 확인했다. 현재 실행 중인 Depth 창도 없다. 새 실제 화면을 확보하지 못했으며 같은 실행 요청을 사용자에게 반복하지 않았다. 보안 설정·제품 코드는 바꾸지 않았다.
