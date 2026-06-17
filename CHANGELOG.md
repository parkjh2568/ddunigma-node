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

### PlatformAdapter 슬림화 (Breaking)

- `PlatformAdapter`에서 introspection 전용 capability 플래그 `supportsSyncCrypto`,
  `supportsSyncCompression`, `supportsBrotli`를 **제거**했습니다. 코어 파이프라인은 이
  플래그가 아니라 실제 메서드 존재 여부(`encryptSync`/`deriveKeySync`/`brotliCompressSync`
  등)로 가용성을 판단하므로 동작에 영향이 없습니다.
- `randomBytes`는 인터페이스에 유지하되, 코어 파이프라인이 호출하지 않는 편의 메서드임을
  명시했습니다(각 어댑터가 암호화 IV를 내부에서 직접 생성). `NodeAdapter`/`BrowserAdapter`
  구현 유지.
- 마이그레이션: 커스텀 어댑터에서 위 capability 플래그를 더 이상 구현할 필요가 없습니다.
  이 플래그들을 **읽던** 코드만 영향받습니다.

### 키 파생(KDF) 포지셔닝 (정책 명시, 포맷 변경 없음)

- 본 라이브러리의 AES-256-GCM 암호화는 **부가 기능**이며 단독 보안 솔루션이 아님을
  README에 명시했습니다. 기본 PBKDF2 210k + 고정 기본 salt는 저엔트로피 키에 충분치
  않으므로(OWASP는 PBKDF2-HMAC-SHA256 ≥600k 권고) 애플리케이션 고유 `salt`와 높은
  `iterations` 지정을 권장합니다. 자기기술 KDF envelope는 ROADMAP에서 범위 밖으로
  결정(현행 암호화·포맷 불변).

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

- **코어/어댑터·난독화 분리 (번들 경량화)**: `Ddu64Core`가 `NodeAdapter`/`BrowserAdapter`와
  `HangulObfuscationLayer`를 더 이상 정적으로 참조하지 않습니다. 어댑터는 `adapterFactory`로
  첫 압축/암호화 시점에 지연 생성하고, 난독화는 `obfuscationLayerFactory` 주입으로 분리했습니다.
  `@ddunigma/node`·`/browser` 진입점은 두 팩토리를 자동 주입하므로 기존 사용법(`obfuscate`
  옵션 등)은 그대로 동작합니다. `@ddunigma/node/core`로 순수 인코딩/디코딩만 사용하면 어댑터·
  난독화 코드가 트리셰이킹되어 최소 번들이 약 5KB 줄어듭니다(측정 기준).
  - 신규 `@internal` 생성자 옵션 `adapterFactory`, `obfuscationLayerFactory` 추가.
  - `Ddu64Core`를 직접 생성해 `obfuscate`를 쓰려면 `obfuscationLayerFactory` 주입이 필요합니다
    (이전엔 코어가 난독화를 내장). 배터리 포함 진입점 사용자는 영향 없습니다.
- `NativeBase64FastPath`의 base64 디코드가 Node `Buffer` 풀 백킹 버퍼를 공유하는
  뷰 대신 독립 복사본(`new Uint8Array(buffer)`)을 반환하도록 변경. 인접 풀 메모리
  노출 가능성을 차단합니다.
- charset 룩업 테이블을 `[최소, 최대]` 코드 유닛 범위 + 오프셋 방식으로 축소
  (이전엔 `maxCode+1` 크기). 클러스터된/고코드포인트 charset에서 메모리 사용이 크게
  줄어듭니다.
- **디코드 hot path 융합**: 2의 제곱수 charset 디코드가 (charCodeAt→인덱스 배열) +
  `bitPackDecode` 2단계 대신 `unpackPow2FromString`로 한 패스에 바이트를 언팩합니다.
  중간 인덱스 배열(Uint16Array/number[]) 할당을 제거해 대형 입력의 할당/GC를 줄입니다.
  출력은 바이트 단위로 동일하며, `bench:guard`에 회귀 가드를 추가했습니다.
- **인코드 hot path 융합 (비-2의 제곱수)**: 인덱스 쌍 charset(V1·커스텀 non-pow2) 인코드도
  `packNonPow2ToString`로 비트팩+charset 매핑을 한 패스로 융합. 출력 바이트 동일.
- **인코드 hot path 융합 (비-2의 제곱수)**: 인덱스 쌍 charset(V1·커스텀 non-pow2) 인코드도
  `packNonPow2ToString`로 비트팩+charset 매핑을 한 패스로 융합. 출력 바이트 동일.
- **디코드 hot path 융합 (비-2의 제곱수)**: 인덱스 쌍 charset 디코드도
  `unpackNonPow2FromString`로 (charCodeAt→인덱스 배열)+`bitPackDecode` 2단계를 한 패스로
  융합(값 범위·쌍 완결성 검증 동치 유지). 코어 디코드 경로는 더 이상 인덱스 배열을 만들지
  않습니다(pow2/non-pow2 모두). 출력 바이트 동일.
- **네이밍 정리**: 스코프 자기기술 체크섬 식별자를 `CHECKSUM_MARKER_SCOPED`/
  `extractScopedChecksum`/`ScopedChecksumExtractResult`로 변경(과거 'v5' 명칭 → 폐기된
  'v5 KDF envelope'와 혼동 방지). **와이어 마커 값 `CK`는 불변**이라 출력/호환 영향 없음.
  테스트 인프라(`gen:scoped-checksum-vectors` 스크립트, `scoped-checksum-vectors.json`
  픽스처/테스트)도 동일 명칭으로 통일.
- **PlatformAdapter 문서화**: `randomBytes`와 `supports*` 플래그가 코어 파이프라인에서
  사용되지 않는 introspection/편의 멤버임을 `@remarks`로 명시(차기 메이저 슬림화 후보).
- 공개 API 경계의 옵션 런타임 검증 및 Web Streams 버퍼 상한을 강화.

### 지원 Node 버전

- `engines.node` `>=22.0.0`. 활성 LTS/Current(Node 22·24 LTS, 26 Current)만 지원합니다.
  Node 18·20은 EOL이므로 지원 대상에서 제외합니다.
- CI는 Node 22/24에서 `pnpm verify` 전체 게이트를 실행합니다(26 Current는 러너 가용 확인 후 추가 예정).
- 네이티브 Base64 가속(`Uint8Array.toBase64`/`fromBase64`, TC39 Stage-4 API)은 이를
  지원하는 런타임에서만 쓰이고 미지원 환경(현재 Node 24.13 포함 대부분)에서는 `Buffer`
  경로로 폴백하므로 동작에 영향이 없습니다.

### 빌드 / 개발 환경

- Rust toolchain, `wasm:check` 스크립트, `src/wasm/` 전체, WASM 벤치마크를 제거.
- CI에서 Rust 설치 및 WASM 검증 단계를 제거.
- pnpm 11 호환: `pnpm-workspace.yaml`에 `verifyDepsBeforeRun: false`를 설정하여 스크립트
  실행 전 암묵적 install이 hang하는 문제를 회피.
- `pack:check`가 깨진 esbuild CLI shim 대신 esbuild Node API를 사용하도록 변경.
- `esbuild`를 `>=0.28.1`로 올리고 `pnpm.overrides`로 전이 의존성(tsx 경유 포함)까지
  고정. GHSA-gv7w-rqvm-qjhr(high)·GHSA-g7r4-m6w7-qqqr(low) 해소(`pnpm audit` 클린).
  esbuild는 devDependency라 published 패키지에는 포함되지 않습니다(빌드/CI 위생 차원).
