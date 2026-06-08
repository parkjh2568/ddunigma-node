# ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

커스텀 charset을 사용하는 Base64 스타일 인코더/디코더 라이브러리입니다.

V2 추가사항

- 이제 한글 종성 결합 시스템을 활용하여 8개 기본 문자 × 8개 종성으로 64가지 조합을 만들어, 6비트를 한 글자로 표현합니다.

### Credits

- Origin implementation by:
  - [@i3ls](https://github.com/i3l3)
  - [@gunu3371](https://github.com/gunu3371)
- Original Repository: [ddunigma](https://github.com/i3l3/ddunigma)

## Requirements

- **Node.js >= 22.0.0**

## Install

```bash
npm install @ddunigma/node
```

## Quick Start

```typescript
import { Ddu64, DduSetSymbol } from "@ddunigma/node";

// 기본 (한글 종성 결합 64문자)
const ddu = new Ddu64();
const encoded = ddu.encode("안녕하세요");
const decoded = ddu.decode(encoded); // "안녕하세요"

// 구버전 호환 8문자 방식
const dduV1 = new Ddu64({ dduSetSymbol: DduSetSymbol.DDU_V1 });
```

## Binary Data

문자열뿐 아니라 바이너리(`Uint8Array` / `Buffer`)도 인코딩할 수 있습니다.

```typescript
const ddu = new Ddu64();
const input = new Uint8Array([0, 1, 127, 128, 255]);

const encoded = ddu.encode(input);
const bytes = ddu.decodeToUint8Array(encoded); // Uint8Array
const buffer = ddu.decodeToBuffer(encoded); // Buffer (Node 진입점 전용)
```

## Presets

```typescript
new Ddu64(); // 기본: DDU (한글 종성 결합 64문자)
new Ddu64({ dduSetSymbol: DduSetSymbol.DDU_V1 }); // 구버전 호환 8문자
new Ddu64({ dduSetSymbol: DduSetSymbol.ONECHARSET }); // 영문+숫자 64문자
```

| Symbol       | 문자 수 | 설명                               |
| ------------ | ------: | ---------------------------------- |
| `DDU`        |      64 | 한글 기본 문자 8개 × 종성 8개 조합 |
| `DDU_V1`     |       8 | 기존 8문자 쌍 방식 (하위 호환)     |
| `ONECHARSET` |      64 | 영문, 숫자, 일부 특수문자          |

## Custom Charset

```typescript
// 표준 Base64 문자셋 (위치 인자: charset, padding)
const base64 = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=");

// 한글 종성 조합으로 charset 생성
const hangul = new Ddu64(["가", "나", "다", "라"], "뭐", {
  codaChar: ["", "ㄱ", "ㄲ", "ㄷ"],
}); // → 가, 각, 갂, 갇, 나, 낙, … (16문자)
```

- charset의 각 문자와 `paddingChar`는 단일 UTF-16 코드 유닛 문자여야 합니다(이모지 등 surrogate pair 불가).
- 옵션 객체 형태(`new Ddu64({ ... })`)와 위치 인자 형태(`new Ddu64(charset, padding, options?)`)를 모두 지원합니다.

## Compression

```typescript
const ddu = new Ddu64({
  compress: true,
  compressionAlgorithm: "deflate", // "deflate" | "brotli"
  compressionLevel: 6, // deflate: 0-9, brotli: 0-11
});
```

압축은 결과가 원본보다 작아질 때만 적용됩니다. 압축 여부는 출력에 기록되어 디코딩 시 자동 처리됩니다.

브라우저/Workers 진입점은 런타임의 `CompressionStream` / `DecompressionStream` 지원에 의존합니다.
`compressionLevel`은 Node.js `zlib`에서는 반영되지만, Web API 기반 브라우저 압축에서는 런타임이
품질 레벨을 받지 않아 무시될 수 있습니다. Brotli 역시 런타임별 지원 여부가 다릅니다.

## Encryption

```typescript
const ddu = new Ddu64({ encryptionKey: "my-secret-key" });

const encoded = ddu.encode("secret message");
const decoded = ddu.decode(encoded); // 같은 키로만 복호화 가능

// 비밀번호 기반 키는 고유 salt 권장
const ddu2 = new Ddu64({
  encryptionKey: "user password",
  keyDerivation: { algorithm: "pbkdf2", salt: "app-specific-salt", iterations: 210_000 },
});
```

- AES-256-GCM으로 암호화합니다.
- 키 파생 기본값은 `pbkdf2`입니다. (구버전 sha256으로 암호화한 데이터는 `keyDerivation: { algorithm: "sha256" }`로 복호화)

## Checksum

```typescript
const ddu = new Ddu64({ checksum: true });

const encoded = ddu.encode("data"); // CRC32 체크섬 포함
const decoded = ddu.decode(encoded, { checksum: true }); // 무결성 검증 후 반환
```

- 우발적 손상 감지용입니다(변조 방지가 필요하면 `encryptionKey` 사용).
- 5.0 형식은 `CK[P|O][8 hex]` 접미사를 사용합니다. `P`는 plaintext CRC32, `O`는 인코딩 파이프라인 최종 바이트 CRC32입니다.
- 기본 `checksumScope`는 `"output"`입니다. 암호화 시 평문 CRC 노출을 피합니다.
- 디코딩 시에도 `checksum: true`를 지정해야 합니다. 이 옵션이 켜져 있는데 checksum 접미사가 없으면 실패합니다.

## URL-Safe

```typescript
const ddu = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
  urlSafe: true,
});
// +→- /→_ =→. 로 자동 변환
```

## Chunking

```typescript
const ddu = new Ddu64({ chunkSize: 76, chunkSeparator: "\n" });
// 76자마다 구분자 삽입
```

## Obfuscation (한글 난독화)

```typescript
const ddu = new Ddu64({ encryptionKey: "secret", obfuscate: true });
// 출력이 한글 음절 블록(U+AC00–U+D7A3)으로 변환됨 (암호화 필수)
```

난독화는 실제 암호화된 payload에만 적용됩니다. `obfuscate: true`와 `encrypt: false`를 같은 호출에
지정하면 실패합니다.

`checksum: true`와 함께 쓰면 checksum 접미사(`CKO...` / `CKP...`)는 난독화 뒤에 붙는 ASCII 메타데이터로 남습니다.
즉 전체 출력이 한글 음절만으로 구성된다고 가정하면 안 됩니다.

## Async (브라우저)

브라우저 등에서는 비동기 메서드를 사용합니다.

```typescript
import { Ddu64 } from "@ddunigma/node/browser";

const ddu = new Ddu64();
const encoded = await ddu.encodeAsync("browser text");
const decoded = await ddu.decodeAsync(encoded);
```

Node.js에서도 `encodeAsync` / `decodeAsync`를 사용할 수 있습니다.

## Stats

```typescript
const stats = ddu.getStats("payload", { compress: true });
const asyncStats = await ddu.getStatsAsync("payload", { compress: true });
```

`getStats`는 동기 압축 어댑터가 있는 런타임(Node.js)에 적합합니다. 브라우저/Workers처럼 압축이
비동기 Web API로만 제공되는 런타임에서는 `getStatsAsync`를 사용하세요. 두 메서드는 실제 암호화
연산 없이 AES-GCM 와이어 길이를 계산하지만, 압축 적용 여부와 `compressedSize` 산출을 위해 압축은
실제로 수행합니다.

## WASM

대형 payload의 비트 패킹은 선택적으로 WASM 가속을 사용할 수 있습니다. WASM은 자동으로 강제되지 않으며,
사용하려면 애플리케이션 시작 시 `preloadWasm()`을 호출해 준비시키는 것을 권장합니다.

```typescript
import { Ddu64, preloadWasm } from "@ddunigma/node";

await preloadWasm();
const ddu = new Ddu64({ wasmThreshold: 16 * 1024 });
```

## Entry Points

| Import 경로              | 용도                                          |
| ------------------------ | --------------------------------------------- |
| `@ddunigma/node`         | Node.js 전체 기능 (동기+비동기, `Buffer`)     |
| `@ddunigma/node/browser` | 브라우저 / Workers / Deno / Bun (비동기)      |
| `@ddunigma/node/core`    | 최소 코어 (어댑터 직접 주입, WASM helper export) |

## Errors

실패는 `Ddu64Error` 계열로 래핑되며 `code`로 분기할 수 있습니다.

```typescript
import { isDdu64Error, Ddu64ErrorCode } from "@ddunigma/node";

try {
  ddu.decode(input, { checksum: true });
} catch (err) {
  if (isDdu64Error(err) && err.code === Ddu64ErrorCode.ChecksumMismatch) {
    // 체크섬 불일치 처리
  }
}
```

## Options

생성자(`new Ddu64({ ... })`) 또는 호출별(`encode`/`decode`의 두 번째 인자)로 지정합니다.

| Option                 | Type                    | Default     | 설명                            |
| ---------------------- | ----------------------- | ----------- | ------------------------------- |
| `dduSetSymbol`         | `DduSetSymbol`          | `DDU`       | 프리셋 선택                     |
| `compress`             | `boolean`               | `false`     | 압축 사용 여부                  |
| `compressionAlgorithm` | `"deflate" \| "brotli"` | `"deflate"` | 압축 알고리즘                   |
| `compressionLevel`     | `number`                | `6`         | 압축 레벨                       |
| `encryptionKey`        | `string`                | -           | AES-256-GCM 암호화 키           |
| `keyDerivation`        | `KeyDerivationOptions`  | `pbkdf2`    | 키 파생 방식 (레거시: `sha256`) |
| `checksum`             | `boolean`               | `false`     | CRC32 체크섬                    |
| `checksumScope`        | `"plaintext" \| "output"` | `"output"` | CRC32 계산 범위                 |
| `urlSafe`              | `boolean`               | `false`     | URL-Safe 변환                   |
| `obfuscate`            | `boolean`               | `false`     | 한글 난독화 (암호화 필요)       |
| `chunkSize`            | `number`                | -           | 청크 분할 크기                  |
| `chunkSeparator`       | `string`                | `"\n"`      | 청크 구분자                     |
| `maxDecodedBytes`      | `number`                | `67108864`  | 디코딩 크기 제한                |
| `maxDecompressedBytes` | `number`                | `67108864`  | 압축해제 크기 제한              |
| `wasmThreshold`        | `number`                | `16384`     | WASM 사용 임계값 (`Infinity`로 비활성화) |
| `throwOnError`         | `boolean`               | `true`      | 초기화 오류 시 throw            |

## License

BSD-2-Clause
