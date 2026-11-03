# Meta asset worker

**이 코드는 이전 선택형 연구 모델 어댑터다. 현재 Depth 기본 이미지 생성은 Meta Model API의 Muse Image이며 SAM/Chameleon 설치가 필요하지 않다.** [현재 설정](../../docs/META-MODULES.md)을 따른다. 이 worker를 의도적으로 사용할 때에만 아래를 적용하고 connection.protocol을 `worker`로 지정한다. 과거 GLB 이력과 코드를 보존하기 위해 남겨 두었다.

Depth 자체 worker API다. Meta 호스팅 API라고 가정하지 않는다. 공식 모델을 별도 환경에 설치하며 다른 생성기/가짜 출력으로 대체하지 않는다.

## Chameleon PNG

[공식 Chameleon 저장소](https://github.com/facebookresearch/chameleon)의 설치/모델 접근 절차를 따른다. CUDA와 Chameleon Research License가 적용된다. 이 코드는 모델 이용권을 제공하지 않는다. 공식 ChameleonInferenceModel/Options/generate/decode_image를 호출한다.

chameleon.example.json을 복사하고 설치한 모델의 절대 경로를 지정한다. 해당 모델 환경에서:

```sh
python worker.py --config /absolute/chameleon.json --check
python worker.py --config /absolute/chameleon.json --port 43901
```

--check는 경로/패키지 확인이며 GPU 추론 성공이 아니다. 모델은 첫 생성 요청에서 로드된다.

## SAM 3D GLB

[공식 설치 문서](https://github.com/facebookresearch/sam-3d-objects/blob/main/doc/setup.md)의 Linux/CUDA, 최소 32 GB VRAM과 접근 승인 체크포인트를 준비한다. sam3d.example.json에 repository/pipeline의 절대 경로를 지정한다.

```sh
python worker.py --config /absolute/sam3d.json --check
python worker.py --config /absolute/sam3d.json --port 43902
```

[공식 inference](https://github.com/facebookresearch/sam-3d-objects/blob/main/notebook/inference.py)에 이미지와 같은 크기의 흰색 전경 마스크를 전달하고 [pipeline GLB](https://github.com/facebookresearch/sam-3d-objects/blob/main/sam3d_objects/pipeline/inference_pipeline.py)를 내보낸다. 텍스트만 받는 3D API가 아니다. 생성한 PNG를 프로젝트에 가져오고 마스크를 준비해 사용할 수 있다.

## 앱 연결

Modules → Create asset에서 각각 http://127.0.0.1:43901/ 과 http://127.0.0.1:43902/ 를 입력한다. 원격 서버는 HTTPS reverse proxy 뒤에 둔다. 원격 바인딩은 DEPTH_META_ASSET_TOKEN 환경 변수가 필요하며 앱 worker key에 같은 값을 넣는다. 키를 JSON/Git에 저장하지 않는다.

- GET /health: configured-not-loaded / loaded. 생성 품질 인증이 아니다.
- POST /generate: protocol=depth-meta-assets/v1, kind=image/object3d, prompt/seed, 필요한 imageBase64/maskBase64.
- 응답: protocol, provider=meta, model=chameleon/sam-3d-objects, format=png/glb, contentBase64.
- 서버당 한 작업. 동시 요청 409, 모델 오류 422. stderr에서 진단한다.
- 입력당 8 MiB, 요청 24 MiB, 출력 64 MiB. 앱은 PNG 청크 CRC·구조·크기, zlib 압축 해제/체크섬과 스캔라인 길이·필터를 검사한다. GLB는 2/mesh 포함 여부를 검사한다. 전체 색상 해석·렌더링·생성 품질 보장이 아니다.
- 앱 요청 취소/시간 초과가 원격 GPU 작업을 중단시키지는 않는다.

현재 PC는 모델/가중치·GPU 조건이 없어 실제 추론을 실행하지 못했다. tests/meta_workspace.py는 명시적 fixture이며 live Meta 검증이 아니다.
