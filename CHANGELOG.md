# Changelog

버전별 사용자 영향과 이행 사항을 기록합니다. 현재 사용법은 [REFERENCE](docs/REFERENCE.md),
구조·측정 근거는 [DECISIONS](docs/DECISIONS.md)를 참고하세요.

## Unreleased — 6.3.0

- root·`/browser`에 `createDdu()` 추가. 생성 시 정책을 고정하고 encode/decode는 항상
  Promise를 반환합니다. `output: "bytes"`는 Uint8Array를 반환합니다. 기존 Ddu64·wire는 유지합니다.
- 간편 API의 입력 보존·동시 초기화·packed ESM/CJS·타입·브라우저 검증을 보강했습니다.
- 잘못된 청크 구분자의 경계 중첩을 거부하고, 스트림 타입·detached buffer·실제 view와 다른
  `Uint8Array.length`를 검증합니다. transform/flush 오류를 읽기와 write/close 양쪽에 전달합니다.
- Promise/thenable을 반환하는 progress callback을 거부하고 rejection을 처리합니다.
  생성·동기 가드·메시지 변환·브라우저 복호화의 cause와 ESM/CJS 오류 식별을 보존합니다.
- 잘못된 adapter factory 결과를 캐시하지 않으며 secure의 사용자 비동기 factory를 존중합니다.
  브라우저 동기 secure 호출의 오류 안내도 수정했습니다.
- DDS1 본문을 생성자 청크 구분자로 제거하지 않도록 하고, CharsetBuilder의 큰 입력 처리를 수정했습니다.
- Node native Base64·압축·압축 해제가 재정의된 메타데이터 대신 실제 view의 버퍼·offset·길이를 사용합니다.
- 생성자에 명시한 `maxEncodedChars`를 보존하며, 호출별 바이트 한도를 낮출 때만 자동 축소합니다.
- 난독화·역난독화의 lookup·임시 버퍼, native 부재 시 중복 순회, 청크 배열을 줄였습니다.
  다중 코드 유닛 난독화 alphabet·오류 위치·출력·입력 보존·한도는 유지합니다.

## 6.2.0 - 2026-09-17

npm 배포 기준은 `f4eef3d`(`v6.2.0`)입니다. GitHub Release와 npm 게시 상태는 별개입니다.

- 숫자 padding·반복 padding 및 본문과 충돌하는 V3·ENC·압축 marker의 footer 파싱을 수정했습니다.
  정상 암호화·버전 정보를 보존하며 실제 암호문 벡터로 검증합니다.
- 비동기 입력·호출 옵션·생성자 charset/coda/KDF salt·난독화 alphabet을 지연 사용 전에 보존합니다.
  스트림도 write 후 재사용할 입력을 복사하고 결합·실패 후 원래 참조를 정리합니다.
- 청크 스트림의 호출별 난독화·progress와 output checksum decode의 진행률 역행을 수정했습니다.
- 빈 charset 심볼을 거부하고 fallback preset의 비트폭·패딩을 일치시킵니다. 줄바꿈 구분자도 처리합니다.
- **BOM 보존:** decode가 선두 U+FEFF를 제거하지 않습니다. 기존 제거 동작이 필요하면
  애플리케이션에서 명시적으로 처리하세요. wire·바이트 decode는 바뀌지 않습니다.
- root·`/browser`에 `createEncodeStream()`·`createDecodeStream()` 추가. `/secure` 함수 export는 유지합니다.
- `Ddu64.create(options)` 추가. Node는 adapter 준비 후 동기 압축·암호화가 가능하며 브라우저는 async입니다.
  `DduStreamOptions`도 root·browser에서 export합니다.
- 통계의 중복 UTF-8 변환·입력 복사, AES 중간 concat, 난독화·non-pow2 임시 버퍼를 줄였습니다.
- Node 24 전체 검사와 Node 22·26/Bun/Deno, Chromium·Firefox·WebKit 검증을 구성했습니다.
  성능 측정에 Base64 기준선·입력 특성·초기/재사용 KDF·UTF-8 출력 크기를 구분합니다.
- 배포물에서 CONTRIBUTING을 제외하고 LICENCE의 원작자 고지를 보존했습니다. 크기·진행률 단위,
  Unicode·스트림 한도·보안 경계·진입점 계약을 정리했습니다.

## 6.1.2 - 2026-09-02

- `v6.1.2`의 `533c9a3`에서 package version만 갱신했습니다. 런타임 변경은 없습니다.

## 6.1.1 - 2026-09-02

- padding 제거 후 1문자 charset이 남아 반복문이 종료되지 않던 fallback을 수정했습니다.
- 빈 charset/padding/coda·무효 bit length·factory 타입과 생성자/호출 옵션 조합을 검증합니다.
- 통계·progress 예외를 Ddu64Error로 정규화하고, 브라우저 압축·해제 가용성을 각각 감지합니다.
- root 비동기 secure 처리가 별도 인스턴스 대신 현재 core에 adapter를 주입합니다.
  첫 동시 초기화는 Promise를 공유하고 압축 metadata를 자동 판별합니다. 명시 adapter 설정이 우선합니다.
- root·browser의 옵션·adapter·KDF 타입 export를 맞췄습니다. 당시 root 동기 secure는 `/secure`를 사용합니다.
- format·lint·타입·Knip·크기·packed consumer·런타임 smoke 검증과 npm OIDC 배포를 보강했습니다.
  이미 배포된 6.1.0과 충돌하지 않도록 패치 버전을 올렸습니다.

## 6.1.0 - 2026-07-09

- root·`/browser`의 비동기 secure 호출이 래퍼를 lazy import하도록 했습니다.
  encode/decode·byte/Buffer decode·압축 통계에 적용하며 평문 정적 그래프는 유지합니다.
- 공개 옵션 타입을 DduBaseOptions에서 DduOptions로 확장했습니다. 동기 secure 옵션은 타입 검사를
  통과해도 당시 root에서는 Ddu64AdapterError가 발생하므로 async 또는 `/secure`를 사용합니다.
- 명시 adapter 주입은 sync/async secure를 직접 처리합니다. 매 호출의 charset 정보 복사도 제거했습니다.

## 6.0.1 - 2026-07-09

- npm package version metadata를 6.0.1로 갱신했습니다.

## 6.0.0

5.0.0 대비 breaking change입니다. 아래 이행 사항은 6.0 도입 당시 기준이며 현재 API는 REFERENCE를 따르세요.

### Breaking changes와 이행

| 변경                                              | 필요한 작업                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 압축·암호화·체크섬·Web Streams를 `/secure`로 분리 | 당시 root 사용자는 `import { Ddu64 } from "@ddunigma/node/secure"`로 변경. 관련 adapter·stream 함수·타입 export도 이동했습니다.             |
| root의 secure 옵션 타입 축소                      | 6.0에서는 DduBaseOptions만 허용합니다. 우회 호출도 adapter 부재로 실패합니다. 6.1 이후 변경과 구분하세요.                                   |
| WASM 제거                                         | `preloadWasm`·`getWasmCodec`·`getWasmCodecSync`, `wasmThreshold` 옵션·정보 필드, `WasmCodec` 참조 삭제. 사전 로드·재인코딩은 필요 없습니다. |
| 키가 있는 decoder는 암호화 footer 필수            | 기존 평문을 같은 인스턴스로 읽어야 하면 해당 decode에 `requireEncryption: false` 명시.                                                      |
| `encoding`·`DduTextEncoding` 제거, UTF-8 고정     | 2.x의 다른 문자 인코딩은 입력 전 `Buffer.from(text, encoding)`, 바이트 복원 후 `.toString(encoding)` 사용.                                  |
| `createObfuscationLayer` 제거                     | `createEncoderObfuscationLayer` 또는 Ddu64의 `obfuscate` 사용.                                                                              |
| adapter capability 플래그 제거                    | `supportsSyncCrypto`·`supportsSyncCompression`·`supportsBrotli` 대신 실제 메서드 존재로 판단.                                               |
| `PlatformAdapter.randomBytes` 선택 메서드화       | 직접 호출 코드는 `adapter.randomBytes?.(...)`로 변경. 기본 adapter는 계속 제공합니다.                                                       |
| 최소 Node 22                                      | 배포 런타임을 Node 22 이상으로 변경.                                                                                                        |

### 동작·보안 수정

- 난독화의 키 요구를 없앴습니다. 기존 암호문·난독화 데이터는 같은 설정으로 복원됩니다.
- `maxEncodedChars`를 추가해 전처리 전 입력 길이를 제한합니다. 자동값은
  `maxDecodedBytes * 4 + 1024`이며 호출별 출력 한도를 낮추면 함께 낮아집니다.
- 빈 암호화 키와 charset/padding의 surrogate를 거부합니다. `chunkSize: 0`은 호출별 청킹 비활성화입니다.
- decode 입력 손상은 Ddu64DecodeError, charset 설정은 Ddu64CharsetError, 크기 한도는
  Ddu64LimitError로 구분합니다. `.code`로 분기하는 코드는 이 분류를 확인하세요.
- 브라우저 미지원 기능은 Ddu64AdapterError로 전달합니다. 외부 오류를 메시지 키워드로 추측하지 않습니다.
- 스트림의 키 설정은 암호화를 결정합니다. 평문 스트림은 키 없는 인스턴스를 사용하세요.
- KDF 파라미터를 명시하고 외부에서 관리하도록 안내했습니다. 기본 파라미터·wire는 유지합니다.

### 성능·구조·개발 환경

- pow2/non-pow2 비트팩과 문자열 매핑을 융합해 중간 인덱스 배열을 제거했습니다.
  표준 Base64는 지원 런타임의 네이티브 경로를 쓰고 JS/Buffer fallback을 유지합니다.
  독립 BitPack 오라클·고정 벡터·property test·성능 가드로 5.0의 출력 동치를 확인합니다.
- core에서 구체 adapter·난독화를 분리하고 factory를 주입합니다. `/core`에서 난독화가 필요하면
  별도 주입하거나 기본 진입점을 사용하세요. Node decode 결과는 독립 바이트 복사본을 반환합니다.
- charset lookup을 실제 코드 유닛 범위로 줄이고 sync/async의 공유 context를 통합했습니다.
  scoped checksum의 CK marker는 이름 정리와 무관하게 유지합니다.
- WASM·Rust 빌드 경로를 제거하고 pnpm 11의 overrides·명시적 설치 설정을 정리했습니다.
- esbuild를 0.28.1 이상으로 고정해 GHSA-gv7w-rqvm-qjhr·GHSA-g7r4-m6w7-qqqr에 대응했습니다.
  개발 의존성 변경이며 npm runtime dependency는 없습니다.
- verify에 Knip·size-limit·Node smoke·엄격한 lint/미사용 검사를 포함하고 packed ESM/CJS·
  NodeNext·브라우저 consumer를 검사합니다. 상세 사용법은 REFERENCE로 분리했습니다.
