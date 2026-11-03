# 실제 예제 프로젝트 반복 검증 — 2026-10-31

**요청한 모든 기능이 100% 동작한다고 확인된 상태는 아니다.** 아래 예제의 실제 코드·검토·적용·실행 경로는 반복 검증했고 발견한 PNG 검사 결함을 수정했다. 실제 Meta 모델의 추론·이미지 생성과 최신 Unity 플레이어 실행은 환경 문제로 검증하지 못했다. 이 둘을 모의 응답이나 참조 컴파일 성공으로 대신하지 않는다.

**후속 정정:** 사용자가 실제 호출 확인을 우선하라고 지적했다. 이제 live 모드는 모델 목록과 작은 실제 텍스트 추론이 성공하기 전 예제를 생성하지 않는다. 새 재실행은 프록시 `127.0.0.1:9` 연결 거부로 **0회** 종료됐다. 아래 96회는 이전 동작의 원본 실행 기록이다. Unity MCP의 실제 응답 대상도 MetaAIHack이 아닌 WorldVR로 확인됐다. [연결 감사](../artifacts/connection-audit-20261031.json)를 참조한다.

## 직접 만든 프로젝트와 검증 방법

`AcceptanceScenarios.cs`가 매 회차 별도 폴더에 두 개의 실제 .NET 8 프로젝트를 생성한다.

- `queue-shop`: `Program`, `JobQueue`, `Pricing`이 한 파일에 있는 콘솔 프로그램. Queue의 FIFO, 빈 큐 예외, 중복 값, 가격 계산을 실행한다.
- `reward-plugin`: 독립 빌드 가능한 클래스 라이브러리. 보상 계산 `Rewards`와 별도 가격 구현 `DonorPricing`을 갖는다. 통합 시 대상의 `Pricing`을 재사용하고 보상 CLI 기능을 추가한다.
- `oracle.py`: 모델 편집 대상 밖에 둔 기대값 검사기. 회차별 난수 시드 1/2/3과 가격 규칙을 바꾸며 실제 `dotnet App.dll`의 출력과 독립 계산 결과를 비교한다. 마지막에 검사기 파일 해시가 유지됐는지도 확인한다.

검증 복사본에서 빌드·실행한 뒤 실제 예제 소스에 적용하고, 적용된 프로젝트 자체도 다시 빌드·실행한다. 원본 예제·제안·복사본 검증 로그·적용 결과를 모두 `artifacts/acceptance-*`에 남긴다. 기존 사용자 프로젝트에는 테스트 변경을 적용하지 않았다.

## 완료한 결과

최종 **3회 모두 통과**했다. 회차당 작업 흐름 검사 29개, 총 **87회 검사**와 **768회 행동 사례 실행**이다. 768은 서로 다른 기능 수가 아니라 각 단계에서 같은 기대 동작을 반복 실행한 횟수다.

| 단계 | 회차당 행동 사례 실행 | 모델 응답과 실제 작업의 구분 |
|---|---:|---|
| 최초 예제 실행 | 32 | 실제 원본 프로그램 |
| Queue 파일 분리 검증 / 적용 후 재실행 | 32 + 32 | 분리 제안은 명시적 fixture, 실제 파일·빌드·실행 |
| 두 프로젝트 통합 검증 / 적용 후 재실행 | 48 + 48 | 통합 제안은 명시적 fixture, 기존 동작 및 보상 계산 실행 |
| 통합 되돌리기 검증 / 적용 후 재실행 | 32 + 32 | 실제 검토형 undo 및 소스 바이트 복원 |
| 합계 | 256 × 3 = 768 | 실제 Meta 추론 성공 횟수가 아님 |

추가로 각 회차에서 확인한 내용:

- 수학적 분할의 소유 ID 누락/중복 없음, 실제 Queue 소스를 인용한 FIFO 설명, 초보자/숙련자의 동일한 근거와 다른 자세함.
- 변경 없는 계약 조회의 모델 호출 0회, 워크스페이스 재시작 후 캐시 복원. 설명 내용은 fixture이며 실제 모델 설명 품질은 미검증.
- 검증 전 Apply 차단, 분리 후 단일 Queue 구현, 통합 후 단일 Pricing 구현 재사용.
- 일부러 FIFO 출력을 역순으로 만드는 **컴파일 가능한 오류**를 주입: 빌드는 성공했지만 기대 `A|B|C`와 실제 `C|B|A`가 달라 행동 검사가 실패하고 Apply가 차단됨.
- 통합 donor를 외부에서 수정하면 이미 통과한 검증으로도 적용 불가. 원본 복원 후 정상 적용.
- 2D/3D 스타일 PNG의 staging → 승인 import → 실제 에셋 ID 연결. 총 6개 파일을 별도 Pillow 디코더로 검증. 이것은 **1×1 PNG fixture**이며 실제 생성 화질·스타일 검증이 아님.

[최종 기계 판독 보고서](../artifacts/acceptance-fixture-20261031-074141-6b770c24b2dd4ff498a113ae920b9d73/report.json), [단계별 실행 횟수·독립 이미지 디코딩 결과](../artifacts/acceptance-fixture-20261031-074141-6b770c24b2dd4ff498a113ae920b9d73/independent-verification.json), [첫 회차 실제 프로젝트](../artifacts/acceptance-fixture-20261031-074141-6b770c24b2dd4ff498a113ae920b9d73/round-1/queue-shop/App.cs).

## 발견하고 수정한 결함

기존 PNG 검사는 헤더와 크기만 확인해 **IDAT 체크섬이 틀린 PNG fixture도 통과**시켰다. 실제 디코더 검사에서 재현했다. `PngValidation.cs`를 추가해 청크 CRC/순서/크기, 압축 해제, 스캔라인 길이/필터, zlib 체크섬을 검사한다. .NET 압축 스트림이 잘린 체크섬 끝부분을 허용하는 경우도 별도 검사로 차단했다.

잘못된 fixture를 정상 PNG로 교체했다. 손상 데이터·기존 손상 fixture·잘못된 필터·부족/초과 픽셀·잘못된 zlib 체크섬·잘린 스트림은 거부하고, 팔레트·16비트 회색조·Adam7 PNG는 수락하는 회귀 검사를 추가했다. 전체 색상 해석이나 렌더링 품질을 보장하는 검사는 아니다.

첫 시나리오 실행에서는 테스트가 Roslyn 엔티티 종류를 `Class`로 잘못 비교해 중단됐다. 실제 계약인 `NamedType`으로 고친 뒤 위의 3회 검증을 완료했다. 이 최초 실패를 제품 분리 실패나 통과 결과로 숨기지 않는다.

## 함께 재실행한 검사

- 전체 서비스 **199 assertions 통과**: `artifacts/self-test-acceptance.log`.
- 마지막 코드 정리 후 Meta 관련 **80 assertions 통과**: `artifacts/meta-acceptance-final.log`. 실제 모델 호출은 없음.
- 실제 HTTP/MCP, 수준별 설명 일치, 검토/적용/재분석/재시작/undo: `tests/meta_workspace.py`, `tests/native_workspace.py` 통과. 로그는 `artifacts/meta-workspace-acceptance.log`, `artifacts/native-acceptance-final.log`.
- Dart resolved 관계, Web TypeScript compiler/JSX 및 복사본 `tsc` 검사 통과. `artifacts/dart-workspace-acceptance.log`, `artifacts/web-graph-728d8f68a7/`.
- 서비스 Release 빌드 경고 0/오류 0, Unity 런타임 스크립트 참조 컴파일 통과 (`artifacts/unity-scripts-acceptance.log`).

## 아직 확인되지 않은 것

| 항목 | 이번 실제 결과 |
|---|---|
| 사용자 키의 실제 Meta 호출 | 공식 `/models` 연결이 인증 전에 실패. 키 유효성 미판정. [live 보고서](../artifacts/acceptance-live-20261031-073912-0715a75a877a47f28395de4fc98592d0/report.json)는 `blocked`이며 fake로 자동 전환하지 않음 |
| 실제 모델 설명/분리/통합/이미지 품질 | 위 연결 실패로 미검증. Live 모드에서도 원본 예제 3회, 총 96개 행동 사례는 별도로 실행했으나 모델 단계는 수행하지 못함 |
| 최신 Unity EXE·화면·클릭 흐름 | 새 빌드 재시도는 `Upm-35440` IPC에 30초 내 연결하지 못해 exit 1. `artifacts/acceptance-unity-build.log`. 기존 EXE를 새 수정본으로 취급하지 않음 |
| 편집 가능한 GLB 메시 / MR 런타임 | 미완료. 3D 스타일 PNG 성공과 구분 |
| 어떤 프로젝트든 자동 통합·행동 보존 | 보장하지 못함. 현재 검증은 작은 C# 예제이며 패키지/설정 병합, Unity GUID 이동, 추가 언어의 의미 분석과 대규모 성능 등의 범위는 별도 |

연결 제한을 우회하거나 다른 모델로 대체하지 않았다. 사용자 키는 기존 `.env`에서 사용하며 문서·로그에 출력하지 않는다.

## 재현

```powershell
# 기본값: 실제 Meta API, 3회. 연결 후에는 텍스트/이미지 호출 사용량이 발생한다.
powershell -ExecutionPolicy Bypass -File scripts/test-acceptance.ps1

# 명시적 모의 Meta 응답 + 실제 파일 변경/빌드/실행 검사
powershell -ExecutionPolicy Bypass -File scripts/test-acceptance.ps1 -Fixture -Rounds 3
```

각 실행은 새 `artifacts/acceptance-*` 폴더와 `report.json`을 만든다. 성공은 exit 0, 검사 실패는 1, 실제 Meta 연결 실패는 2다. 최신 EXE의 시각적 검증은 별도로 필요하다.
