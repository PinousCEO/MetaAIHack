# 데스크톱 모듈 구성 작업면 수정

사용자는 첫 Electron 화면이 모듈을 조작하는 도구가 아니라 카드 대시보드처럼 보인다며 거부했다. Unity와 MR을 제거한 결정은 유지한다. 첫 데스크톱 생성 이미지도 승인된 디자인이 아니다.

## 기준과 변경

실제로 다시 확인한 기준은 [초기 2번](../design/explorations/preview-collection-20261029/02-dark-glass-edit.png)과 [초기 3번](../design/explorations/preview-collection-20261029/03-ivory-collect.png)이다. 왼쪽 프리뷰, 오른쪽 선택 기능의 모듈 구성, 읽을 수 있는 상태값과 코드, 실제 방향 관계, 하단 모듈 라이브러리를 일반 2D 데스크톱 조작으로 연결했다. 이미지에서 장식만 추출한 새 생성 시안으로 대체하지 않았다.

- 중앙 카드 목록을 하단 라이브러리로 옮겼다. `/composition/{id}`의 모든 `memberIds`와 `relations`를 DOM 모듈 몸체와 SVG 선으로 표시한다. 임의 대표 모듈만 추리지 않는다.
- 함수·상태·타입·에셋·뷰 몸체를 구분한다. 소스 숫자와 실제 에셋, 선택 함수의 소스 발췌, 경로를 표시한다. 포트 개수는 정적 관계 수이며 런타임 입출력 값으로 표현하지 않는다.
- 구성 root와 현재 검사 대상을 구분한다. 멤버 클릭과 코드 열기는 형제 모듈과 전체 구성을 유지한다. ‘구성 펼치기’로만 별도 구성을 열고 이전 구성으로 돌아갈 수 있다.
- 연결선을 선택하면 양 끝 모듈과 kind/evidence/path/line을 보여준다. 호출·참조·뷰 연결·포함 관계를 구분한다. 정적 관계의 완전성은 인덱서 범위 안에서의 완전성이며 동적 실행 순서가 아니다.
- 모듈 드래그는 화면 배치만 바꾸고 선의 포트 좌표를 갱신한다. 빈 공간 드래그, 확대/축소, 전체 보기, 배치 초기화와 작업면 넓게 보기를 제공한다. 키보드로 모듈과 선을 선택하고 작업면을 이동할 수 있다.
- Checkout 프리뷰는 선언된 19개 바인딩의 텍스트·수치·이미지·버튼에 연결된다. 다른 프로젝트에 프리뷰 선언이 없으면 실제 타입/함수 목록을 보여주며 실행 화면을 만들어내지 않는다.
- 숫자 속성 수정은 기존 제안·diff 검토·승인 흐름을 이용한다. 승인 전 원본은 바뀌지 않는다. 분리·통합, 수준별 설명과 Meta 질문 기능을 유지했다.
- `/project-assets/{id}`는 인덱싱된 이미지의 해시·경로·크기·PNG/JPEG 시그니처를 확인해 제한된 이미지 데이터만 반환한다. 렌더러에 임의 파일 접근을 열지 않았다. 보이는 구성의 이미지만 제한된 동시 요청으로 읽는다.

주요 소스: `desktop/ui/assembly.js`, `assembly.css`, `index.html`, `app.js`, `desktop/main.cjs`, `src/Depth.Service/Workspace.cs`, `Program.cs`.

## 검증 결과

- 최신 실제 HTTP 서비스 + 렌더러 DOM: **85개 통과**. `artifacts/desktop-dom-1793495374422/report.json`. Checkout 초기 구성 **13개 모듈·17개 관계**와 실제 그래프의 ID 집합을 대조했다. 프리뷰 19개 바인딩, 이미지 바이트/변경 해시 거부, 3회 멤버 검사·소스 왕복, 드래그와 연결 좌표, 이전 구성, 순환 관계, 다른 프로젝트와 빈 프로젝트 전환, 실제 승인·undo를 검사했다.
- 서비스 전체 회귀: **214개 통과**. `artifacts/desktop-assembly-service-tests.log`. SDK host와 workstation GC를 사용했다. 새 이미지 API의 정상·오류 사례는 위 DOM/HTTP 검사의 일부다.
- 최신 EXE를 `artifacts/desktop/Depth AI.exe`로 패키징했다. 전체 폴더가 필요하며 `.env`는 번들에 복사하지 않았다.
- 실제 EXE 실행을 시도했지만 Chromium의 `mojo/public/cpp/platform/platform_channel.cc:108`에서 **Access denied (0x5)**로 종료됐다. `artifacts/desktop-native-assembly-20261101/stderr.log`와 `launch.json`에 남겼다. 통과한 native report나 캡처는 없다. 실행용 sandbox 설정을 낮추지 않았다.
- `renderer-dom.html`은 DOM 직렬화 자료이며 화면 캡처가 아니다. DOM의 조작 이벤트와 폴더 선택 모사는 실제 OS 포인터/폴더창/픽셀 검증이 아니다.
- 이번 수정에서 Meta 모델을 새로 호출하지 않았다. 이전 TLS 실패 상태를 새로운 성공으로 바꾸지 않는다.

## 남은 검증

일반 Windows 실행 환경에서 `scripts/test-desktop.ps1 -Native`로 새 EXE를 실행하고 프리뷰·모듈 구성·에셋 사용처·작은 창·집중 보기 캡처를 확인해야 한다. 새 smoke에는 이 화면의 검사와 캡처 지점이 포함돼 있다. 실제 화면 비교와 사용자의 시각적 승인, 새 UI에서의 실제 Meta 변환 호출은 아직 완료되지 않았다.
