# 프리뷰와 모듈 작업면 분리

사용자가 프리뷰와 모듈 영역이 거의 구분되지 않고 디자인도 좋지 않다고 명확히 거부했다. 이전 화면을 디자인 승인으로 취급하지 않는다. 같은 밝은 바탕과 비슷한 상자/제목을 반복했던 구성을 수정했다.

## 새 화면 구조

- **Preview**: `01 / YOUR APPLICATION` 헤더, 별도 화면 프레임, 프리뷰 전용 배경과 내부 문서, 선택 요소 표시를 가진다. 프로젝트 이미지·텍스트·값·버튼의 기존 선언 바인딩을 그대로 사용한다.
- **Module workspace**: `02 / BEHIND THE SCREEN` 헤더, 어두운 연결 작업면과 격자, 자체 보기/관계 도구줄을 가진다. 상태·로직·컨테이너·인터페이스·에셋은 역할색과 몸체를 구분한다. 글자는 Segoe UI를 사용하고 프리뷰 문서의 제목만 별도 서체를 유지한다.
- 가운데 실제 구분선을 드래그하거나 방향키로 프리뷰 비중을 **38–58%** 범위에서 바꾼다. 기본은 46%, 더블 클릭은 기본값 복원, Home/End는 양끝이다. 선택한 root/멤버/전체 관계 ID를 바꾸지 않고 비율을 저장한다. Expand는 같은 구분 비율을 이용한다.
- 데스크톱 폭에서 두 작업면은 각각 스크롤한다. 창과 헤더 크기를 측정해 남은 높이를 사용하고, 좁은 화면은 위아래로 배치한다. 상단 전역 메뉴와 모듈 작업면의 도구를 분리했다.
- 프리뷰 선택 표시와 `SOURCE BEHIND`에 같은 구성 root를 표시한다. 자식 모듈을 검사해도 원래 프리뷰 선택을 유지한다. 실제 선언/계산 코드는 기존 소스 경로에서 읽는다.
- 기존 실제 드롭 캡처에서 새 프로젝트가 이전 스크롤 위치로 열려 모듈이 화면 위로 사라지는 문제를 추가 발견했다. 프로젝트 열기 성공 후 작업면/프리뷰 스크롤을 초기화하고 이전 소스 오버레이를 닫는다.

주요 구현은 `desktop/ui/index.html`, `workspace.js`, `surfaces.css`, `app.js`다. `surfaces.css`는 기본 작업면의 프리뷰·모듈 영역을 담당하며 기존 분석/변경/에셋 기능을 그림으로 대체하지 않는다. light/dark는 외곽과 프리뷰에 적용하며 모듈 작업면은 두 테마 모두 어두운 면으로 구분한다. Unity/MR은 다시 도입하지 않았다.

## 앞선 실행에서 실제로 확인된 것

새 사용자 실행 `artifacts/desktop/resources/artifacts/desktop-smoke-2026-11-02T02-51-38-462Z/`는 **passed / 140개 / PNG 27장 / liveMetaRequested:false**였다. 실행 소스 해시 11개가 이전 드롭 패키지와 일치한다. 기록은 `artifacts/surface-prior-native-review.json`이다.

이 중 00, 18, 19-guide, 22, 23, 24의 **6장을 직접 열어 확인**했다. 모달 프레임 표식, Chromium CDP의 폴더/프로젝트 파일 드롭, 거부/원래 프로젝트 복귀는 당시 실행에서 통과했다. Windows 탐색기를 실제 손으로 끌어 놓는 자동화는 아니다. 프리뷰/모듈이 유사한 면으로 붙는 디자인 문제와 드롭 후 스크롤 문제도 확인했다. 이 27장은 **이번 영역 재설계 이전 화면**이다. 27장 전체를 이번에 직접 검토했다거나 새 디자인이 검증됐다고 확대하지 않는다.

## 새 코드 검증

- DOM + 실제 HTTP 서비스 **206개**: `artifacts/desktop-dom-1793589471167/report.json`, `artifacts/surface-dom-final-20261102.log`. 기존 19개 프리뷰 바인딩·전체 구성·소스 연결·프로젝트 전환에 구분선 키보드/포인터/저장/경계/복원, root 보존, 새 프로젝트의 스크롤 초기화를 더했다. DOM 포인터와 명시적 경로 fixture이며 실제 픽셀/OS 조작은 아니다.
- 제품 흐름 **39개**: `artifacts/cohesion-contract-1793589546243/report.json`, `artifacts/surface-product-final-20261102.log`. 실제 서비스·변경 복사본의 빌드/실행과 명시적 Meta/이미지 fixture를 사용했다. 새 Meta 호출은 없다.
- 캡처 주입식 **6개**, 모달 표식 DOM **3개**, 표면 검사 기하/색 fixture **5개** 및 변경 JS 구문 검사 통과. 표면 fixture는 경계 겹침·동일 배경·제목/도구 충돌·가로 넘침을 거부한다. 렌더링 성공으로 쓰지 않는다.
- 배포 UI/호스트/검수 코드 **34개** 해시 일치: `artifacts/surface-package-20261102.json`. 서비스·런타임은 바꾸지 않았고 `.env`를 복사하지 않았다.

## 새 실제 화면 검수는 남음

직접 실행 시도 PID 32948은 `artifacts/surface-native-20261102/stderr.log`의 Mojo IPC **Access denied (0x5)**로 종료됐다. Firefox의 실제 서비스 브라우저 캡처는 spawn EPERM(`artifacts/surface-browser-20261102.log`)이다. 별도 정적 DOM 스냅샷을 정상 보안 설정 Firefox에서 캡처하려던 시도도 PNG가 없었고 해당 probe PID 37156만 종료했다. sandbox/ACL은 변경하지 않았다.

`artifacts/surface-snapshot-20261102/index.html`은 초기 재설계의 읽기 전용 DOM 스냅샷이다. 실제 캡처나 동작하는 EXE가 아니며 최신 스크롤 보정 검증에도 사용하지 않는다.

`--smoke`는 이제 `schema: desktop-surfaces-1`을 기록한다. `surface-smoke.cjs`가 실제 Electron 포인터로 구분선을 드래그하고, 전체 ID 보존, 두 면의 경계/색 차이, 제목과 도구의 충돌, 다크 및 125% 확대를 검사한다. 3장 추가 캡처가 구현돼 있으며 실제 통과 결과는 아직 없다. 레이아웃 실패는 목록에 모아 캡처를 계속한 후 전체 실행을 failed로 만든다. 새 프레임 검사는 그대로 유지한다.

최종 수정본에 대해 사용자에게 일반 cmd 재실행을 요청했다. 새 PNG와 보고서를 직접 읽고 이어서 수정해야 한다. 기능 검사 수나 이전 27장으로 새 디자인의 시각 승인·완성을 주장하지 않는다.

```cmd
"C:\Users\dlfgu\Documents\GitHub\MetaAIHack\artifacts\desktop\Depth AI.exe" --smoke
```
