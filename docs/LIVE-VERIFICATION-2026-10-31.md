# 실제 Meta API·Unity 검증 — 2026-10-31 후속

**19:46 후속:** [직접 실행 기록](DIRECT-RUN-2026-10-31.md). 메모리 확보 뒤 서비스 전체 회귀 201개 통과, 실제 Play Mode 추가 실행 41개 중간 결과. 수준별 실제 Meta 설명 화면까지 확인했으나 이미지 표시와 재진입 검사는 Editor 미응답으로 아직 완료하지 못했다. 아래 메모리 차단 기록은 당시의 경과다.

이 기록은 과거의 “Meta 인증 전 연결 실패” 상태를 갱신한다. **저장된 키로 실제 모델 목록 조회, Muse Spark 추론, 모듈 설명·분리·통합, Muse Image 생성이 성공했다.** 다만 모든 프로젝트/기능의 100% 보장이나 최신 Unity 수정의 최종 검증 완료를 뜻하지 않는다.

## 확인한 실행 결과

| 범위 | 실제 결과 | 근거 |
|---|---|---|
| Meta 인증·추론 | `/models` HTTP 200, Muse Spark 실제 `OK` 응답. Unity가 실행한 기본 .NET 서비스에서도 성공 | `artifacts/meta-live-preflight.json`, `artifacts/unity-live-20261031-181204/report.json` |
| 실제 Meta 반복 검증 | 3회 모두 통과, 흐름 검사 87개. 서로 다른 할인 값·난수 입력의 독립 행동 사례 768회 실행 | `artifacts/acceptance-live-20261031-091351-eec33c3aef71422ea1eb9216d3414bf4/report.json` |
| 모듈 설명 | 실제 Queue에 대한 FIFO 설명, 초보자/숙련자별 자세함과 동일 코드 근거, 변경 없는 계약의 추가 모델 호출 0회, 재시작 후 계약 복원 | 각 회차 `catalog.json`, `beginner.json`, `expert.json` |
| 실제 소스 분리·통합 | 제안 전 원본 유지, 필수 검증 전 Apply 차단, 복사본 빌드·독립 행동 검사, 실제 파일 적용과 재실행, 기존 Pricing 재사용, donor 변경 시 차단, 검토형 undo 후 바이트 복원 | 각 회차 `split.json`, `integration.json`, `*-validation.json`, `*-applied-tests.json` |
| 실제 이미지 | 3회 × 2D/3D 스타일 = PNG 6개 생성, 검증·staging·승인 가져오기·인덱싱 성공 | 각 회차 `queue-shop/Assets/2d.png`, `3d.png` |
| 실제 Meta 채팅 | 초보자·숙련자 독립 세션 2개 통과. 실제 contract/neighborhood/explanation/source 도구 호출, 원본 소스 유지 | `artifacts/agent-live-20261031-092411/report.json` |
| Unity Play Mode | 실제 MetaAIHack Editor에서 3회, 39개 검사 통과. 원본 씬·저장소 샘플 대신 격리 복사본 사용 | `artifacts/unity-live-20261031-181204/report.json` 및 화면 PNG |

Unity 검사는 실제 실행 중인 UI 처리기를 프로그램으로 호출했다. 가져오기·모듈 검색·페이지·선택·코드 표시·수학 정보·드래그 종료·검토 diff·검증 전 Apply 비활성·복사본 빌드·적용·undo·프로젝트 전환을 검사했다. OS 마우스 자동화, 성능 수치, 사용자 시각적 승인을 뜻하지 않는다. 첫 Unity 검사는 실제 Meta 연결 확인까지 포함하며 **생성 이미지/수준별 설명 UI의 후속 시각 검사는 아직 별도**다.

이전 fixture 검사와 달리 위 Meta 반복 검사는 실제 API 응답이다. 콘솔 세션의 Windows Schannel은 `SEC_E_NO_CREDENTIALS`로 실패했지만 Python의 기본 인증서 검증 HTTPS는 성공했다. CLI 반복 검사는 명시적 `--python-https` 테스트 전송기를 사용했다. 공식 호스트·키·모델·프록시 환경을 유지하고 인증서 검증과 redirect 차단을 유지한다. 다른 모델/모의 응답으로 대체하지 않는다. 제품 기본 .NET 전송기는 바꾸지 않았으며 Unity가 실행한 서비스의 기본 전송에서도 실제 추론 성공을 별도로 확인했다.

## 실제 검사에서 발견하고 수정한 문제

1. **모델 출력 잘림:** 첫 live 분석이 `finish_reason=length`로 실패했다. Muse는 추론 토큰과 출력 토큰을 같은 한도에 포함한다. 공식 [Chat Completions 계약](https://dev.meta.ai/docs/protocols/chat-completions)에 맞춰 명시적 `reasoning_effort=medium`, 32,768 completion token 예산을 설정했다. 잘린 응답의 적용 차단은 유지했다. 수정 후 실제 3회 분리·통합 검사 통과.
2. **선택한 코드 ID와 기능 모듈 ID 혼동:** 실제 채팅이 소스 entity ID로 contract/neighborhood를 조회해 실패했다. 단일 소유 관계로 canonical module ID를 해석하고 채팅 문맥에 두 ID를 함께 제공한다. 수정 후 두 독립 실제 채팅이 관련 도구 조회에 성공했다.
3. **서비스 인스턴스 설정 불일치:** Unity가 고정 포트만 사용하던 것을 `DEPTH_PORT`/`DEPTH_STORAGE`와 일치시켰다. 최초 Unity 3회 검증에서 격리 서비스로 확인했다.
4. **Play Mode 재컴파일 후 NullReferenceException:** UI 참조가 도메인 reload 후 사라져 `Update` 예외가 발생했다. 초기화와 종료를 분리하고 `OnEnable` 복구, `OnDisable` 요청·리소스·서비스 종료, 종료 중 Update 차단, 프로젝트 경로 보존을 추가했다. 이 수정의 실제 Unity compiler response 기반 컴파일은 통과했지만 **최종 재진입/리소스 검증은 아래 환경 문제로 미완료**다.

## 남아 있는 차단과 검증

- Unity 재컴파일 후 MCP 라우팅이 WorldVR로 여러 차례 바뀌었다. 모든 변경 명령은 MetaAIHack `Application.dataPath` 검사를 통과해야 실행하도록 했다. WorldVR는 변경·종료하지 않았다. 공식 relay의 `--project-path` 고정 접속은 현 세션에서 named pipe 접근 거부로 사용할 수 없었다. 후속 상태 조회가 멈춘 뒤 마지막 읽기 호출은 `Transport closed`로 실패했다.
- 약 18:35 측정에서 Windows 메모리 사용률 92%, 사용 가능한 커밋 약 85–90 MiB였다. 전체 self-test 첫 실행은 compiler fixture 실패, 재실행은 해당 검사를 통과한 뒤 OOM으로 중단됐다. **이번 전체 회귀 검사 통과를 주장하지 않는다.** 출력 예산 변경 후 Meta 대상 회귀 80개는 앞서 통과했다. 이후 ID 대응의 두 회귀 항목은 전체 검사 중 통과했지만 전체 완료는 아니다.
- 최초 domain reload에서 이미 소유 참조를 잃은 테스트 서비스 PID 39740(18:12:05 시작, 격리 포트 43829)이 Release 실행 파일/DLL을 잠갔다. 현 세션의 해당 프로세스 종료는 접근 거부였다. 따라서 최신 서비스는 `artifacts/service-verified-current/`에 별도로 빌드했다. 기본 `bin/Release/net8.0`이 최신이라고 간주하지 않는다. 사용자가 테스트 서비스/Editor 상태를 정리한 뒤 일반 Release 빌드를 다시 해야 한다.
- `DepthPlayModeChecks`는 `Depth/Verification/Run three Play Mode rounds`로 명시적으로 실행한다. 후속 버전은 실제 Meta 설명/이미지 UI와 disable/enable 자원 정리도 검사하도록 확장했지만 이 확장분은 아직 통과 결과가 없다. 실행 예약 파일은 메모리 부족 상태에서 새 작업이 시작되지 않도록 제거했다.
- 마지막 소스 점검에서 재활성화 시 이전 snapshot/필터/레이아웃 값도 초기화하도록 보완했다. 재시작한 서비스의 import가 끝나기 전에 이전 상태를 준비 완료로 판단하지 않게 한다. 이 마지막 보완은 메모리 복구 후 컴파일·실행 확인이 필요하다.
- 실제 GLB 메시 생성, MR 기기 런타임, 임의 언어/프로젝트의 자동 병합 및 범용 행동 보존은 위 검사에 포함되지 않으며 완료가 아니다. 3D 스타일 PNG를 편집 가능한 3D 메시라고 표현하지 않는다.

## 재개 명령

메모리를 확보하고 MetaAIHack Editor를 활성화한 뒤, 테스트 인스턴스가 종료되어 파일 잠금이 풀렸는지 확인한다.

```powershell
dotnet build src/Depth.Service -c Release --disable-build-servers -p:UseSharedCompilation=false
powershell -ExecutionPolicy Bypass -File scripts/check-unity-scripts.ps1
# 정상 Windows HTTPS 환경: 기본 실제 API 전송
powershell -ExecutionPolicy Bypass -File scripts/test-acceptance.ps1 -Rounds 3
# Schannel 사용 불가인 현재 CLI 환경에 한해 명시적 실제 HTTPS 테스트 전송
powershell -ExecutionPolicy Bypass -File scripts/test-acceptance.ps1 -Rounds 3 -PythonHttps
```

이미 통과한 실제 3회 검사를 이유 없이 반복하지 않는다. 다음 우선순위는 수정된 Unity의 재진입/자원 정리·실제 생성물 표시, 일반 Release 재빌드, 미완료 전체 회귀 검사다.
