# 직접 실행 — 2026-10-31 19:46 후속

사용자의 “직접 실행시켜봐” 요청으로 MetaAIHack의 실제 Unity Play Mode를 실행했다. 증거는 `artifacts/unity-live-20261031-194657/`에 있다. 과거 기록의 메모리 부족은 이번 시작 시 해소돼 사용 가능한 커밋 약 9 GiB였다.

## 실제 확인

- 최신 런타임 및 Editor 스크립트를 Unity의 실제 compiler response로 컴파일 성공.
- `artifacts/service-verified-current/Depth.Service.dll --self-test` 종료 코드 0, **201 assertions passed**. 로그: `artifacts/self-test-live-recovered.log`. 회귀 검사의 fixture 항목은 실제 모델 검사와 구분한다.
- 이미 열려 있던 MetaAIHack Editor의 명시적 프로젝트 로컬 검증 명령을 통해 Play Mode 시작. 새 Unity 인스턴스는 라이선스 IPC 연결 거부와 Error 창으로 실패하여 이번에 시작한 PID 12552만 종료했다. 기존 Editor/WorldVR는 종료하지 않았다. MCP 도구는 여전히 `Transport closed`이며 MCP 복구로 표시하지 않는다.
- 실제 Play Mode에서 기본 흐름 3회/39개 검사와 **기본 .NET 전송의 실제 Meta 인증·추론** 성공. 이어 실제 Queue 분석과 초보자/숙련자 FIFO 설명 표시까지 합계 **41개 항목**이 기록됐다.
- `round-1-overview.png`, `meta-beginner-fifo.png`, `meta-expert-fifo.png`를 직접 열어 확인했다. 실제 설명은 한국어이며 Queue/FIFO, enqueue/dequeue 및 사용 이유·대안을 표시했다.

## 완료되지 않은 부분

기존 Depth 씬과 검증용 Workbench가 함께 활성화돼 화면 뒤에 이전 Checkout 모듈이 겹쳤다. 검증 setup에서 기존 Workbench를 한 번만 수집·비활성화하고, 수동 cleanup 시 복원하도록 수정했다. 테스트 코드의 컴파일은 통과했으나 이 마지막 수정본의 실행 결과는 아직 없다.

이미지 생성의 서비스 응답은 `/assets/generate` HTTP 200이었지만, Unity 이미지 표시 검사는 진행되지 않았다. 19:54 확인 시 보고서는 41개, `status=running`에 머물렀고 Editor는 프로젝트 로컬 stop 명령도 소비하지 않았다. 따라서 이미지 decode/캐시/승인 표시, 재진입 3회 및 전체 Unity 검사 완료를 주장하지 않는다. 사용자에게 Editor의 팝업/일시정지/화면 상태를 비동기로 질문했다.

`artifacts/unity-verification-command-v2.txt`에는 이 검증의 **stop**이 대기 중이다. Editor가 다시 응답하면 검증을 정리하고 Play Mode를 종료한다. 새 start 명령을 덮어쓰기 전에 현재 검증 정리를 확인한다. 원본 씬/샘플의 저장 변경은 하지 않았다. 기본 Release 잠금과 최신 EXE 빌드도 이번에 해결한 것으로 간주하지 않는다.
