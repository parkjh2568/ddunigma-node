# Changelog

이 프로젝트의 주요 변경 사항을 기록합니다.

## 5.1.0

### 제거 (Breaking)

WASM 가속 경로를 전면 제거하고 인코딩/디코딩 hot path를 순수 JavaScript 비트팩으로
단일화했습니다. 측정 결과 WASM의 이득은 16KB 이상·비표준 charset·`preloadWasm()` 선행
호출이라는 좁은 조건에서만 +10~30%로 제한적이었던 반면, Rust 툴체인·약 19KB 임베드
바이너리·로더 상태머신·JS/Rust 이중 유지보수 비용이 컸습니다. 표준 Base64 charset은
네이티브 Base64 fast path로 계속 가속됩니다.

다음 공개 API와 옵션이 제거되었습니다:

- 함수: `preloadWasm`, `getWasmCodec`, `getWasmCodecSync` (모든 진입점)
- 생성자 옵션: `wasmThreshold`, `wasmMaxBytes`
- 타입: `WasmCodec`, `WasmCodecConfig`
- `getCharSetInfo()` 반환 필드: `wasmThreshold`, `wasmMaxBytes`

#### 마이그레이션

- `preloadWasm()` 호출은 **삭제**하면 됩니다. 사전 로드 없이 동기/비동기 인코딩이
  그대로 동작합니다.
- `wasmThreshold` / `wasmMaxBytes` 옵션은 **삭제**하면 됩니다. 무시되던 설정이므로
  출력에 영향이 없습니다.
- `WasmCodec` / `WasmCodecConfig` 타입 import는 **삭제**하면 됩니다.
- **인코딩 출력(wire format)은 이전 버전과 100% 동일**합니다. 기존에 인코딩한
  데이터는 그대로 디코딩됩니다. 재인코딩이 필요 없습니다.

### 내부 개선

- `NativeBase64FastPath`의 base64 디코드가 Node `Buffer` 풀 백킹 버퍼를 공유하는
  뷰 대신 독립 복사본(`new Uint8Array(buffer)`)을 반환하도록 변경. 인접 풀 메모리
  노출 가능성을 차단합니다.

### 빌드 / 개발 환경

- Rust toolchain, `wasm:check` 스크립트, `src/wasm/` 전체, WASM 벤치마크를 제거.
- CI에서 Rust 설치 및 WASM 검증 단계를 제거.
- pnpm 11 호환: `.npmrc`에 `verify-deps-before-run=false`를 추가하여 스크립트 실행
  전 암묵적 install이 hang하는 문제를 회피.
