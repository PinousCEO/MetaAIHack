# Unity 코드 점검과 실행 검증 상태

사용자는 MCP 연결 후 기존 코드를 최적화하고 실제 Unity에서 요청 기능을 검증하라고 했다. **이번 변경의 컴파일은 통과했으나 Play Mode 기능 검증은 완료하지 못했다.** 앞선 턴의 MCP 연결 성공을 현재 실행 성공으로 대신하지 않는다.

## 발견한 문제와 수정

| 코드 | 문제 | 수정 |
|---|---|---|
| `DepthWorkbench.ServiceExecutable` | Editor가 10월 29일 Debug 서비스를 고정 실행. 해당 DLL에는 MetaConfiguration 타입도 없고, 최신 Release는 10월 31일 빌드 | 빌드 스크립트와 같은 Release 경로 사용. 실제 서비스 실행 파일은 `DEPTH_SERVICE_EXECUTABLE`로 명시 가능 |
| `DepthSpatialField.Tick` | 연결선마다 매 프레임 List 생성·ToArray·GetComponent 반복 | 연결선별 Relation과 32개 점 배열을 보관해 재사용. FPS/GC 실측 결과는 없음 |
| `DepthSpatialField.Set` | 표시 캐시 키에 프로젝트와 연결 관계가 빠져 다른 프로젝트나 관계 변경이 반영되지 않을 수 있음 | 프로젝트 ID와 표시 관계를 캐시 키에 포함 |
| `DepthWorkbench.Api` | 단일 busy 값이 겹친 요청을 표현하지 못함. 프로젝트 전환 후 오래된 콜백이 UI를 변경할 수 있음 | 진행 중인 foreground 요청 수, 프로젝트 세대 검사, 전환 시 요청 취소. 응답 처리 오류도 실패 콜백에 전달 |
| `DepthWorkbench.Update` | 느린 activity/pending 조회가 다음 주기에 중복 실행 가능 | 각 조회가 끝나기 전 새 조회를 막고 성공/실패 때 해제 |
| `PreviewMetaImage` | 같은 이미지를 다시 열 때 이전 텍스처 교체/해제 및 닫힌 창 응답 처리가 부족 | 기존 텍스처 재사용, 교체 시 해제, 닫힌 창/이전 프로젝트의 다운로드 결과 폐기 |
| 리소스 종료 | 생성한 display camera가 소유 객체와 분리됨. 종료 후 요청/렌더 대상 정리 부족 | 카메라 소유 참조·부모 설정, 종료 시 요청 중단/해제 및 UIDocument·카메라 정리. RenderTexture 연결 해제, 중복 Dispose/종료 후 Resize 차단 |
| 모듈 얼굴 RenderTexture | Create 후 mipmap 설정 변경 | Create 전에 설정 |

Unity MCP는 개발·검증 도구이며 제품 런타임의 필수 의존성으로 추가하지 않았다. 기존 수식·색상·레이아웃과 Meta 제공자는 유지한다.

## 실제로 확인한 것

- 설치된 전체 DLL이 아니라 Unity가 생성한 `Assembly-CSharp.rsp`와 Unity Roslyn 컴파일러로 수정된 스크립트를 컴파일했다. `scripts/check-unity-scripts.ps1` 통과, `artifacts/unity-runtime-review-compile.log` 참조.
- Debug DLL은 2026-10-29 23:11, Release DLL은 2026-10-31 16:51의 산출물이었다. Debug에서 MetaConfiguration 타입 메타데이터가 없고 Release에는 존재함을 확인했다.
- `git diff --check`를 수행했다. 기존 프로젝트/샘플에 변경 적용 테스트를 하지 않았다.

## 막힌 검증

- 이번 턴의 Unity MCP 상태 명령은 수분 동안 반환하지 않았고 대기를 종료했다. 콘솔 조회와 최소 경로 조회도 각각 15초 동안 응답하지 않았다. 이는 연결 대상을 확인한 성공 응답이 아니다. 사용자에게 MetaAIHack Editor/MCP 상태 확인을 비동기로 요청했다. 새 씬 변경·Play Mode 전환은 실행하지 않았다.
- 실제 Meta `--check-meta --probe`는 model-list 단계에서 세션 프록시 `127.0.0.1:9`에 ConnectionRefused. 키 유효성/실제 추론은 미판정이며 우회하거나 다른 모델로 대체하지 않았다.
- 따라서 UI 가져오기/선택/설명/검토/적용/undo의 Play Mode 실행, 변경 후 리소스 수·GC·FPS, 실제 Meta 분리·통합·이미지 생성은 이번 결과에 포함하지 않는다. 예전 fixture 통과 수를 추가로 제시하지 않는다.

## 연결 복구 후 이어갈 순서

1. MCP로 Application.dataPath가 이 저장소의 `unity/Depth.Desktop/Assets`인지 다시 확인하고 현재 씬·dirty·Play Mode 상태를 기록한다.
2. 기존 씬을 보존하고 격리한 예제에서 최신 Release 서비스를 사용하는 실제 UI를 실행한다. Meta preflight가 실패한 경우 자동 Meta 분석을 검증 목적으로 실행하지 않는다.
3. 프로젝트 가져오기, 모듈 선택/검색/페이지/카메라 드래그, 소스/설명, 검토/검증/적용/undo와 프로젝트 전환을 조작한다. 느린 요청·종료·이미지 반복 열기의 리소스 정리도 확인한다.
4. 콘솔 오류와 실제 화면을 확인한다. Meta 호출은 연결 성공 후 실제 모델로 분리/통합/2D·3D 스타일 이미지 순서로 검증한다. GLB/MR 및 임의 프로젝트 동작 보존 완료로 확대하지 않는다.
