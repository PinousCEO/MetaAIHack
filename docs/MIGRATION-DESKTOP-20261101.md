# Unity/MR 제거와 Windows 데스크톱 전환

**후속 정정:** 아래 첫 카드 UI와 생성 이미지는 사용자가 거부했다. 현재 화면과 검증 결과는 [모듈 구성 작업면 수정](DESKTOP-ASSEMBLY-20261101.md)을 따른다. 아래 29개 검사는 첫 전환 당시 기록이다.

사용자가 Unity와 MR을 명시적으로 폐기하고 모듈 분리·탐색 중심의 EXE를 요청했습니다. 과거 공간·큐브·MR 시안을 구현 목표로 삼지 않습니다.

## 변경

새 클라이언트는 Electron이며 기존 독립 .NET 서비스를 사용합니다. 왼쪽 파일/모듈 목록, 중앙 모듈 카드와 소스/관계/문맥, 오른쪽 설명과 Meta 입력을 구현했습니다. 다크 블루 표면, 얇은 경계와 선택 강조는 imagegen으로 생성한 [새 UI 기준](../design/references/desktop-20261101/module-workspace.png)을 따릅니다. 이미지 내 수치·샘플 코드는 설계 예시이고 실행 화면의 데이터는 실제 graph/catalog를 사용합니다.

새 기능 연결: 프로젝트 선택과 재시작 복원, 파일/모듈 검색, 멤버 소스 읽기, 관계 근거와 AI 문맥, 이해 수준 저장, Meta 분석/질문, 실제 파일 분리/두 프로젝트 통합 제안, 변경 diff, 검증 프로필/명령 실행 승인, 적용 차단, 승인 적용, 이력/undo 제안. 서버의 모델·근거·revision/해시 검사를 유지했습니다.

활성 unity 디렉터리와 run-spatial.ps1/check-unity-scripts.ps1/unity-mcp.py/build-macos.sh/package-macos-runtime.py는 제거했습니다. 미커밋 작업을 잃지 않도록 artifacts/retired-unity-20261101에 보관했으며 새 제품이나 패키지에서 참조하지 않습니다. 과거 캡처·이미지와 실행물도 역사적 자료이며 새 EXE로 취급하지 않습니다.

## 산출물

- 실행: artifacts/desktop/Depth AI.exe — 전체 desktop 폴더를 함께 사용.
- 빌드: scripts/build.ps1. Unity 불필요.
- 실행 스크립트: scripts/run.ps1 [-ProjectPath ...].
- 새 클라이언트: desktop/.
- 기준 이미지/프롬프트: design/references/desktop-20261101/.
- 기존 README/아키텍처 기록: docs/history/.

NuGet 접근이 실패해 self-contained restore는 중단했습니다. 대신 서비스의 framework-dependent publish를 완료하고 설치된 공식 .NET 8 실행 런타임을 앱에 동봉했습니다. 앱 실행을 위해 외부 .NET 설치는 필요하지 않으며 프로젝트 자체를 빌드할 SDK는 별개입니다.

## 이번 검증

1. 서비스: 전체 214 assertions 통과. artifacts/desktop-service-tests-sdk.log. 처음 bundled runtime으로 실행한 검사는 대상 빌드 검증에서 실패했으며, SDK host를 명시한 최신 실행이 통과했습니다.
2. 새 renderer DOM + 실제 서비스: 29개 통과. 최신 artifacts/desktop-dom-1793494442639/report.json. 소스/관계/문맥 3회 반복, 검색, 실제 복사본 적용/undo, 검증 프로필과 필수 검증 차단, 원본 프로젝트 통합 목록, 프로젝트 교체, 소스 HTML 비실행을 확인했습니다. DOM 환경의 폴더 선택과 dialog 동작을 모사한 부분을 OS 포인터/네이티브 폴더창 검사로 확대하지 않습니다. 부모 EXE 종료 시 서비스 자동 종료도 desktop/lifecycle-test.cjs로 별도 통과했습니다.
3. EXE 패키징 완료. 실행을 실제로 시도했으나 Windows Mojo IPC가 Access denied로 중단됐습니다. Edge headless도 같은 오류입니다. 기본 보안 설정을 낮춘 앱으로 배포하지 않습니다. 실제 렌더링·크기별 캡처·imagegen 기준과의 시각 비교는 아직 확인하지 못했습니다.
4. Meta 모델 목록/작은 추론 preflight는 TLS SecureConnectionError로 인증 판정 전에 실패했습니다. 키를 출력하지 않았으며 다른 모델·호스트·프록시 우회 또는 fixture로 성공 처리하지 않았습니다. 새 UI를 통한 실제 Meta 분리/통합 성공을 주장하지 않습니다.

## 다음 검증

일반 Windows 데스크톱에서 scripts/test-desktop.ps1 -Native를 실행하면 격리된 Checkout 복사본으로 EXE 검증을 수행하고 artifacts에 캡처를 남깁니다. 실제 화면을 기준 이미지와 비교하고, Meta 연결 검사 성공 후 새 클라이언트에서 분리·통합 제안과 변경 검토를 검증해야 합니다. 완성된 모든 기능, 범용 행동 보존, 사용자 디자인 최종 승인으로 기록하지 않습니다.
