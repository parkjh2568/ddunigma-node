# Changelog

이 프로젝트의 주요 변경 사항을 기록합니다.

## Unreleased

### 기본 진입점에 lazy secure 추가 (편의성 개선)

기본 진입점(`@ddunigma/node`, `@ddunigma/node/browser`)에서 secure 옵션(`compress`,
`encryptionKey`)이 감지된 **비동기** 호출은 이제 secure 래퍼(`Ddu64Secure`/`Ddu64SecureBrowser`)를
`import()`로 지연 로드해 그대로 처리합니다. lean 정적 import 그래프는 유지되며(어댑터는 동적
청크에만 포함), 순수 인코딩/난독화 경로는 종전대로 어댑터를 로드하지 않습니다.

- 대상 async 메서드: `encodeAsync`/`decodeAsync`/`decodeToUint8ArrayAsync`/`decodeToBufferAsync`,
  그리고 압축 통계용 `getStatsAsync`(Node·브라우저 대칭).
- 동기 secure(예: `encode({ compress: true })`)는 여전히 지원하지 않으며, `encode`/`decode`/
  `decodeToUint8Array`/`getStats`가 대칭적으로 `Ddu64AdapterError`를 던져 `encodeAsync`/
  `decodeAsync`/`getStatsAsync` 또는 `@ddunigma/node/secure`를 안내합니다.
- **타입 표면 변경(주의):** 기본 진입점의 공개 옵션 타입이 `DduBaseOptions` → `DduOptions`
  (secure 전체)로 넓어졌습니다. 이에 따라 6.0의 **컴파일 단계 차단**(`encode(x, { compress: true })`가
  타입 에러)이 **런타임 가드**로 전환됩니다. 동기 메서드에 secure 옵션을 넘기면 컴파일은
  통과하고 호출 시 위 `Ddu64AdapterError`가 발생합니다.
- 명시 `adapter`를 기본 진입점 생성자에 주입하면 base 코어가 sync/async secure를 직접 처리하며
  lazy 우회 및 동기 가드가 비활성화됩니다.
- 성능: adapter 판정을 생성 시점 boolean 캐시로 옮겨, async hot-path에서 호출마다 발생하던
  `getCharSetInfo()` 할당(charset 배열 복사 + 정보 객체)을 제거했습니다.

## 6.0.0

이전 published 버전(5.0.0) 대비 호환성에 영향을 주는 변경이 포함되어 메이저로 올립니다.

### 인코딩 hot path 성능 최적화 (내부 개선, 출력 불변)

한글/커스텀 charset의 인코드/디코드 hot path를 최적화했습니다. **공개 API·옵션·wire format·
출력 바이트는 전혀 변경되지 않습니다**(기존 데이터 100% 그대로 디코딩, 재인코딩 불필요).

- `IndexStringMapper`의 `packPow2ToString`/`unpackPow2FromString`에 `bitLength === 6`/`=== 8`
  직접 매핑 언롤 융합 분기를 추가했습니다. 6비트는 3바이트↔4심볼, 8비트는 1바이트↔1심볼을
  누산기 루프 없이 한 패스로 처리합니다. 측정상 인코드 문자열 구축 처리량이 크게 개선되고
  (`packPow2ToString` 약 40→~183 MB/s), 디코드도 대칭 언롤로 개선됩니다(약 150→~420 MB/s).
- 표준 base64 알파벳은 기존 네이티브 fast path(`Uint8Array.toBase64`/`fromBase64`)를 그대로
  사용합니다. 한글 charset은 비-ASCII 출력이라 네이티브 base64 속도에는 도달할 수 없습니다.
- 동치 보장: 융합 경로 출력이 raw 비트팩(`bitPackEncode`/`bitPackDecode`) 기준과 바이트 동치임을
  오라클 테스트로 고정하고, property 테스트(바이트 동치/라운드트립/하위호환)와 고정 벡터로
  회귀를 차단합니다. `bench:guard`의 처리량 하한을 개선분에 맞춰 상향했습니다.
- `bitPackEncode`/`bitPackDecode`(및 `bitPackEncode6`/`bitPackEncode8`)는 프로덕션 hot path가
  아니라 **동치 검증 기준(오라클)**으로 유지됩니다.

### 진입점 재편 — 압축/암호화/체크섬을 `/secure`로 분리 (Breaking)

라이브러리의 주목적을 "재미 + 시각적 난독화"로 확정하고, 압축/암호화/체크섬/Web Streams를
전용 진입점 `@ddunigma/node/secure`로 분리했습니다. 기본 진입점(`@ddunigma/node`,
`@ddunigma/node/browser`)은 **인코딩 + 한글 난독화만** 제공하는 lean 빌드가 되어 어댑터
(zlib/crypto·WebCrypto/CompressionStream)와 CRC32/압축 코드가 트리셰이킹됩니다.

진입점 구성(4개):

- `@ddunigma/node` — Node lean(`Ddu64Node`): 인코딩 + 난독화, `decodeToBuffer` 제공.
- `@ddunigma/node/browser` — 브라우저 lean(`Ddu64Browser`): 인코딩 + 난독화.
- `@ddunigma/node/secure` — 배터리(`Ddu64Secure`): 압축/암호화/체크섬/Web Streams. Node/브라우저
  조건부 빌드로 자동 선택.
- `@ddunigma/node/core` — 코어(`Ddu64Core`): 순수 인코딩/디코딩(불변).

#### 마이그레이션

- 압축/암호화/체크섬/Web Streams를 사용하던 코드의 import 경로를 `@ddunigma/node` →
  **`@ddunigma/node/secure`** 로 변경하세요. 클래스 사용법·옵션·wire format은 동일합니다.
  ```diff
  - import { Ddu64 } from "@ddunigma/node";
  + import { Ddu64 } from "@ddunigma/node/secure";
    const ddu = new Ddu64({ compress: true, encryptionKey: "k", checksum: true });
  ```
- `NodeAdapter`/`BrowserAdapter`/`createReadableEncodeStream`/`createReadableDecodeStream`와
  `DduStreamOptions`/`PlatformAdapter`/`KeyDerivationOptions` 등 배터리 관련 export도
  `@ddunigma/node/secure`로 이전되었습니다.
- 기본 진입점에서 `encode(x, { compress: true })`처럼 secure 옵션을 호출하면 타입 단계에서
  차단됩니다(공개 옵션 타입이 `DduBaseOptions`로 축소). 런타임에 우회하면 어댑터 부재로
  `Ddu64CompressionError`/`Ddu64EncryptionError`가 발생합니다.
- **난독화는 이제 암호화 키 없이** 기본 진입점에서 바로 사용할 수 있습니다(아래 항목 참고).
- **인코딩 출력(wire format)은 이전과 100% 동일**합니다. 기존 데이터는 그대로 디코딩됩니다.

### 난독화 암호화 의존 해제 (Behavior change)

`obfuscate: true`가 더 이상 `encryptionKey`를 요구하지 않습니다. 키 없이 난독화 인코딩이
정상 동작하며, 역난독은 디코더의 키 보유 여부와 무관합니다(난독 알파벳이 charset·패딩·푸터
마커·숫자로 키 비의존적으로 구성). 기존에 "난독화는 암호화 필요" 제약으로 던지던 예외
2곳(`Ddu64Core` 생성자, `shouldObfuscate()`)이 제거되었습니다. 기존 "암호문 + 난독" 데이터는
동일 키로 기존과 동일하게 복원됩니다.

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

- 같은 인스턴스로 레거시 평문을 디코딩해야 하면 호출에 `requireEncryption: false`를
  명시하세요.

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
- `randomBytes`를 **선택(optional) 메서드로 변경**했습니다. 코어 파이프라인이 호출하지 않는
  편의 메서드이므로(각 어댑터가 암호화 IV를 내부에서 직접 생성) 커스텀 어댑터는 구현하지
  않아도 됩니다. `NodeAdapter`/`BrowserAdapter`는 계속 제공합니다.
- 마이그레이션: 커스텀 어댑터에서 위 capability 플래그·`randomBytes`를 더 이상 구현할 필요가
  없습니다. `PlatformAdapter` 타입으로 `adapter.randomBytes(...)`를 호출하던 코드는 옵셔널
  호출(`adapter.randomBytes?.(...)`)로 바꾸세요.

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

- **에러 분류를 발생 지점으로 이전 (메시지 키워드 추측 제거)**: 내부 모듈이 실패 지점에서
  도메인 타입 에러(`Ddu64DecodeError`/`Ddu64LimitError`/`Ddu64DecryptionError`/
  `Ddu64ObfuscationError`/`Ddu64EncodeError`/`Ddu64InvalidInputError`)를 **직접 throw**하도록
  전환하고, `wrapDdu64Error`의 메시지 키워드 기반 분류 휴리스틱을 제거했습니다. 이제
  `wrapDdu64Error`는 "이미 `Ddu64Error`면 통과, 그 외는 operation 기반 fallback"만 수행합니다.
  분류 책임이 단일 진실 소스(발생 지점)로 모여 메시지 문구 변경에 의한 타입 드리프트가
  구조적으로 차단됩니다. **에러 메시지·wire format·인코딩/디코딩 출력은 불변**입니다.
  - 디코드 입력 손상(무효 문자/인덱스, 잘린 심볼 쌍, 정렬·패딩·비트길이 오류)의 에러 타입이
    이전의 혼재(`Ddu64CharsetError`/`Ddu64LimitError` 등)에서 **`Ddu64DecodeError`로 일관**되게
    정리되었습니다. charset _설정_ 오류만 `Ddu64CharsetError`로 남습니다. 디코드 입력 길이/출력
    크기 한도 초과는 `Ddu64LimitError`입니다. (`.code`로 분기하던 코드는 이 의미 정리에 맞춰
    확인하세요. 6.0 미배포 변경이라 published 호환 영향은 없습니다.)
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
- **디코드 hot path 융합 (비-2의 제곱수)**: 인덱스 쌍 charset 디코드도
  `unpackNonPow2FromString`로 (charCodeAt→인덱스 배열)+`bitPackDecode` 2단계를 한 패스로
  융합(값 범위·쌍 완결성 검증 동치 유지). 코어 디코드 경로는 더 이상 인덱스 배열을 만들지
  않습니다(pow2/non-pow2 모두). 출력 바이트 동일.
- **네이밍 정리**: 스코프 자기기술 체크섬 식별자를 `CHECKSUM_MARKER_SCOPED`/
  `extractScopedChecksum`/`ScopedChecksumExtractResult`로 변경(과거 'v5' 명칭 → 폐기된
  'v5 KDF envelope'와 혼동 방지). **와이어 마커 값 `CK`는 불변**이라 출력/호환 영향 없음.
  테스트 인프라(`gen:scoped-checksum-vectors` 스크립트, `scoped-checksum-vectors.json`
  픽스처/테스트)도 동일 명칭으로 통일.
- **어댑터 capability 에러 타입화**: `BrowserAdapter`/`detect`의 미지원·런타임 부재 에러를
  평문 `Error` 대신 `Ddu64AdapterError`로 던지고, 문자열 매칭 기반 분류기를 제거했습니다.
  메시지는 동일하며 에러 타입만 더 구체화됩니다.
- **어댑터 게이트웨이 컨텍스트 단일화**: 구조가 동일하던 sync/async 게이트웨이 컨텍스트
  타입을 내부 `AdapterGatewayContext` 하나로 통합. 디코드 비트 길이 계산 중복을 공용
  헬퍼로 정리(거동/메시지 불변).
- 공개 API 경계의 옵션 런타임 검증 및 Web Streams 버퍼 상한을 강화.
- **Web Streams 암호화 정책 명시**: 스트림 암호화는 인코더의 키 보유 여부로만 결정되며
  (`encryptionKey` 설정 시 항상 암호화), 스트림 옵션의 `encrypt`는 노출/적용되지 않음을
  문서화했습니다. 평문 스트림은 키 없는 인스턴스를 사용하세요.

### 지원 Node 버전

- `engines.node` `>=22.0.0`. 활성 LTS/Current(Node 22·24 LTS, 26 Current)만 지원합니다.
  Node 18·20은 EOL이므로 지원 대상에서 제외합니다.
- CI는 Node 22/24에서 `pnpm verify` 전체 게이트를 실행하며, Node 26 Current는 러너 가용성이
  보장되지 않아 `continue-on-error`(비차단)로 매트릭스에 추가했습니다(가용 시 자동 검증).
- 네이티브 Base64 가속(`Uint8Array.toBase64`/`fromBase64`, TC39 Stage-4 API)은 이를
  지원하는 런타임에서만 쓰이고 미지원 환경(현재 Node 24.13 포함 대부분)에서는 `Buffer`
  경로로 폴백하므로 동작에 영향이 없습니다.

### 빌드 / 개발 환경

- Rust toolchain, `wasm:check` 스크립트, `src/wasm/` 전체, WASM 벤치마크를 제거.
- CI에서 Rust 설치 및 WASM 검증 단계를 제거.
- pnpm 11 호환: `pnpm-workspace.yaml`에 `verifyDepsBeforeRun: false`를 설정하여 스크립트
  실행 전 암묵적 install이 hang하는 문제를 회피. esbuild `overrides`도 `package.json`의
  `pnpm.overrides`에서 `pnpm-workspace.yaml`의 `overrides`로 이동(pnpm 11이 이 위치에서 읽음).
- `pack:check`가 깨진 esbuild CLI shim 대신 esbuild Node API를 사용하도록 변경.
- `esbuild`를 `>=0.28.1`로 올리고 `overrides`로 전이 의존성(tsx 경유 포함)까지
  고정. GHSA-gv7w-rqvm-qjhr(high)·GHSA-g7r4-m6w7-qqqr(low) 해소(`pnpm audit` 클린).
  esbuild는 devDependency라 published 패키지에는 포함되지 않습니다(빌드/CI 위생 차원).
- **품질 게이트 강화**: `knip`(미사용 파일/export/의존성)과 `size-limit`(진입점별 brotli 번들
  예산: core/node/browser/secure/secure.browser)을 `verify`에 편입하고, ESLint를 `--max-warnings=0`으로 실행합니다.
  tsconfig에 `noUnusedLocals`/`noUnusedParameters`를 활성화했습니다. 추가 도구는 모두
  devDependency이며 published 패키지는 무종속을 유지합니다.
- **`verify`에 `smoke` 편입**: 빌드된 `dist` 산출물을 실제 Node 런타임에서 검증하는
  `runtime-smoke`를 `verify` 체인 끝에 추가해, 진입점 구조(lean/secure 분리) 회귀를 CI에서
  차단합니다. `runtime-smoke.mjs`를 6.0 진입점 구조(lean은 `dist/index.js`, 배터리·Web Streams는
  `dist/secure.js`)에 맞게 갱신했습니다.
- **문서 분리**: 상세 레퍼런스(전체 옵션 표·secure 사용법·URL-Safe/청크·Web Streams·통계·`/core`
  고급)를 `docs/REFERENCE.md`로 이전하고, README는 정체성·Quick Start·난독화·진입점 + 레퍼런스
  링크로 정리했습니다.
