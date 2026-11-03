# 기능에서 다시 출발한 시각 설계

사용자 요청: 기존 레퍼런스를 참고하지 않고 프로젝트 전체의 기능과 요구를 분석해 5장 이상의 새 이미지를 만든다. 이번 산출물은 8개 화면의 시각 설계이며 런타임 수정 또는 완성 검증이 아니다. 이전 디자인 파일을 입력 이미지로 제공하지 않았다.

## 분석 범위

- 현재 제품: `desktop/main.cjs`, `preload.cjs`, `ui/`, `package.cjs`, DOM/native 검증. 일반 Windows EXE이며 Unity/MR은 폐기됐다.
- 분석 모델: `Indexer.cs`, `CompilerConfiguration.cs`, `Model.cs`, `WebAnalysis.cs`, `adapters/dart`, `adapters/web`. C# 컴파일 입력, Web/Dart 의미 관계, 추가 언어의 파일 단위 fallback과 이미지·폰트·GLB 인덱싱을 구분한다.
- 모듈 구조: `ModuleMath.cs`, `ModuleKnowledge.cs`, `ModuleDocumentation.cs`. 종류별 가중치, 호출 SCC 보존, modularity 후보, quotient graph, PageRank 문맥, fingerprint 계약과 수준별 설명을 확인했다.
- 사용 흐름: `WorkspaceIndex.cs`, `PreviewSources.cs`, `ContextTools.cs`, `McpBridge.cs`, `ApiAgent.cs`. 동일 ID의 구성·코드·에셋·프리뷰·AI 문맥과 출처 근거를 화면에서도 유지해야 한다.
- 변경: `ModuleTransformations.cs`, `Workspace.cs`, `SourceDiff.cs`, `ProjectValidation.cs`, `WorkspaceJournal.cs`. 실제 파일 생성/수정/삭제, 통합 후보, 복사본 검증, 승인 적용, 영속 이력·중단 복구·검토형 undo가 필요하다.
- 생성: `MetaModel.cs`, `MetaConfiguration.cs`, `MetaAssets.cs`, `PngValidation.cs`. 제품의 Meta 호출과 디자인용 imagegen을 구분한다. 현재 기본 생성 경로는 PNG이며 3D 스타일 이미지도 PNG다. 실제 메시 생성은 새 시안에서도 완료 기능처럼 표시하지 않는다.
- 근거 사례: `samples/Checkout`, `AcceptanceScenarios.cs`, 서비스/API·수준별 설명·변환·에셋 테스트, 데스크톱 전환/모듈 작업면 기록과 `docs/META-MODULES.md`. 과거 Unity 기능을 현재 Electron 구현으로 간주하지 않는다.

## 기능 → 화면

| 화면 | 사용자가 이해해야 할 것 | 현재 기반과 새 설계 범위 |
|---|---|---|
| 01 전체 지도 | 프로젝트의 역할별 구조, 공유 구현, 분석 대상 | graph/catalog/import 존재. 전체 지도 표현과 탐색 패널은 새 디자인 |
| 02 전체 구성 | 화면의 요소가 어떤 코드·상태·이미지로 만들어지는지 | composition/source/preview binding 존재. 선언된 프리뷰만 연결, 범용 UI 자동 복원 아님 |
| 03 모듈 이해 | 생성 이유·자료구조·사용 예·한계와 AI용 계약 | 구조화 설명과 세 수준 존재. 열린 모듈, FIFO 시각화, 계약의 읽기 면은 새 디자인 |
| 04 관계 분석 | 단순 선이 아닌 관계 종류·가중치·경계·변경 영향 | Math/Impact API 존재. 전용 수학·영향 화면과 행렬 연동은 새 디자인 |
| 05 파일 분리 | 화면 묶음이 아니라 실제 파일이 어떻게 바뀌는지 | Meta 변환/제안/diff 존재. 파일 사이 이동의 시각 표현은 새 디자인 |
| 06 프로젝트 통합 | 두 원본에서 무엇을 재사용하고 어디에 연결하는지 | 후보 비교/통합 제안 존재. 세 영역의 대응 지도와 충돌 판단 UI는 새 디자인 |
| 07 에셋 제작 | 이미지 생성 → 검토 → 가져오기 → 사용처 | 서비스 생성/가져오기 존재. 전용 Electron 제작 화면은 새 디자인. 메시 생성은 미지원 상태로 구분 |
| 08 검토와 이력 | 구조/소스 영향, 검증 결과, 승인과 되돌리기 | diff/검증/적용/undo 존재. 구조 비교와 이력의 통합 표현은 새 디자인 |

## 시각 원칙

모듈의 외형만으로 역할을 구분하고, 내부 선언·값·코드를 읽을 수 있는 면과 연결 소켓을 갖게 한다. 같은 구현은 하나의 소유 몸체로 표현한다. 전체 프로젝트, 선택 기능, 모듈 내부, 파일 변경을 서로 다른 확대 단계로 읽게 한다. 그래프가 화면의 주인공이며 숫자 대시보드가 아니다.

새 재질·색·타이포그래피는 기존 이미지에서 추출하지 않았다. 밝은 앱 외곽, 짙은 작업면, 동작/상태/구조/에셋의 역할색과 얕은 모듈 두께를 제안했다. 일반 데스크톱에서 전면 텍스트, 드래그·펼치기·확대·선택으로 구현할 수 있는 표현을 목표로 한다. 이는 시각 제안이며 사용자 승인이 아니다.

## 데이터 정확성 기준

- Checkout: ApplyCoupon은 IsValid, CalculateTotal, SetTotal, Read를 사용한다. CalculateTotal은 DiscountPercent를 참조한다. 할인 예시는 120 × (1 − 20/100) = 96이다. CartSummary도 같은 CalculateTotal을 사용한다.
- JobQueue: Add는 Enqueue, Next는 Dequeue, Count는 pending.Count다. FIFO를 설명하되 빈 큐의 예외와 실행 순서/완료 순서의 차이를 숨기지 않는다. 소스에서 해석한 이유를 원저자의 실제 생성 당시 기록으로 꾸미지 않는다.
- 파일 분리와 Rewards/Pricing 통합은 AcceptanceScenarios의 예시에서 출발한 제안 화면이다. 제안 이미지의 파일 배치가 이미 적용됐다는 뜻이 아니다.
- 가중치 calls=3, references=2, contains=0.5는 코드의 공학적 가정이다. 신뢰 확률이나 실측 성능으로 표시하지 않는다. 순환 관계 도해와 행렬은 개념 예시로 구분한다.
- generated mockup 속 이미지와 Meta 응답 문구는 디자인 예시다. 이번 이미지 제작은 built-in image_gen이며 실제 제품 Meta 생성 성공의 증거가 아니다.
- 모든 관계선·작은 글자의 정밀한 구현 명세는 소스/API와 후속 구현 계약을 기준으로 한다. 생성 이미지의 표현 오류를 새 소스 사실로 채택하지 않는다.
