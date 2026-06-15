# Changelog

이 프로젝트의 주요 변경 사항을 기록합니다.

## 6.0.0

이전 published 버전(5.0.0) 대비 호환성에 영향을 주는 변경이 포함되어 메이저로 올립니다.

### WASM 코덱 제거 (Breaking)

WASM 가속 경로를 전면 제거하고 인코딩/디코딩 hot path를 순수 JavaScript 비트팩으로
단일화했습니다. 측정 결과 WASM의 이득은 16KB 이상·비표준 charset·`preloadWasm()` 선행
호출이라는 좁은 조건에서만 +10~30%로 제한적이었던 반면, Rust 툴체인·약 19KB 임베드
바이너리·로더 상태머신·JS/Rust 이중 유지보수 비용이 컸습니다. 표준 Base64 charset은
네이티브 Base64 fast path로 계속 가속됩니다.

5.0.0에 존재하던 다음 공개 API가 제거되었습니다:

- 함수: `preloadWasm`, `getWasmCodec`, `getWasmCodecSync` (모든 진입점)
- 생성자 옵션: `wasmThreshold`
- 타입: `WasmCodec`
- `getCharSetInfo()` 반환 필드: `wasmThreshold`

#### 마이그레이션

- `preloadWasm()` 호출은 **삭제**하면 됩니다. 사전 로드 없이 동기/비동기 인코딩이
  그대로 동작합니다.
- `wasmThreshold` 옵션은 **삭제**하면 됩니다. 무시되던 설정이므로 출력에 영향이 없습니다.
- `WasmCodec` 타입 import는 **삭제**하면 됩니다.
- **인코딩 출력(wire format)은 이전 버전과 100% 동일**합니다. 기존에 인코딩한
  데이터는 그대로 디코딩됩니다. 재인코딩이 필요 없습니다.

### 암호화 디코더 기본 동작 변경 (Breaking)

`encryptionKey`가 설정된 인스턴스는 이제 **기본적으로 암호화 footer가 없는 평문
payload를 거부**합니다(`requireEncryption` 기본값이 키 보유 시 `true`). 키를 가진
디코더가 인증되지 않은 평문을 무비판적으로 수용하던 다운그레이드 위험을 차단합니다.

#### 마이그레이션

- 같은 인스턴스로 레거시 평문을 디코딩해야 하면 호출에 `requireEncryption: false`
  (또는 `encrypt: false`)를 명시하세요.

### deprecated API 제거 (Breaking)

- 생성자 옵션 `encoding` 및 타입 `DduTextEncoding` 제거. 런타임 문자열 처리는 항상
  UTF-8이며 이 옵션은 동작에 영향이 없었습니다. `CharSetInfo.encoding`은 리터럴
  `"utf-8"` 타입으로 고정됩니다.
- 함수 `createObfuscationLayer` 제거. 인코더 출력과 호환되지 않던 deprecated 헬퍼이며,
  대체로 `createEncoderObfuscationLayer`(footer 마커·숫자 포함) 또는 `Ddu64`의
  `obfuscate` 옵션을 사용하세요.

### 입력 크기 한도 추가 (보안 강화)

- 디코드 입력(인코딩 문자열) 길이 상한 `maxEncodedChars` 옵션 추가. 청크/개행 제거 등
  전처리 **이전에** 선검사하여, 개행만 가득한 거대한 입력이 출력 한도(`maxDecodedBytes`)를
  우회하면서 대량 문자열 복사를 유발하던 문제를 차단합니다. 기본값은 `maxDecodedBytes`에
  비례(`max(256MiB, maxDecodedBytes×4)` 문자)하여 정상 입력을 깨지 않습니다.

### 기타 변경

- `encryptionKey: ""`(빈 문자열)를 생성/옵션 검증에서 거부합니다. 이전에는 빈 키가
  평문 인코딩을 만들면서 키 보유 디코더는 이를 거부해 라운드트립이 깨졌습니다.
- charset/패딩에 짝 없는 surrogate 코드 유닛(U+D800–U+DFFF) 사용을 거부합니다
  (UTF-8/URL/JSON 경계에서 손상 방지).
- `chunkSize: 0`이 청킹 비활성화의 명시적 값이 되었습니다. 생성자에 `chunkSize`
  기본값이 있어도 호출 단위로 `chunkSize: 0`을 주어 끌 수 있습니다(스트림 내부에서 사용).

### 내부 개선

- `NativeBase64FastPath`의 base64 디코드가 Node `Buffer` 풀 백킹 버퍼를 공유하는
  뷰 대신 독립 복사본(`new Uint8Array(buffer)`)을 반환하도록 변경. 인접 풀 메모리
  노출 가능성을 차단합니다.
- charset 룩업 테이블을 `[최소, 최대]` 코드 유닛 범위 + 오프셋 방식으로 축소
  (이전엔 `maxCode+1` 크기). 클러스터된/고코드포인트 charset에서 메모리 사용이 크게
  줄어듭니다.
- 공개 API 경계의 옵션 런타임 검증 및 Web Streams 버퍼 상한을 강화.

### 지원 Node 버전

- `engines.node` `>=22.0.0`. 활성 LTS/Current(Node 22·24 LTS, 26 Current)만 지원합니다.
  Node 18·20은 EOL이므로 지원 대상에서 제외합니다.
- CI는 Node 22/24/26에서 `pnpm verify` 전체 게이트를 실행합니다.
- 네이티브 Base64 가속(`Uint8Array.toBase64`/`fromBase64`, TC39 Stage-4 API)은 이를
  지원하는 런타임에서만 쓰이고 미지원 환경(현재 Node 24.13 포함 대부분)에서는 `Buffer`
  경로로 폴백하므로 동작에 영향이 없습니다.

### 빌드 / 개발 환경

- Rust toolchain, `wasm:check` 스크립트, `src/wasm/` 전체, WASM 벤치마크를 제거.
- CI에서 Rust 설치 및 WASM 검증 단계를 제거.
- pnpm 11 호환: `pnpm-workspace.yaml`에 `verifyDepsBeforeRun: false`를 설정하여 스크립트
  실행 전 암묵적 install이 hang하는 문제를 회피.
- `pack:check`가 깨진 esbuild CLI shim 대신 esbuild Node API를 사용하도록 변경.
