# 초기 프로토타입 검증 기록

검증일: 2026-10-29 / Windows 11 / Unity 6000.3.13f1 / .NET SDK 8.0.419.

## 통과

- `.NET Release publish`: 경고 0, 오류 0.
- `--self-test`: 15개 assertion 통과. 공유 구현 단일화, partial 타입 복수 위치, 정적 관계 근거, 승인 거부, 경로 탈출 거부, 전체 snapshot 충돌 감지, 승인 코드 적용, revision 갱신, 본문 변경·파일 이동의 C# 심볼 ID 보존, 기능 분류 유지·만료, runtime snapshot 일치·만료를 검사.
- `python tests/integration.py`: 실제 로컬 HTTP 서버에서 인증·Origin 차단, C#와 Dart 혼합 가져오기, Dart analyzer 프로세스 실행, 검색·소스 조회, 외부 변경 재분석, runtime selection 만료 통과. 산출물: `artifacts/integration-result.json`.
- `dart analyze`: No issues found. 캐시에 설치된 analyzer 10.1.0을 사용.
- Unity Windows player: 배치 빌드 성공. 런타임 bridge의 Editor 코드도 컴파일 대상에 포함.
- Windows EXE 실행: 현재 **실제 저장소**를 가져와 index JSON 생성, 공간 지도·영역 목록·inspector 표시, 종료 확인. 샘플 그래프 주입 없음. 최종 산출물: `artifacts/windows/smoke.json`, `smoke.png`, `artifacts/player-visible.log`.

## 발견 후 수정한 문제

- 빌드에서 동적으로 참조한 Unlit shader가 제외됨 → Resources material로 포함.
- 비선택 runtime 응답의 빈 body → JSON `null`로 계약을 명확히 수정.
- 화면을 숨긴 Unity 실행에서 검은 캡처 → 실제 창 표시 + Direct3D 11에서 화면 검증. 숨김 실행 결과로 UI 성공을 주장하지 않음.
- Dart 클래스 이름 API deprecation → analyzer 10.1 API로 갱신.
- 긴 모듈 경로 카드 잘림 → 카드에는 짧은 이름, inspector에는 전체 이름 표시.

## 아직 검증하지 않은 항목

- 실제 Codex 계정/모델 호출로 생성한 제안의 품질 및 end-to-end 승인 수정. CLI 실행·JSON schema·검토 UI는 구현되어 있으나 이번 검증에서는 실제 모델을 호출하지 않음. 수정 적용 경계는 모델 없는 결정적 self-test로 검증.
- 실제 게임 프로젝트 Play Mode에서 캐릭터 클릭 후 컴포넌트 매핑. Editor 어댑터 컴파일과 서비스 관찰 계약만 검증.
- Flutter UI element 선택, 대상 Unity/Flutter 빌드 및 행동 보존 테스트.
- 수천 모듈의 성능, CPU·메모리 상한, 지속 작업 복구, 병렬 외부 편집의 모든 race condition.
- API key provider, Depth MCP server, 신규 소프트웨어 생성, 두 프로젝트 통합, MR 협업.
- 토큰 절감 또는 AI 정확성 향상. 이를 뒷받침할 비교 실험은 수행하지 않음.

전체 개발 플랫폼의 완성이 아니라, 실제 소스와 연결된 첫 실행 가능한 수직 단면입니다. 다음 우선순위는 대상 프로젝트 빌드 환경 로딩, 모듈 검색 기반 에이전트 문맥 제한, 실제 프로젝트에서 AI 변경과 검증을 연결하는 것입니다.
