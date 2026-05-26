# ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

커스텀 charset을 사용하는 Base64 스타일 인코더/디코더입니다. 런타임 종속성 없이 한글 종성 조합 charset, 압축, 암호화, 체크섬, 청크 분할, Web Streams, 선택적 WASM 가속을 지원합니다.

## Requirements

- Node.js >= 18.0.0

## Install

```bash
npm install @ddunigma/node
```

## Quick Start

```typescript
import { Ddu64, DduSetSymbol } from "@ddunigma/node";

const ddu = new Ddu64();

const encoded = ddu.encode("안녕하세요");
const decoded = ddu.decode(encoded);

console.log(encoded);
console.log(decoded); // "안녕하세요"

const v1 = new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.DDU_V1,
});

v1.decode(v1.encode("legacy compatible"));
```

## Binary Data

```typescript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64();
const input = new Uint8Array([0, 1, 127, 128, 255]);

const encoded = ddu.encode(input);
const bytes = ddu.decodeToUint8Array(encoded);
const buffer = ddu.decodeToBuffer(encoded); // Node.js Buffer
```

## Browser Entry

```typescript
import { Ddu64 } from "@ddunigma/node/browser";

const ddu = new Ddu64();

const encoded = await ddu.encodeAsync("browser text");
const decoded = await ddu.decodeAsync(encoded);
```

브라우저 진입점에서는 동기 암호화/압축 메서드 대신 `encodeAsync`, `decodeAsync`, `decodeToUint8ArrayAsync`를 사용하세요.

## Presets

```typescript
import { Ddu64, DduSetSymbol } from "@ddunigma/node";

new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.DDU,
});

new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.DDU_V1,
});

new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.ONECHARSET,
});
```

| Symbol | 문자 수 | 설명 |
| --- | ---: | --- |
| `DDU` | 64 | 한글 기본 문자 8개와 종성 8개를 조합 |
| `DDU_V1` | 8 | 기존 8문자 방식 |
| `ONECHARSET` | 64 | 영문, 숫자, 일부 URL 친화 문자 |

## Custom Charset

```typescript
const base64Like = new Ddu64(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
  "=",
);

const hangulCoda = new Ddu64(["가", "나", "다", "라"], "뭐", {
  codaChar: ["", "ㄱ", "ㄲ", "ㄷ"],
});
```

## CharsetBuilder

```typescript
import { CharsetBuilder, Ddu64 } from "@ddunigma/node";

const { charset, padding } = CharsetBuilder.base64()
  .excludeConfusing()
  .limitToPowerOfTwo()
  .buildWithPadding();

const ddu = new Ddu64(charset, padding);
```

```typescript
const chars = CharsetBuilder.fromUnicodeRange(0x4e00, 0x4e7f)
  .shuffle(12345)
  .limitToPowerOfTwo()
  .build();
```

## Compression

```typescript
const ddu = new Ddu64(undefined, undefined, {
  compress: true,
  compressionAlgorithm: "deflate",
  compressionLevel: 6,
});

const encoded = ddu.encode("A".repeat(1000));
const decoded = ddu.decode(encoded);
```

```typescript
const brotli = new Ddu64(undefined, undefined, {
  compress: true,
  compressionAlgorithm: "brotli",
  compressionLevel: 8,
});
```

압축은 암호화 전에 적용됩니다. 그래서 `compress: true`와 `encryptionKey`를 함께 사용해도 반복 데이터의 압축 이득을 유지합니다.

## Encryption

```typescript
const ddu = new Ddu64(undefined, undefined, {
  encryptionKey: "my-secret-key",
});

const encoded = ddu.encode("secret message");
const decoded = ddu.decode(encoded);
```

PBKDF2를 사용하려면 `keyDerivation`을 지정합니다.

```typescript
const ddu = new Ddu64(undefined, undefined, {
  encryptionKey: "user password",
  keyDerivation: {
    algorithm: "pbkdf2",
    salt: "app-or-user-specific-salt",
    iterations: 210_000,
    hash: "SHA-256",
  },
});
```

동일한 데이터 복호화를 다른 인스턴스에서 수행하려면 같은 `encryptionKey`와 같은 `keyDerivation` 옵션을 사용해야 합니다.

## Checksum

```typescript
const ddu = new Ddu64(undefined, undefined, {
  checksum: true,
});

const encoded = ddu.encode("checksum data");
const decoded = ddu.decode(encoded);
```

체크섬은 복원된 원본 데이터 기준으로 검증됩니다.

## URL-Safe

```typescript
const ddu = new Ddu64(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
  "=",
  { urlSafe: true },
);

const encoded = ddu.encode("URL safe text");
```

`urlSafe`는 `+`, `/`, `=`를 각각 `-`, `_`, `.`로 변환합니다. charset 또는 padding에 `-`, `_`, `.`가 포함되어 있으면 활성화되지 않습니다.

## Chunking

```typescript
const ddu = new Ddu64(undefined, undefined, {
  chunkSize: 76,
  chunkSeparator: "\n",
});

const encoded = ddu.encode("long data ".repeat(100));
const decoded = ddu.decode(encoded);
```

## Async

```typescript
const ddu = new Ddu64(undefined, undefined, {
  compress: true,
  encryptionKey: "async-key",
});

const encoded = await ddu.encodeAsync("large async data");
const decoded = await ddu.decodeAsync(encoded);
const bytes = await ddu.decodeToUint8ArrayAsync(encoded);
```

## Progress

```typescript
const ddu = new Ddu64(undefined, undefined, { compress: true });

ddu.encode("progress data", {
  onProgress: ({ percent, stage }) => {
    console.log(percent, stage);
  },
});
```

`stage` 값은 `start`, `compress`, `encrypt`, `encode`, `decode`, `decrypt`, `decompress`, `checksum`, `done` 중 하나입니다.

## Limits

```typescript
const ddu = new Ddu64(undefined, undefined, {
  maxDecodedBytes: 10 * 1024 * 1024,
  maxDecompressedBytes: 50 * 1024 * 1024,
});
```

## Web Streams

```typescript
import {
  Ddu64,
  createReadableEncodeStream,
  createReadableDecodeStream,
} from "@ddunigma/node";

const ddu = new Ddu64(undefined, undefined, {
  compress: true,
  encryptionKey: "stream-key",
});

const encodedStream = readableByteStream.pipeThrough(
  createReadableEncodeStream(ddu, { compress: true }),
);

const decodedStream = encodedStream.pipeThrough(createReadableDecodeStream(ddu));
```

`createReadableEncodeStream`은 `TransformStream<Uint8Array, string>`을 반환하고, `createReadableDecodeStream`은 `TransformStream<string, Uint8Array>`을 반환합니다.

## WASM

```typescript
import { Ddu64, preloadWasm } from "@ddunigma/node";

await preloadWasm();

const ddu = new Ddu64(undefined, undefined, {
  wasmThreshold: 4096,
});

const encoded = ddu.encode(new Uint8Array(1024 * 1024));
```

WASM을 사용할 수 없으면 JavaScript 구현으로 자동 폴백됩니다.

## Stats

```typescript
const ddu = new Ddu64(undefined, undefined, {
  compress: true,
});

const stats = ddu.getStats("A".repeat(1000));
```

```typescript
type DduEncodeStats = {
  originalSize: number;
  encodedSize: number;
  compressedSize?: number;
  compressionRatio?: number;
  expansionRatio: number;
  charsetSize: number;
  bitLength: number;
};
```

## Options

### Constructor

```typescript
new Ddu64(dduChar?, paddingChar?, options?);
```

| Option | Type | Default |
| --- | --- | --- |
| `dduSetSymbol` | `DduSetSymbol` | `DduSetSymbol.DDU` |
| `dduChar` | `string \| string[]` | preset charset |
| `paddingChar` | `string` | preset padding |
| `codaChar` | `string[]` | `undefined` |
| `requiredLength` | `number` | charset length |
| `usePowerOfTwo` | `boolean` | `true` |
| `throwOnError` | `boolean` | `false` |
| `compress` | `boolean` | `false` |
| `compressionAlgorithm` | `"deflate" \| "brotli"` | `"deflate"` |
| `compressionLevel` | `number` | `6` |
| `encryptionKey` | `string` | `undefined` |
| `keyDerivation` | `KeyDerivationOptions` | `{ algorithm: "sha256" }` |
| `checksum` | `boolean` | `false` |
| `urlSafe` | `boolean` | `false` |
| `chunkSize` | `number` | `undefined` |
| `chunkSeparator` | `string` | `"\n"` |
| `maxDecodedBytes` | `number` | `67108864` |
| `maxDecompressedBytes` | `number` | `67108864` |
| `obfuscate` | `boolean` | `false` |
| `wasmThreshold` | `number` | `4096` |
| `adapter` | `PlatformAdapter` | auto |

### Per Call

`encode`, `decode`, `decodeToUint8Array`, `encodeAsync`, `decodeAsync`, `decodeToUint8ArrayAsync`, `getStats`에서 사용할 수 있습니다.

| Option | Type |
| --- | --- |
| `compress` | `boolean` |
| `compressionAlgorithm` | `"deflate" \| "brotli"` |
| `compressionLevel` | `number` |
| `encrypt` | `boolean` |
| `checksum` | `boolean` |
| `chunkSize` | `number` |
| `chunkSeparator` | `string` |
| `maxDecodedBytes` | `number` |
| `maxDecompressedBytes` | `number` |
| `obfuscate` | `boolean` |
| `onProgress` | `(info: DduProgressInfo) => void` |

### Key Derivation

```typescript
type KeyDerivationOptions = {
  algorithm?: "sha256" | "pbkdf2";
  salt?: string | Uint8Array;
  iterations?: number;
  hash?: "SHA-256" | "SHA-384" | "SHA-512";
};
```

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

## Build And Test

```bash
pnpm test
pnpm build
pnpm lint
pnpm bench
pnpm pack:check
```

## License

BSD-2-Clause
