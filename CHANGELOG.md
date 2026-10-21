# Changelog

현재 사용법은 [REFERENCE](docs/REFERENCE.md)를 확인하세요.

## Unreleased

- README·사용법·개발 문서의 중복을 줄이고 설계 문서를 npm 배포물에서 제외했습니다.

## 6.3.0 - 2026-10-19

- root·`/browser`에 `createDdu()` 추가. 생성 시 옵션을 고정하며 encode/decode는 Promise,
  `output: "bytes"`의 decode는 Uint8Array를 반환합니다. 기존 Ddu64·wire는 유지합니다.
- 비정상 청크 구분자, 잘못된 stream 입력·detached buffer·실제 view와 다른 길이를 거부합니다.
  stream 실패가 읽기와 write/close 양쪽에 전달되도록 수정했습니다.
- Promise/thenable progress callback을 거부하고 rejection을 처리합니다.
  외부 오류의 cause와 ESM/CJS 오류 식별을 보존합니다.
- 잘못된 adapter factory 결과를 캐시하지 않고 사용자 async factory를 존중합니다.
  브라우저 동기 secure 오류 안내도 수정했습니다.
- DDS1 본문이 codec 청크 구분자로 제거되는 문제와 CharsetBuilder의 큰 입력 처리를 수정했습니다.
- Node Base64·압축·해제에서 실제 버퍼 범위를 사용하고 생성자의 명시적 `maxEncodedChars`를 보존합니다.
- 난독화·Base64 fallback·청크 분할의 중간 할당과 중복 순회를 줄였습니다. 출력·입력 보존·한도는 유지합니다.

## 6.2.0 - 2026-09-17

- 숫자/반복 padding 및 V3·ENC·압축 marker 충돌의 footer 파싱을 수정했습니다.
- 비동기 입력·호출 옵션·charset/coda/KDF salt·난독화 alphabet을 지연 사용 전에 보존합니다.
  stream도 입력 재사용과 결합·실패 후 참조 해제를 처리합니다.
- stream의 호출별 난독화·progress 및 decode 진행률 역행을 수정했습니다.
- 빈 charset과 fallback의 비트폭·padding·줄바꿈 구분자를 검증합니다.
- **BOM 보존:** 문자열 decode가 선두 U+FEFF를 유지합니다. 기존 제거가 필요하면 명시적으로 처리하세요.
- root·`/browser`에 `createEncodeStream()`·`createDecodeStream()`과 `DduStreamOptions`를 추가했습니다.
- `Ddu64.create(options)` 추가. Node는 준비 후 동기 secure 호출이 가능하며 브라우저는 async입니다.
- 통계·AES·난독화·비-2의 제곱수 매핑의 중복 변환·복사·임시 버퍼를 줄였습니다.

## 6.1.2 - 2026-09-02

- package version만 갱신했습니다. 런타임 변경은 없습니다.

## 6.1.1 - 2026-09-02

- fallback에서 1문자 charset이 남아 반복문이 종료되지 않는 문제를 수정했습니다.
- charset/padding/coda·bit length·factory 타입·옵션 조합과 오류 분류를 보강했습니다.
- 브라우저 압축·해제 가용성을 독립 탐지합니다.
- root가 같은 core에 adapter를 지연 주입하고 동시 초기화를 공유하도록 수정했습니다.
- root·browser의 옵션·adapter·KDF 타입 export를 맞췄습니다. 당시 root 동기 secure는 `/secure`를 사용합니다.

## 6.1.0 - 2026-07-09

- root·`/browser`에 비동기 secure 처리·압축 통계·전체 옵션 타입을 제공했습니다.
- 당시 root 동기 secure는 async 또는 `/secure`를 사용하며 명시 adapter 주입은 sync/async를 지원합니다.

## 6.0.1 - 2026-07-09

- package version을 갱신했습니다.

## 6.0.0

5.0.0 대비 breaking change입니다. 아래는 도입 당시 기준이며 현재 API는 REFERENCE를 따릅니다.

| 변경                                          | 이행                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| secure 기능·export 분리                       | 당시 압축·암호화·체크섬·Web Streams는 `@ddunigma/node/secure`로 이동. 6.1 이후 root 지원과 구분하세요. |
| WASM 제거                                     | `preloadWasm`·`getWasmCodec`·`getWasmCodecSync`·`wasmThreshold`·`WasmCodec` 참조 삭제                  |
| 키가 있는 decoder의 암호화 footer 요구        | 레거시 평문을 읽을 때 해당 호출에 `requireEncryption:false` 지정                                       |
| `encoding`·`DduTextEncoding` 제거, UTF-8 고정 | 다른 encoding은 입력 전 Buffer 변환·바이트 복원 후 변환                                                |
| `createObfuscationLayer` 제거                 | `createEncoderObfuscationLayer` 또는 `obfuscate` 사용                                                  |
| adapter capability 플래그 제거                | `supportsSyncCrypto`·`supportsSyncCompression`·`supportsBrotli` 대신 실제 메서드로 판단                |
| `PlatformAdapter.randomBytes` 선택 메서드화   | 직접 호출은 `randomBytes?.(...)`로 변경                                                                |
| 최소 Node 22                                  | 런타임을 Node 22 이상으로 변경                                                                         |

- 난독화의 키 요구를 없애고 전처리 전 `maxEncodedChars` 한도를 추가했습니다.
- 빈 암호화 키·surrogate charset/padding을 거부합니다. `chunkSize:0`은 호출별 청킹 비활성화입니다.
- 입력 손상·charset·한도·미지원 기능을 각각 오류 코드로 분류합니다. 기존 code 분기를 확인하세요.
- 평문 stream은 키 없는 인스턴스를 사용하고 KDF 설정은 외부에서 관리합니다.
- 비트 매핑·native Base64·lookup·독립 출력 버퍼를 최적화했습니다. 기존 wire·KDF 기본값을 유지합니다.
- esbuild 보안 패치(GHSA-gv7w-rqvm-qjhr·GHSA-g7r4-m6w7-qqqr)를 적용했습니다. runtime dependency는 없습니다.

## 2.x에서 이행

- 2.0.2·2.2.0 기본 DDU는 8문자·3비트입니다. 현재 DDU는 64문자·6비트,
  DDU_V1은 8문자·6비트 쌍 표현이므로 이름이 같아도 호환되지 않습니다.
- 2.x의 zlib wrapper와 현재 raw DEFLATE, 2.2.0의 SHA-256 파생과 현재 기본 PBKDF2를 구분하세요.
- `TWOCHARSET`·`THREECHARSET`·`BaseDdu`·`useBuildErrorReturn`·구형 DduPipeline/Node Transform API는 그대로 쓸 수 없습니다.
- 기존 데이터는 생성 버전·charset·KDF 설정으로 복원한 뒤 재인코딩하세요.
  decode 성공만으로 올바른 복원을 판정하지 말고 원문 바이트를 대조하세요.
