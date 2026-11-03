# 외부 Windows 실행 · 실제 화면 검토

## 14:19 후속 — 두 번째 실행 확인과 실제 Meta 출력 중단

사용자가 재실행한 결과는 `artifacts/desktop/resources/artifacts/desktop-smoke-2026-11-01T05-13-01-399Z/`다. 기본 화면 13장의 새 프레임 표식 검사를 통과했고 모두 직접 열어 확인했다. 제목/구성 개수 복원, 모듈 선택, 이미지 사용처 구성, 소스 관계, 검토 화면, 작은 창과 집중 보기의 장면이 이제 맞게 저장된다. [두 번째 실제 캡처](../artifacts/desktop/resources/artifacts/desktop-smoke-2026-11-01T05-13-01-399Z/index.html).

EXE의 **기본 .NET 전송에서 실제 모델 목록과 짧은 추론은 성공**했다. 이후 JobQueue 분석은 `Meta inference did not complete the requested output: length`로 실패했다. `live-report.json`은 `stage=module-explanation`, `status=failed`다. 정상 기본 캡처 13장과 실패 화면 1장이 있으며 전체 보고서의 57개 검사에는 실패 캡처 표식 검사도 포함된다. 이 숫자를 전체 성공으로 쓰지 않는다. 이번 네이티브 실행에서는 분리/통합/생성까지 도달하지 않았다. 실패 화면의 FIFO 도식은 소스에 기반한 개념 예시이며 실제 Meta 설명이 아니다.

수정한 처리는 잘린 응답을 저장하지 않고, 모듈 분석의 기존 총 호출 예산과 최대 한 번의 교정 범위 안에서만 짧고 완전한 설명을 재요청한다. ID/정확한 소스 인용/구조 검사와 스냅샷 검사를 유지한다. 출력이 계속 잘리거나 예산이 한 번이면 실패로 남는다. `content_filter`는 재요청하지 않는다. 문서 프롬프트는 같은 개념을 멤버마다 반복하지 않고 하나의 구조화 설명을 수준별로 재사용하도록 보완했다.

화면에서 발견한 에셋 이미지 잘림은 grid의 최소 크기/이미지 경계로 제한하고, 변경 전후 코드의 글자 대비를 높였다. 다음 native 검증은 이미지 디코딩 완료와 실제 이미지 영역이 프리뷰 안에 들어오는지도 검사한다. 이 추가 수정의 실제 픽셀과 실제 모델 응답은 재확인이 필요하다.

검증 결과: 전체 서비스 **224개**, Meta fixture **92개**(`artifacts/native-length-meta-tests.log`), DOM **94개**(`artifacts/desktop-dom-1793510073574/report.json`). truncation 후 회복, 1회 예산 차단, 반복 중단의 2회 상한, 필터 응답 미재시도를 포함한다. 이 검사는 실제 모델 성공이 아니다. 새 서비스 `artifacts/service-native-length-fix/`를 데스크톱 번들에 반영했다. 앱 파일 12개와 DLL 일치, `.env` 제외를 `artifacts/native-length-verification.json`에 기록했다.

수정본 EXE를 현재 도구에서도 시작해 봤으나 Mojo IPC 0x5로 종료됐다(`artifacts/native-length-agent-20261101-141844/stderr.log`). 도구의 기본 .NET preflight도 SecureConnectionError다. 사용자 외부 실행의 성공을 이 도구 환경의 성공으로 혼동하지 않는다. 사용자에게 같은 `--smoke-live` 명령의 새 실행을 요청했다. 아래 첫 실행/재실행 대기 내용은 이 후속 이전의 기록이다.

사용자가 cmd에서 EXE를 실행한 뒤 `실행됨`이라고 응답했다. `artifacts/desktop/resources/artifacts/desktop-smoke/`에 실제 Electron 캡처 13장과 내부 검사 40개 통과 기록이 생겼다. **실제 화면 파일은 확보했지만 전체 기능이나 시각적 검수가 완료된 것은 아니다.** Unity/MR로 돌아가지 않는다.

## 첫 실행의 화면 문제

- 프로젝트 지도, 모듈 이해, 관계 분석 화면은 실제 화면으로 확인했다. 이해 화면의 설명은 이 실행에서 Meta를 호출하지 않아 아직 없는 상태다.
- `05-integration.png`, `06-assets.png`, `07-feature.png`는 SHA-256이 모두 `ea39ffb68d9fae754095603507c4df3fde88c2188007ae24c3198811b0ebfbf8`로 같다. 에셋/기능 구성 화면의 증거로 사용할 수 없다. 이후 선택·소스·검토·집중 보기 캡처도 이전 화면이 남았다. DOM 상태만 바뀌고 캡처가 이전 프레임을 반환하는 문제를 실제 픽셀에서 발견했다.
- 관계 분석에서 기능 구성으로 돌아오면 13개 노드/17개 관계를 표시하면서 제목과 개수는 이전 관계 분석의 17개/23개로 남았다. 숨겨진 그래프의 크기 갱신도 다른 화면의 하단 확대율을 덮었다.
- 기능 묶음에 코드와 이미지가 함께 있을 때 대표 이름이 `mug.png`가 됐다. 작은 창의 전체 보기에서는 글씨가 너무 작았고 좌측 메뉴 아래쪽에 가로 스크롤이 보였다.

첫 캡처/보고서는 수정하거나 덮어쓰지 않았다. 내부 검사가 통과했다는 이유만으로 실패한 캡처를 성공으로 바꾸지 않는다. [첫 실제 캡처](../artifacts/desktop/resources/artifacts/desktop-smoke/index.html)는 수정 전 기록이다.

## 수정과 확인 범위

- `product.js`는 기능 구성으로 돌아올 때 root의 제목/실제 구성 개수/선 안내를 복원한다. 대표 이름은 설명 → 클래스 → 메서드 → 나머지 코드 → 에셋 순으로 고른다. 라이브러리와 검사창도 같은 함수를 쓴다.
- `assembly.js`는 숨겨진 그래프에서 전역 확대율을 갱신하지 않는다. 축소 상태에서는 모든 노드와 관계를 유지하면서 이름 크기를 보정하고 작은 부가 문구를 숨긴다. 좌측 하단 조작은 줄바꿈하도록 했다. **수정 후 실제 픽셀 확인은 다음 실행에서 해야 한다.**
- 네이티브 검증기는 캡처 직전에 고유한 8px 색상 표식을 그리고, 캡처 픽셀에서 같은 색을 확인해야 PNG를 저장한다. 표식은 검증 실행에만 있다. 원본 화면을 합성하거나 이미지 편집으로 바꾸지 않는다. 화면 이름/선택 ID/root/새 프레임 확인 여부를 보고서에 남긴다. 새 실행은 별도 시각 폴더에 저장한다.
- DOM 회귀 **94개** 통과: `artifacts/desktop-dom-1793503113459/report.json`. 실제 서비스 + DOM이며 연결 표시 응답은 명시적 fixture다. 새 회귀에는 헤더 복원, 숨겨진 그래프의 확대율 오염, 코드/에셋 대표 이름, 축소 가독성 모드가 있다.
- 제품 흐름 **37개** 통과: `artifacts/cohesion-contract-1793503113482/report.json`. 실제 파일과 복사본 빌드/실행을 사용하되 Meta/이미지 응답은 fixture다. 픽셀이나 실제 모델 성공을 대신하지 않는다.
- 수정본을 `artifacts/desktop/Depth AI.exe`에 패키징했다. 앱 핵심 파일 12개의 배포본 일치와 CSS 파싱을 확인했다. 키는 번들에 복사하지 않는다.

## 실제 Meta까지 이어지는 외부 재실행

사용자에게 cmd에서 아래 명령으로 시작해 달라고 요청했다. 현재 도구 환경의 Electron 시작은 Mojo IPC 접근 거부가 남으므로, 외부 Windows에서 시작하는 단계만 필요하다. 새 실행 결과가 생기면 보고서와 픽셀을 직접 읽는다.

```cmd
"C:\Users\dlfgu\Documents\GitHub\MetaAIHack\artifacts\desktop\Depth AI.exe" --smoke-live
```

`--smoke-live`는 기본 화면 검사 후 앱의 기본 .NET 전송으로 공식 Meta 모델 목록과 짧은 추론부터 확인한다. 성공해야 별도 TaskRunner/Rewards 프로젝트를 만든다. 실제 Queue/FIFO 수준별 설명, Pricing 파일 분리, Rewards 통합, 복사본 빌드/동작 검사, 승인 적용과 undo, 실제 2D/3D 스타일 PNG의 화면 표시와 승인 가져오기를 진행한다. 모델 응답을 fixture나 Python 전송으로 자동 대체하지 않는다. 선택 창에는 검증용 폴더만 주입하며 사용자 원본 프로젝트를 바꾸지 않는다.

새 결과 경로는 `artifacts/desktop/resources/artifacts/desktop-smoke-<시각>/`이다. `report.json`과 `live-report.json`의 `running`을 통과로 취급하지 않는다. 검증은 버튼 처리 자동화이며 OS 포인터 검증은 아니다. 모델 호출·제안 검증·코드 동작·화면 중 하나라도 실패하면 해당 단계의 실패를 보존한다.

이 기록 작성 시점에는 재실행 결과가 아직 없다. 실제 GLB 메시, 임의 언어/프로젝트의 의미적 재구성·동작 보존, 임의 실행 UI 자동 발견, 모든 원본 코드에 인라인 주석 삽입, 사용자 최종 디자인 승인을 완료로 기록하지 않는다. 이전 실제 Meta 3회/87개/768개 사례 및 PNG 6장은 [이전 서비스 검증](DESKTOP-VERIFICATION-20261101.md)의 범위와 전송 경로를 유지한다.
