# 실제 기능 재검증 · 화면 캡처 미완료

> 후속 정정: 사용자가 EXE를 실행해 실제 캡처 13장이 생겼고, 그중 이전 프레임이 저장된 오류와 UI 표시 오류를 확인해 수정했다. 아래 PNG 0장/외부 실행 미응답은 당시 기록이다. 최신 결과와 `--smoke-live` 재실행 상태는 [실제 화면 검토](DESKTOP-NATIVE-REVIEW-20261101.md)를 먼저 읽는다.

사용자는 구현 설명이나 EXE 링크 대신 이미지를 보여 주고, 요청한 기능을 정확히 확인하기 전에는 완료라고 말하지 말라고 요구했다. **현재 전체 제품은 미완료다. 실제 앱 화면 캡처와 시안 대비 검수는 여전히 실행 환경에서 막혀 있다.** Unity/MR로 돌아가지 않는다.

## 이번에 발견하고 수정한 문제

- 첫 실제 Meta 실행은 인증·짧은 추론을 통과했지만 모듈 설명 검증에서 실패했다. 기존 오류 문구는 이름/목적/근거 오류를 합쳐 표시했으므로 그 실행의 정확한 하위 원인은 단정하지 않는다. `ModuleKnowledge`의 지시에서 같은 모듈의 ID만 근거로 쓰도록 명확히 하고, 오류를 구분했다. 소스 검증에 실패한 설명은 같은 호출 예산 안에서 한 번만 다시 생성하며 검증을 약화하거나 ID/인용을 임의로 고치지 않는다. 예산 소진·지속 실패·소스 변경 시 저장하지 않는다.
- 실제 FIFO 설명의 예시에 일본어 조각이 섞인 문장을 발견했다. 한국어 문장과 소스 인용을 점검하도록 프롬프트를 보완하고, 별도 실제 Queue 설명과 수준별 대화를 다시 생성해 읽었다. 이 한 예제의 언어 품질 확인을 모든 미래 모델 응답의 품질 보장으로 확대하지 않는다.
- 키 설정만으로 헤더에 초록색 점이 켜지던 동작을 수정했다. 시작은 `확인 전`, 모델 목록과 짧은 추론이 모두 성공해야 `연결됨`, 이후 실패하면 이전 성공 표시를 지운다.
- 네이티브 검증기에 남아 있던 구형 분리 모달 검사를 전용 화면 검사로 바꾸고 13개 화면의 PNG·부분 진행 보고서·HTML 갤러리를 저장하도록 했다. **이 검증기 자체의 실제 Electron 실행 통과는 아직 없다.**

## 실제 결과와 범위

| 검사 | 결과 | 근거 |
|---|---|---|
| 실제 Meta 모델 목록·텍스트 추론 | 성공 | 아래 실제 acceptance/agent 보고서 |
| 실제 Meta 모듈 분석·분리·통합·undo·PNG | 3회차, 흐름 87개 통과 | `artifacts/acceptance-live-20261101-023956-04f2093029644d8697c95de14fc56771/report.json` |
| 독립 동작 검사 | 복사본/적용본에서 768개 사례 통과, FIFO 역전 음성 대조는 실패하여 적용 차단 | 위 폴더의 회차별 validation, applied-tests 기록 |
| 실제 Meta 이미지 | 2D 3개 + 3D 스타일 3개 PNG 생성·승인 가져오기, 원본 6장 직접 확인 | 각 `round-N/queue-shop/Assets/` |
| 보완한 실제 Queue 설명·대화 | 구조화 설명과 초보자/숙련자 두 도구 대화 통과, 원문 직접 읽음 | `artifacts/agent-live-20261101-024646/` |
| 서비스 전체 회귀 | 217개 통과 | `artifacts/screen-review-service-tests.log` |
| 최종 프롬프트의 Meta 대상 회귀 | 85개 통과, fixture | `artifacts/screen-review-final-meta-tests.log` |
| 렌더러 DOM + 실제 HTTP 서비스 | 90개 통과, 연결 표시 응답은 명시적 fixture | `artifacts/desktop-dom-1793500981012/report.json` |
| 제품 흐름 | 37개 통과, 모델/이미지 응답은 fixture, 실제 파일·복사본 빌드/실행 | `artifacts/cohesion-contract-1793501046882/report.json` |
| 새 배포 파일 | 앱/UI/서비스 14개 소스 일치, `.env` 0개 | `artifacts/screen-review-20261101/report.json` |
| 최신 EXE 실행 | Mojo IPC Access denied (0x5), PNG 0장 | `artifacts/desktop-native-screen-review/` |
| 기본 .NET Meta 전송 | model-list 단계 SecureConnectionError | 최종 DLL의 `--check-meta --probe` 재실행 |

실제 Meta 검사는 명시적으로 선택한 **인증서 검증 Python HTTPS 전송**을 사용했다. 공식 호스트·저장된 키·Muse Spark/Muse Image를 사용했고 모의 응답이나 다른 제공자로 대체하지 않았다. 이것은 **새 EXE의 기본 .NET 전송 성공**을 증명하지 않는다. 3회차 검사는 `service-screen-review` 빌드이며, 이후 한국어 프롬프트 수정은 `service-screen-review-final`의 별도 실제 설명/대화 검사로 확인했다. 최종 배포 DLL은 후자와 일치한다. 위 검사들은 일부 범위가 겹치므로 총합을 기능 개수로 쓰지 않는다.

첫 실패 기록은 `artifacts/acceptance-live-20261101-023538-b3dc4830a82f46f08bdc7efcd22da7e7/report.json`에 보존했다. 생성된 이미지·보고서 갤러리는 [실제 검증 결과](../artifacts/screen-review-20261101/index.html)다. **그 갤러리의 PNG는 Meta 생성 에셋이며 앱 UI 캡처가 아니다.**

## 아직 충족하지 못한 요구

- 실제 EXE의 배치·가독성·모션·창 크기별 화면과 OS 포인터 조작은 미검증이다. Chrome도 동일 Mojo 접근 거부, Firefox 기본/소프트웨어 렌더링도 캡처 없이 대기했다. 이번에 시작한 프로세스만 정리했다. 보안 격리를 끄지 않았다.
- 새 EXE에서 기본 전송으로 실제 Meta를 호출하는 흐름은 미검증이다. Python 경로의 서비스 검사와 혼동하지 않는다.
- GLB 등 실제 3D 메시 생성은 미구현이다. 3D 스타일 PNG를 메시 생성 완료로 취급하지 않는다.
- 임의 언어/프로젝트의 의미적 분리·통합과 동작 보존을 보장하지 않는다. Python 등은 파일 단위 fallback이 있으며, 프리뷰 요소 연결은 선언된 바인딩이다. 모든 프로젝트의 실행 UI를 자동 발견하는 기능이 아니다.
- 설명은 소스에 연결된 외부 모듈 계약/문서 캐시에 저장한다. 모든 원본 코드에 인라인 주석을 자동 삽입했다고 주장하지 않는다.

## 화면 검수 재개

사용자에게 현재 세션의 IPC 접근 거부 때문에 일반 Windows PowerShell에서 아래 한 번의 실행을 요청했다. 아직 실행 완료 응답이나 캡처가 없다. 실행 권한을 다시 승인받으려는 것이 아니라 현재 도구에서 시작되지 않는 네이티브 검사를 이어가기 위한 요청이다.

```powershell
& ".\artifacts\desktop\Depth AI.exe" --smoke
```

기본 출력은 `artifacts/desktop/resources/artifacts/desktop-smoke/`의 `report.json`, `index.html`, PNG다. 실패 보고서와 실제 픽셀을 모두 읽어야 한다. 네이티브 검사도 Meta 호출은 하지 않으므로, 이후 앱 기본 전송으로 설명·분리·통합·이미지 생성까지 확인해야 전체 데스크톱 검수 범위가 채워진다. 원본 프로젝트 대신 격리한 예제를 사용한다.
