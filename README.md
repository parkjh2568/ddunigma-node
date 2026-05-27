# ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

커스텀 charset을 사용하는 Base64 스타일 인코더/디코더 라이브러리입니다.

V2 추가사항

- 이제 한글 종성 결합 시스템을 활용하여 8개 기본 문자 × 8개 종성으로 64가지 조합을 만들어, 6비트를 한 글자로 표현합니다.

### Credits

- Original Python Implementation by:
  - [@i3ls](https://github.com/i3l3)
  - [@gunu3371](https://github.com/gunu3371)
- Original Repository: [ddunigma](https://github.com/i3l3/ddunigma)

## Requirements

- **Node.js >= 18.0.0**

## Install

```bash
npm install @ddunigma/node
```

## Quick Start

```typescript
import { Ddu64, DduSetSymbol } from "@ddunigma/node";

// V2 (기본, 한글 종성 결합 64개)
const ddu = new Ddu64();
ddu.encode("안녕하세요"); // "뎯땩잇땨뎪뎨잇잉뎯욱잇우뎯땨읶뎨뎯땩듂잊"
ddu.decode("뎯땩잇땨뎪뎨잇잉뎯욱잇우뎯땨읶뎨뎯땩듂잊"); // "안녕하세요"

// V1 (구버전 호환, 8개 문자 쌍 방식)
const dduV1 = new Ddu64({ dduSetSymbol: DduSetSymbol.DDU_V1 });
dduV1.encode("안녕하세요"); // ".우땨땨이?땨뜌.이.뜌이?이!.우우땨이?우뜌.우땨뜌이이.뜌.우땨땨!이이야"
dduV1.decode(".우땨땨이?땨뜌.이.뜌이?이!.우우땨이?우뜌.우땨뜌이이.뜌.우땨땨!이이야"); // "안녕하세요"
```

---

## Binary Data

```typescript
const ddu = new Ddu64();
const input = new Uint8Array([0, 1, 127, 128, 255]);

const encoded = ddu.encode(input);
const bytes = ddu.decodeToUint8Array(encoded);
const buffer = ddu.decodeToBuffer(encoded); // Node.js Buffer
```

## Presets

```typescript
import { Ddu64, DduSetSymbol } from "@ddunigma/node";

// 기본값 - 한글 종성 결합 64문자
new Ddu64();

// 구버전 호환 8문자 (아래 두 방법 모두 사용가능)
new Ddu64({ dduSetSymbol: DduSetSymbol.DDU_V1 });
new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.DDU_V1 });

// 영문+숫자 64문자 (아래 두 방법 모두 사용가능)
new Ddu64({ dduSetSymbol: DduSetSymbol.ONECHARSET });
new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.ONECHARSET });
```

| Symbol       | 문자 수 | 설명                               |
| ------------ | ------: | ---------------------------------- |
| `DDU`        |      64 | 한글 기본 문자 8개 × 종성 8개 조합 |
| `DDU_V1`     |       8 | 기존 8문자 쌍 방식 (하위 호환)     |
| `ONECHARSET` |      64 | 영문, 숫자, 일부 특수문자          |

## Custom Charset

```typescript
// 문자열로 직접 지정
const base64Like = new Ddu64(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
  "=",
);

// 한글 종성 조합으로 커스텀 charset 생성
const hangulCoda = new Ddu64(["가", "나", "다", "라"], "뭐", {
  codaChar: ["", "ㄱ", "ㄲ", "ㄷ"],
});
// → 가, 각, 갂, 갇, 나, 낙, 낚, 낟, 다, 닥, 닦, 닫, 라, 락, 랔, 랗 (16문자)
```

## CharsetBuilder

```typescript
import { CharsetBuilder, Ddu64 } from "@ddunigma/node";

// Base64에서 혼동 문자 제거 후 2의 제곱수로 맞추기
const { charset, padding } = CharsetBuilder.base64()
  .excludeConfusing()
  .limitToPowerOfTwo()
  .buildWithPadding();

const ddu = new Ddu64(charset, padding);

// 유니코드 범위에서 생성
const chars = CharsetBuilder.fromUnicodeRange(0x4e00, 0x4e3f)
  .shuffle(12345)
  .limitToPowerOfTwo()
  .build();
```

## Compression

```typescript
const ddu = new Ddu64({
  compress: true, // 압축 활성화
  compressionAlgorithm: "deflate", // "deflate" | "brotli"
  compressionLevel: 6, // deflate: 0-9, brotli: 0-11
});

const encoded = ddu.encode("A".repeat(1000)); // 압축되어 짧아짐
const decoded = ddu.decode(encoded);
```

압축은 원본보다 작아질 때만 적용됩니다. 압축 결과가 더 크면 비압축으로 저장됩니다.

## Encryption

```typescript
// SHA-256 키 파생 (기본)
const ddu = new Ddu64({
  encryptionKey: "my-secret-key",
});

const encoded = ddu.encode("secret message");
const decoded = ddu.decode(encoded); // 같은 키로만 복호화 가능

// PBKDF2 키 파생
const dduPbkdf2 = new Ddu64({
  encryptionKey: "user password",
  keyDerivation: {
    algorithm: "pbkdf2",
    salt: "app-specific-salt",
    iterations: 210_000,
    hash: "SHA-256",
  },
});
```

## Checksum

```typescript
const ddu = new Ddu64({ checksum: true });

const encoded = ddu.encode("data"); // CRC32 체크섬 포함
const decoded = ddu.decode(encoded); // 무결성 검증 후 반환
```

## URL-Safe

```typescript
const ddu = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
  urlSafe: true,
});

// +→- /→_ =→. 로 자동 변환
const encoded = ddu.encode("URL safe text");
```

## Chunking

```typescript
const ddu = new Ddu64({
  chunkSize: 76,
  chunkSeparator: "\n",
});

const encoded = ddu.encode("long data ".repeat(100));
// 76자마다 줄바꿈 삽입
```

## Obfuscation (한글 난독화)

```typescript
const ddu = new Ddu64({
  encryptionKey: "secret",
  obfuscate: true, // 암호화 필수
});

const encoded = ddu.encode("hello");
// 출력이 한글 음절 블록(U+AC00–U+D7A3)으로 변환됨
```

## Async (브라우저 호환)

```typescript
// 브라우저에서는 async 메서드 사용
import { Ddu64 } from "@ddunigma/node/browser";

const ddu = new Ddu64();
const encoded = await ddu.encodeAsync("browser text");
const decoded = await ddu.decodeAsync(encoded);
```

Node.js에서도 async 메서드를 사용할 수 있습니다. 브라우저 진입점(`@ddunigma/node/browser`)은 Node.js 내장 모듈을 임포트하지 않습니다.
코어 진입점(`@ddunigma/node/core`)은 기본 인코딩/디코딩만 포함하며, 압축/암호화가 필요하면 명시적으로 어댑터를 전달하세요.

## Web Streams

```typescript
import { Ddu64, createReadableEncodeStream, createReadableDecodeStream } from "@ddunigma/node";

const ddu = new Ddu64({
  compress: true,
  encryptionKey: "stream-key",
});

const encodedStream = readableByteStream.pipeThrough(
  createReadableEncodeStream(ddu, { compress: true }),
);

const decodedStream = encodedStream.pipeThrough(createReadableDecodeStream(ddu));
```

## WASM Acceleration

```typescript
import { Ddu64, preloadWasm } from "@ddunigma/node";

await preloadWasm(); // 선택적 사전 로드

const ddu = new Ddu64({
  wasmThreshold: 4096, // 이 크기 이상일 때 WASM 사용
});

const encoded = ddu.encode(new Uint8Array(1024 * 1024));
```

WASM을 사용할 수 없으면 JavaScript로 자동 폴백됩니다.

## Progress Callback

```typescript
const ddu = new Ddu64({ compress: true });

ddu.encode("data", {
  onProgress: ({ percent, stage }) => {
    console.log(`${stage}: ${percent}%`);
    // stage: start → compress → encrypt → encode → done
  },
});
```

## Stats

```typescript
const ddu = new Ddu64({ compress: true });
const stats = ddu.getStats("A".repeat(1000));

// { originalSize, encodedSize, compressedSize, compressionRatio, expansionRatio, charsetSize, bitLength }
```

## Size Limits

```typescript
const ddu = new Ddu64({
  maxDecodedBytes: 10 * 1024 * 1024, // 디코딩 최대 크기 (기본 64MB)
  maxDecompressedBytes: 50 * 1024 * 1024, // 압축해제 최대 크기 (기본 64MB)
});
```

---

## API

```typescript
class Ddu64 {
  encode(data: string | Uint8Array, options?: DduOptions): string;
  decode(encoded: string, options?: DduOptions): string;
  decodeToUint8Array(encoded: string, options?: DduOptions): Uint8Array;
  decodeToBuffer(encoded: string, options?: DduOptions): Buffer;

  encodeAsync(data: string | Uint8Array, options?: DduOptions): Promise<string>;
  decodeAsync(encoded: string, options?: DduOptions): Promise<string>;
  decodeToUint8ArrayAsync(encoded: string, options?: DduOptions): Promise<Uint8Array>;
  decodeToBufferAsync(encoded: string, options?: DduOptions): Promise<Buffer>;

  getStats(data: string | Uint8Array, options?: DduOptions): DduEncodeStats;
  getCharSetInfo(): CharSetInfo;
}
```

## Constructor Options

```typescript
// 옵션만 전달 (권장)
new Ddu64(options?);

// charset 직접 지정
new Ddu64(dduChar, paddingChar, options?);
```

| Option                 | Type                    | Default     | 설명                  |
| ---------------------- | ----------------------- | ----------- | --------------------- |
| `dduSetSymbol`         | `DduSetSymbol`          | `DDU`       | 프리셋 선택           |
| `dduChar`              | `string \| string[]`    | -           | 커스텀 charset        |
| `paddingChar`          | `string`                | -           | 패딩 문자             |
| `codaChar`             | `string[]`              | -           | 종성 조합 문자        |
| `compress`             | `boolean`               | `false`     | 압축 활성화           |
| `compressionAlgorithm` | `"deflate" \| "brotli"` | `"deflate"` | 압축 알고리즘         |
| `compressionLevel`     | `number`                | `6`         | 압축 레벨             |
| `encryptionKey`        | `string`                | -           | AES-256-GCM 암호화 키 |
| `keyDerivation`        | `KeyDerivationOptions`  | `sha256`    | 키 파생 방식          |
| `checksum`             | `boolean`               | `false`     | CRC32 체크섬          |
| `urlSafe`              | `boolean`               | `false`     | URL-Safe 변환         |
| `obfuscate`            | `boolean`               | `false`     | 한글 난독화           |
| `chunkSize`            | `number`                | -           | 청크 분할 크기        |
| `chunkSeparator`       | `string`                | `"\n"`      | 청크 구분자           |
| `maxDecodedBytes`      | `number`                | `67108864`  | 디코딩 크기 제한      |
| `maxDecompressedBytes` | `number`                | `67108864`  | 압축해제 크기 제한    |
| `wasmThreshold`        | `number`                | `4096`      | WASM 사용 임계값      |
| `throwOnError`         | `boolean`               | `false`     | 초기화 에러 시 throw  |

## Per-Call Options

`encode`, `decode`, `encodeAsync`, `decodeAsync` 등에서 호출별로 오버라이드 가능:

| Option                 | Type                    | 설명               |
| ---------------------- | ----------------------- | ------------------ |
| `compress`             | `boolean`               | 압축 사용 여부     |
| `compressionAlgorithm` | `"deflate" \| "brotli"` | 압축 알고리즘      |
| `compressionLevel`     | `number`                | 압축 레벨          |
| `encrypt`              | `boolean`               | 암호화 사용 여부   |
| `checksum`             | `boolean`               | 체크섬 사용 여부   |
| `obfuscate`            | `boolean`               | 난독화 사용 여부   |
| `chunkSize`            | `number`                | 청크 크기          |
| `maxDecodedBytes`      | `number`                | 디코딩 크기 제한   |
| `maxDecompressedBytes` | `number`                | 압축해제 크기 제한 |
| `onProgress`           | `(info) => void`        | 진행률 콜백        |

## Entry Points

| Import Path              | 용도                                  |
| ------------------------ | ------------------------------------- |
| `@ddunigma/node`         | Node.js 전체 기능 (동기+비동기)       |
| `@ddunigma/node/browser` | 브라우저 최적화 (BrowserAdapter 기본) |
| `@ddunigma/node/core`    | 최소 코어 (인코딩/디코딩만)           |

## Build & Test

```bash
pnpm test
pnpm build
pnpm lint
pnpm bench
```

## License

BSD-2-Clause
