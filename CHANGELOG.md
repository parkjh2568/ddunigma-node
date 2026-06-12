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

### 내부 개선

- `NativeBase64FastPath`의 base64 디코드가 Node `Buffer` 풀 백킹 버퍼를 공유하는
  뷰 대신 독립 복사본(`new Uint8Array(buffer)`)을 반환하도록 변경. 인접 풀 메모리
  노출 가능성을 차단합니다.
- 공개 API 경계의 옵션 런타임 검증 및 Web Streams 버퍼 상한을 강화.

### 지원 Node 버전

- `engines.node`를 `>=22.0.0`에서 **`>=18.0.0`**으로 완화. 라이브러리는 Web Streams를
  포함한 전 기능이 Node 18에서 동작합니다(WASM 제거로 하한이 더 내려갈 여지는 Web
  Streams 글로벌 게이트인 18에 막힘). 네이티브 Base64 가속(`Uint8Array.toBase64`,
  Node 22+)은 미지원 환경에서 `Buffer` 경로로 폴백하므로 하한에 영향이 없습니다.
- CI는 Node 20/22/24에서 전체 게이트를, Node 18에서는 빌드 + 런타임 smoke(`pnpm smoke`)를
  실행해 하한 호환을 검증합니다. (ESLint·Vitest 툴체인이 Node 20+를 요구하므로 Node 18은
  smoke 전용)

### 빌드 / 개발 환경

- Rust toolchain, `wasm:check` 스크립트, `src/wasm/` 전체, WASM 벤치마크를 제거.
- CI에서 Rust 설치 및 WASM 검증 단계를 제거.
- pnpm 11 호환: `pnpm-workspace.yaml`에 `verifyDepsBeforeRun: false`를 설정하여 스크립트
  실행 전 암묵적 install이 hang하는 문제를 회피.
- `pack:check`가 깨진 esbuild CLI shim 대신 esbuild Node API를 사용하도록 변경.
