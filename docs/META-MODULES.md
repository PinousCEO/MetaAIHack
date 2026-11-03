# Meta 모듈·소스 변환·생성 — 2026-10-31

제품의 모듈 이해/분리/통합과 이미지 생성은 **Meta Model API**로 수행한다. Codex는 저장소 개발 도구다. **실제 Meta 추론·분리·통합·이미지 생성은 아래 후속 검증을 통과했다. 최신 Unity EXE와 임의 프로젝트의 자동 통합·행동 보존을 보장하지 않는다.**

최신 [실제 Meta·Unity 검증](LIVE-VERIFICATION-2026-10-31.md): 실제 API로 3회/87개 검사, 독립 행동 사례 768회, PNG 6개 및 실제 채팅 2세션 통과. 실제 Unity 첫 3회/39개 통과 후 reload 오류를 수정했고, 후속 검사는 메모리 부족과 MCP 연결 종료로 미완료다. [이전 fixture 검증](ACCEPTANCE-2026-10-31.md)의 199개 self-test와 이번 실제 API 결과를 구분한다.

## 최신 정정 — 사용자 제공 Meta API 키 사용

사용자는 직접 제공한 키를 `.env`에 저장하고 프로젝트에 필요한 Meta API 모델을 사용하라고 명시했다. 이전의 “Llama API 키로 이미지 생성 불가, Chameleon/SAM 서버 필요” 안내는 **과거 SDK를 근거로 한 잘못된 안내**였다. [현재 공식 개요](https://dev.meta.ai/docs/overview)와 [모델 목록](https://dev.meta.ai/docs/models)을 확인해 기본 연결을 수정했다.

- 기본 주소: `https://api.meta.ai/v1/`. 코드·모듈 작업은 `muse-spark-1.3`, 이미지는 `muse-image-1.0`. 두 기능은 같은 `MODEL_API_KEY`를 사용한다. 사용자 계정의 모델 접근 권한은 실제 연결 검사로 확인해야 한다. 다른 제공자로 자동 대체하지 않는다.
- 실제 키는 루트 `.env`에 저장했으며 `.gitignore`로 제외했다. `.env.example`에는 비밀 값이 없다. `.env`와 `.env.*`(example 제외)는 검증 복사본에도 포함하지 않는다. 키는 문서·로그·응답·이력에 기록하지 않는다.
- `MetaConfiguration`이 서비스 시작 시 `.env`를 읽고, 환경 변수 값이 있으면 우선한다. `DEPTH_ENV_FILE`로 정확한 경로를 지정할 수 있다. 키를 환경 변수로 재배포하지 않는다. 저장된 키는 공식 `api.meta.ai/v1`에만 사용하며 자체 서버/worker에 전달하지 않는다.
- `scripts/run.ps1`과 Unity 서비스 시작 코드가 설정 경로를 전달한다. `/meta/config`는 모델·주소·키 설정 여부만 반환하며 키를 UI로 반환하지 않는다.
- [공식 이미지 API](https://dev.meta.ai/docs/api-reference/images/create-image)의 `/images/generations`로 PNG를 받고 기존 검토·승인 가져오기를 사용한다. 기본 UI는 `Generate 2D image`, `Generate 3D-style image`이며 둘 다 **PNG**다. 입체적 그림과 편집 가능한 3D 메시를 구분한다. 현재 확인한 Model API에는 GLB 생성 엔드포인트가 없다.
- SAM/Chameleon은 필수가 아니다. 이전 worker 코드는 호환 기록으로 보존하되 `protocol=worker`를 명시한 경우에만 실행하며 기본 UI에서 제거했다. 현재 제품 설정은 로컬 모델 가중치나 GPU를 요구하지 않는다.

연결 확인: `powershell -ExecutionPolicy Bypass -File scripts/check-meta.ps1`. `-Probe`는 모델 목록 확인 후 작은 텍스트 추론을 한 번 호출한다. 과거 `artifacts/meta-api-connection.json`, `artifacts/meta-api-check.json`은 인증 전 실패 기록이다. 후속 `artifacts/meta-live-preflight.json`과 위 실제 검증 기록에서 사용자 키의 인증·추론·이미지 생성 성공을 확인했다. CLI Schannel 문제와 Unity 기본 .NET 성공은 구분하며, 프록시/인증서 검증을 해제하지 않았다.

## 설계 이유와 설명 수준 — 후속 사용자 요구

모듈의 목적만 적지 않고 **사용한 개념, 작동 방식, 이 코드에서 선택한 이유, 작은 예시, 대안, 주의점, 정확한 코드 인용**을 함께 저장한다. `ModuleDocumentation.cs`의 version 2 구조를 Meta 분석 스키마로 요구한다. Queue가 실제 소스에 있을 때 FIFO/선입선출과 enqueue/dequeue를 설명하도록 지시하며, 이름만 보고 자료구조나 원작자의 의도를 지어내지 않도록 한다. 소스 인용은 해당 모듈에 실제 제공한 발췌문과 일치해야 저장된다. 인용 일치 검사는 설명 자체의 의미적 정확성을 증명하지 않는다.

- **초보자**: 용어 정의 → 동작 → 사용 이유 → A/B/C 같은 작은 예시 → 대안·주의점. 예시는 실행한 테스트와 구분한다.
- **중급자**: 동작 방식과 선택 이유를 중심으로 대안·주의점을 읽는다.
- **숙련자**: 선택과 이유를 요약하고 대안·주의점을 유지한다.
- **AI**: 같은 기록의 개념·핵심 이유·제약·근거를 압축 계약으로 읽는다. 초보자용 정의·예시는 기본 문맥에서 제외하며 `modules.explanation`으로 요청할 수 있다. 실제 토큰 절감 측정은 하지 않았다.

수준을 바꿔도 동일한 fingerprint·코드 근거·가정을 사용하며 모델을 재호출하지 않는다. HTTP 요청의 최신 소스 검사에는 기존 인덱서 스캔이 포함된다. 설명 난이도는 **읽는 사람의 숙련도**이며 모델의 사고량/정확도 설정이 아니다. 단순 에셋에는 불필요한 기술 설명을 강제하지 않는다.

Unity `Modules → 모듈`의 `설명 수준`에서 선택한다. 선택한 소스의 Notes/Details에도 연결했다. 선택은 PlayerPrefs에 저장되고 Meta 채팅에도 전달된다. `이 모듈 설명 분석 / 갱신`은 해당 모듈만 분석 대상으로 지정한다. 분석된 기록은 sidecar에 저장하며 코드에 장문의 주석을 자동 삽입하지 않는다. 기존 캐시에 상세 설명이 없으면 `needs-explanation-upgrade`, 소스가 달라지면 `stale`로 표시한다.

기존 코드를 읽고 쓴 생성 이유는 `inferred-from-source`로 표시한다. Meta가 채팅 또는 split/integrate 제안을 만들 때 쓴 `reason`은 서비스가 부여한 모델 정보와 함께 영속 제안·적용 이력에 보관한다. 모듈 설명에서는 해당 파일의 적용 기록을 `recorded-meta-proposal`로 별도 표시한다. 파일 해시가 달라진 기록은 `historical`이다. 수동/외부 CLI 변경을 Meta가 만든 것으로 표시하지 않는다. 기록은 파일 단위이며 특정 선언의 원래 작성 의도를 소급 증명하지 않는다. 최근 프로젝트 변경 100건 중 관련 이유 최대 8건을 표시한다.

## 앱 흐름

1. `.env` 또는 `Connections`에서 Meta Model API를 설정한다. 기본 주소는 `https://api.meta.ai/v1/`이며 `.env` 키는 서비스가 사용한다. 자체 Llama 서버는 compatible protocol을 명시적으로 선택한다. 이전 api.llama.com 연결은 legacy 호환 경로다. 다른 제공자로 자동 대체하지 않는다. 외부 CLI/MCP는 별도 경로다.
2. 연결된 상태에서 import하면 최대 4회 자동 분석한다. `Modules → Analyze / continue`로 다음 배치를 진행한다. 미분석/오래된 설명 개수와 complete를 구분하며 예산 소진을 완료로 표시하지 않는다.
3. 모듈별 목적/책임/입출력/부작용/불변 조건/가정/근거 ID와 수준별 설계 이유를 읽는다. 설명은 프로젝트별 sidecar 계약으로 저장한다. 화면과 MCP/Meta가 같은 근거와 사실을 읽는다.
4. `Split into source files`와 `Integrate project`에서 실제 create/replace/delete 제안을 만든다. diff를 검토하고 **대상 빌드와 행동 테스트를 모두 설정·실행**해야 Apply할 수 있다. profile의 RequirePass=false로도 이 조건을 우회할 수 없다.
5. `Create asset`에서 같은 Meta 키로 Muse Image를 호출해 2D/3D 스타일 PNG를 만든다. 결과는 staging에서 검토 후 승인 import한다. 덮어쓰기는 없다. 이전 GLB 자산 이력은 내보내기만 지원하며 **GLB 앱 내 렌더러는 아직 없다.**

## 수학 표현

`ModuleMath.cs`는 종류별 희소 방향 행렬 A_kind를 구성한다. 호출 3, 참조/생성 2, 상속 1.5, 포함 0.5 등의 가중치는 공학적 사전 설정이다. 정적/관찰 계수 1, 추정 0.25, 미확인 0이며 같은 관계의 여러 위치는 `1 + log(siteCount)`로 합친다. 학습된 확률이 아니다.

- 호출 SCC를 압축해 상호 재귀를 같은 단위로 유지한다.
- `W=A+Aᵀ`, `d_i=Σ_j W_ij`, `2m=Σ_i d_i`에 대해 `Q=Σ_c[internal_c/(2m)−γ(volume_c/(2m))²]`의 증가량으로 최대 30회 결정적 이동을 한다. 기본 크기 48, 큰 SCC는 유지한다. 전역 최적해 보장은 없다.
- 소속 행렬 P의 각 행은 정확히 한 모듈을 가리킨다. 공유 구현 ID는 한 번만 소유하며 방향/종류는 `Pᵀ A_kind P`로 보존한다.
- conductance는 `cut(c)/min(volume(c),volume(rest))`. 빈 그래프도 유한 값으로 처리한다.
- restart 0.2의 personalized PageRank, 최대 60회로 관련 모듈을 정렬한다. 기본 12개, 약 24,000자 이내의 이웃 계약을 반환하고 생략을 표시한다. 문자 수는 토큰 측정치가 아니다.
- Meta는 구조적 후보 안의 경계를 다듬고 설명한다. 누락/중복/발명 ID와 SCC 분할은 거부한다. 소스·관련 인터페이스·분석 설정 fingerprint가 바뀌면 stale, 같으면 모델 재호출 없이 캐시를 복원한다.

인덱서는 변경 확인을 위해 파일을 스캔한다. **LLM의 반복적인 전체 저장소 입력을 피하는 구조**이지 디스크 스캔 제거가 아니다. 미확인 관계가 없다고 기능적 독립성이 증명되지 않는다. 동적 호출/미해석 라이브러리/설정/어댑터에 따른 누락과 토큰·비용·정확도 실측이 남는다.

## 소스 분리·두 프로젝트 통합

프로젝트당 최대 16개 완전한 파일/120,000자, 결과 32개 파일/240,000자다. 초과 시 조용히 자르지 않고 범위를 좁히도록 거부한다. 알려진 의존성을 확장한다. includeDependencies=false는 API의 명시적 선택이다.

재사용 후보는 공개 이름/종류 토큰의 Jaccard 유사도로 계산한다. 타입 호환성이나 행동 동등성 증명이 아니다. Meta가 계약과 실제 소스로 대상의 공유 구현을 재사용하는 변경을 제안한다. 기존 파일은 제공한 대상 범위에서만, 새 파일은 destination 아래에서만 변경할 수 있다.

대상 project ID/revision/해시와 donor revision 및 설정까지 포함한 입력 fingerprint를 검사한다. donor가 바뀌면 검토/Apply를 차단한다. provenance는 서비스가 부여하며 모델이 지정하지 못한다. 제안과 함께 영속화한다. 승인 전 원본을 쓰지 않으며 적용/복구/undo는 기존 journal을 사용한다.

빌드/테스트 통과는 그 명령 범위의 증거다. 패키지/빌드 설정 자동 병합, Unity .meta GUID 재배선, 캡처된 C# 소스 inventory 변경, 범용 행동 보존은 미지원이다. 필요한 설정은 제안 이유에 남기고 별도로 해결해야 한다.

## 언어 범위

- C#: Roslyn 및 명시적 csproj 입력. Unity asmdef 전용 로더 없음.
- Dart: 설정된 analyzer의 resolved 선언/관계. JS/TS/JSX/TSX: 설정된 TypeScript compiler 어댑터.
- Python, Go, Rust, Java, Kotlin, Swift, C/C++, Ruby, PHP, Lua, GDScript, HTML/CSS, Vue/Svelte, SQL, shell/PowerShell: **파일 단위 fallback**. 함수/타입/호출 의미 분석이 아니며 추측 관계를 만들지 않는다. Meta 파일 설명/변환에 사용할 수 있다.
- 다른 확장자/임의 바이너리/모든 실행 환경을 보편적으로 지원하지 않는다. 엔티티가 없으면 Meta 분석을 완료 처리하지 않는다. 어댑터 미설정/실패 진단을 확인해야 한다.

## API

| 경로/도구 | 기능 |
|---|---|
| GET /modules/catalog | 계약·수학 지표/관계·미분석 개수 |
| POST /modules/analyze | connection, projectId, revision, maxCalls(1–64), maxMembers, 선택적 moduleIds로 분석. moduleIds 생략/빈 배열은 전체 대상 |
| POST /modules/explanation | id, projectId, revision, level(beginner/intermediate/expert). 모델 재호출 없이 수준별 설명·생성 기록 반환 |
| POST /modules/source | path로 donor와 재사용 후보 읽기 |
| POST /modules/transform | kind=split/integrate, moduleIds, instruction, destination, connection. 통합에는 sourceRoot/sourceRevision |
| modules.catalog / modules.contract / modules.neighborhood | 화면과 같은 사실의 압축 계약. contract는 depth-module-contract/v2이며 긴 학습용 설명은 생략 |
| modules.explanation | id, revision, level. HTTP/Unity와 동일한 수준별 설명. 기존 8개와 합쳐 MCP 12개 |
| GET /meta/config | 공개 설정: endpoint/model/imageModel/keyConfigured. 키 반환 없음 |
| POST /agent | 기본 meta는 현재 Model API, 자체 서버 meta-local, 과거 Llama meta-legacy. 자동 fallback 없음 |
| GET /assets / POST /assets/generate | 이력/생성. 기본 connection.protocol=meta-api, kind=image, style=2d/3d, prompt. 둘 다 PNG |
| GET /assets/{id}/content / POST /assets/import | 검토 파일, 승인/current snapshot/새 destination으로 import |

## 실행 환경과 검증

코드 작업은 [현재 Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions), 이미지는 [Muse Image](https://dev.meta.ai/docs/image-generation)의 공식 API 계약을 사용한다. 과거 Llama SDK와 [worker](../adapters/meta-assets/README.md)는 명시적 호환 경로다. worker의 /generate는 자체 API이며 공식 이미지 API와 구분한다.

현재 사용자가 제공한 Meta 키를 `.env`에 저장했다. 실제 Meta 호출은 네트워크 연결 실패로 아직 검증하지 못했다. Muse API 사용에 로컬 가중치나 32 GiB GPU는 필요하지 않다. 이전 SAM 하드웨어 제한은 기본 기능의 요구 조건이 아니다. Qwen 등으로 대체하지 않았다.

로컬 실제 검증을 위해 workspace의 artifacts/meta-llama에 별도 Ollama 서버를 만들고 Meta Llama 3.2 3B 다운로드를 시도했다. registry.ollama.ai 연결이 세션 프록시 127.0.0.1:9에서 거부되어 manifest 단계에서 실패했다. 프록시 설정을 변경하지 않았고 임시 서버는 종료했다. 모델 다운로드/추론 성공이 아니며 artifacts/meta-llama/attempt.json에 기록했다. 기존 Ollama 서버와 Qwen 모델은 건드리지 않았다.

- 서비스 **189 assertions**, artifacts/self-test-model-api.log: 현재 Meta API 계약·`.env` 키 범위·공개 설정 비노출·Muse Image PNG staging/import·3D 스타일 표시·미지원 GLB의 자동대체 거부·검증 복사본 비밀파일 제외 16개를 추가했다. 이전 설명/생성 이유/분리/통합 검사도 유지한다. Meta 응답은 fake이며 실제 복사본 빌드/실행 검증과 구분한다.
- tests/meta_workspace.py: 실제 HTTP/MCP 수준별 설명 동등성, 압축 계약의 동일 근거, compatible transport, split 제안/gate, GLB 전달→검토→에셋 등록. **LLM/GPU 응답은 fixture**다.
- 수준별 설명 추가 전 저장소 전체를 읽어 220개 파일, 5,749개 엔티티, 17,951개 관계를 처리했다. 수학적 후보 1,281개, Q=0.58275, 미작성 Meta 설명 1,281개였다. source-only 진단 103개가 남았다. refresh를 포함한 catalog 요청은 이 환경에서 29.08초였다. artifacts/meta-repository-analysis/result.json/catalog.json에 저장했다. 이 수치를 의미 분석 정확도·실행 성공·Meta 분석 완료로 해석하지 않는다.
- 기존 HTTP/MCP/복구·undo, Web compiler/복사본 tsc, Dart resolved 관계 검증도 재실행해 통과했다. Dart 테스트가 Flutter batch wrapper에서 timeout되어 네이티브 dart.exe를 자동 선택하도록 수정하고 통과를 확인했다.
- Unity runtime script 참조 컴파일과 worker Python 구문 컴파일 통과. 새 EXE/렌더링/OS 클릭은 미검증.
- 실제 Meta 설명/분리/통합/생성 품질, worker GPU 실행, 모든 프로젝트의 동작 보존, GLB 앱 내 렌더링, MR 런타임은 미검증/미완료다.
