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
const buffer = ddu.decodeToBuffer(encoded); // Node.js entry only
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

커스텀 charset의 각 심볼과 `paddingChar`는 단일 UTF-16 코드 유닛 문자여야 합니다.
이모지처럼 surrogate pair가 필요한 문자나 여러 문자로 이루어진 심볼은 지원하지 않습니다.

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
브라우저 진입점은 `deflate-raw`를 지원하는 CompressionStream/DecompressionStream 런타임에서 압축을 사용합니다.
브라우저 Brotli는 런타임 지원 여부를 feature detection으로 확인하며, Web API 특성상 `compressionLevel`은 적용되지 않을 수 있습니다.

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

PBKDF2 `iterations`는 기본값이 `210_000`이며, `10_000` 미만의 양수는 `10_000`으로 보정됩니다.
0 이하 또는 유한하지 않은 값은 기본값으로 대체됩니다.

기본 키 파생 방식인 `sha256`은 레거시 호환과 고엔트로피 키를 위한 빠른 단일 해시입니다.
사용자가 입력한 비밀번호처럼 추측 가능한 키를 보호해야 한다면 `pbkdf2`와 애플리케이션별 고유 `salt`를 명시하세요.
고정 기본 salt는 호환성용 fallback이므로, 서비스/테넌트/사용자 범위에 맞는 salt를 직접 관리하는 구성이 더 안전합니다.

## Checksum

```typescript
const ddu = new Ddu64({ checksum: true });

const encoded = ddu.encode("data"); // CRC32 체크섬 포함
const decoded = ddu.decode(encoded); // 무결성 검증 후 반환
```

CRC32 체크섬은 **우발적 손상 감지**용이며 변조 방지(보안) 기능이 아닙니다. 비암호화 출력에서는
공격자가 데이터와 체크섬을 함께 바꿀 수 있으므로, 변조 방지가 필요하면 `encryptionKey`(AES-256-GCM
인증 태그)를 사용하세요.

> ⚠️ `checksum`은 인코딩 파이프라인에 들어가기 전의 **원본(평문)** 바이트에 대해 계산되어 출력 끝에
> 평문으로 덧붙습니다. 따라서 `encryptionKey`와 `checksum`을 함께 쓰면 출력에 평문의 CRC32(32비트)가
> 노출됩니다. 이를 피하려면 `checksumScope: "output"`을 사용하세요(아래). 또는 무결성을 GCM 태그에
> 맡기고 `checksum`을 끄세요.

### checksumScope (opt-in)

```typescript
// 암호화/압축 후의 최종 바이트로 체크섬 계산 (평문 CRC 미노출, 복호화 이전 손상 감지)
const ddu = new Ddu64({
  encryptionKey: "secret",
  checksum: true,
  checksumScope: "output", // 기본값 "plaintext"
});
```

`checksumScope`는 기본값이 `"plaintext"`(레거시 호환)이며, `"output"`은 압축/암호화가 끝난 와이어 바이트의
CRC32를 계산합니다. `checksum`과 마찬가지로 인코딩/디코딩에서 동일하게 지정해야 합니다.

> ℹ️ `checksum`은 와이어 포맷에 자기기술(self-describing) 플래그가 없습니다. `checksum: true`로 인코딩한
> 출력은 디코딩 시에도 `checksum: true`를 지정해야 합니다(아래 "Option Compatibility" 참고).

## URL-Safe

```typescript
const ddu = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
  urlSafe: true,
});

// +→- /→_ =→. 로 자동 변환
const encoded = ddu.encode("URL safe text");
```

charset 또는 패딩 문자가 URL-Safe 충돌 문자(`-`, `_`, `.`)를 포함하면 URL-Safe 모드를 적용할 수 없습니다.
이 경우 `throwOnError: true`이면 생성자에서 에러를 던지고, 기본값(`throwOnError: false`)이면 URL-Safe가
조용히 비활성화됩니다(예: `ONECHARSET`은 `-`, `_`를 포함하므로 URL-Safe와 호환되지 않습니다).

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

인코더 출력과 동일한 난독화 매핑을 외부에서 재현해야 한다면 `createEncoderObfuscationLayer(charSet, paddingChar)`를
사용하세요. 이 헬퍼는 charset/패딩뿐 아니라 footer 마커와 숫자까지 알파벳에 포함하므로 실제 인코더 출력을
안전하게 deobfuscate할 수 있습니다. (`createObfuscationLayer`는 charset/패딩만 포함하므로 마커/숫자가 섞인
인코더 출력에는 적합하지 않습니다.)

## Async (브라우저 호환)

```typescript
// 브라우저에서는 async 메서드 사용
import { Ddu64 } from "@ddunigma/node/browser";

const ddu = new Ddu64();
const encoded = await ddu.encodeAsync("browser text");
const decoded = await ddu.decodeAsync(encoded);
```

Node.js에서도 async 메서드를 사용할 수 있습니다. v4부터 루트 진입점(`@ddunigma/node`)은 런타임 조건형 export를 사용하므로 브라우저 번들러와 Workers 계열 런타임에서는 BrowserAdapter 경로로 해석됩니다. 명시적인 브라우저 경로가 필요하면 `@ddunigma/node/browser`를 사용하세요.
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

인코딩 스트림은 압축/암호화/체크섬이 꺼져 있고 2의 제곱수 charset일 때 청크 단위로 즉시 출력합니다.
디코딩 스트림은 footer의 압축/암호화 메타데이터를 최종 신뢰하므로 payload를 모아 `flush`에서 처리합니다.

## WASM Acceleration

```typescript
import { Ddu64, preloadWasm } from "@ddunigma/node";

await preloadWasm(); // 동기 encode/decode hot path에서 WASM을 쓰려면 먼저 완료되어야 함

const ddu = new Ddu64({
  wasmThreshold: 16 * 1024, // 이 크기 이상일 때 WASM 사용
  // wasmThreshold: Infinity, // WASM hot path 비활성화
});

const encoded = ddu.encode(new Uint8Array(1024 * 1024));
```

`encode()`/`decode()`의 동기 hot path는 이미 로드된 WASM만 사용합니다.
`preloadWasm()`이 완료되지 않았거나 WASM을 사용할 수 없으면 JavaScript로 폴백됩니다.

> 동기 `encode()`/`decode()`에서 WASM 가속을 쓰려면 먼저 `await preloadWasm()`을 완료해야 합니다
> (동기 경로는 온디맨드 초기화를 트리거하지 않습니다). 비동기 경로에서도 WASM은 이미 로드된 경우에만
> 사용됩니다.
>
> 번들러 사용 시: WASM은 `dist/wasm/codec.wasm`에서 로드됩니다. Node.js는 파일시스템으로,
> 브라우저/Workers는 `new URL("./wasm/codec.wasm", import.meta.url)` fetch로 해석합니다. 일부 번들러
> (webpack/Vite 등)는 이 에셋을 자동으로 출력하지 않을 수 있으니, 필요하면 에셋 복사/`?url` import 등
> 번들러별 설정으로 `codec.wasm`을 함께 배포하세요. 로드에 실패하면 JavaScript 구현으로 폴백되므로
> 기능 자체는 동작합니다.

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

`compressedSize`/`compressionRatio`는 `compress: true`일 때 **압축 시도 결과**를 나타냅니다. 압축 결과가
원본보다 크면 실제 출력은 비압축으로 저장되지만, `compressedSize`는 시도된 압축 크기를 그대로 보고합니다.
`encodedSize`는 항상 최종 출력 문자열 길이입니다.

## Size Limits

```typescript
const ddu = new Ddu64({
  maxDecodedBytes: 10 * 1024 * 1024, // 디코딩 최대 크기 (기본 64MB)
  maxDecompressedBytes: 50 * 1024 * 1024, // 압축해제 최대 크기 (기본 64MB)
});
```

## Option Compatibility

압축(`compress`)과 암호화(`encrypt`) 메타데이터는 출력 footer에 기록되어 디코딩 시 자동 감지됩니다.
하지만 다음 옵션들은 와이어 포맷에 자기기술 플래그가 없으므로 **인코딩과 디코딩에서 동일하게 지정**해야 합니다:

| 옵션             | 불일치 시 결과                                                      |
| ---------------- | ------------------------------------------------------------------- |
| `checksum`       | 디코딩에 누락 시 체크섬 접미사를 페이로드로 오인 → 디코드 실패/오류 |
| `urlSafe`        | 불일치 시 `-_.` 치환이 어긋나 디코드 실패                           |
| `obfuscate`      | 불일치 시 역난독화 누락/오적용으로 디코드 실패                      |
| `chunkSeparator` | 커스텀 구분자를 디코더가 모르면 제거되지 않아 디코드 실패           |

같은 설정의 인코더/디코더 인스턴스를 사용하거나, 호출별 옵션을 양쪽에 동일하게 전달하세요.

## Custom Errors

```typescript
import { Ddu64, Ddu64ErrorCode, isDdu64Error } from "@ddunigma/node";

const ddu = new Ddu64({ checksum: true });

try {
  ddu.decode(tamperedInput);
} catch (err) {
  if (isDdu64Error(err) && err.code === Ddu64ErrorCode.ChecksumMismatch) {
    // 체크섬 불일치 처리
  }
}
```

인코딩, 디코딩, 압축, 암호화, 체크섬, charset, 크기 제한, adapter, stream 실패는
`Ddu64Error` 계열로 래핑됩니다. 모든 공개 진입점(`@ddunigma/node`,
`@ddunigma/node/browser`, `@ddunigma/node/core`)에서 같은 에러 타입과
`Ddu64ErrorCode`를 export합니다.

---

## API

### Node Entry

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

### Browser Entry

```typescript
class Ddu64 {
  encode(data: string | Uint8Array, options?: DduOptions): string;
  decode(encoded: string, options?: DduOptions): string;
  decodeToUint8Array(encoded: string, options?: DduOptions): Uint8Array;

  encodeAsync(data: string | Uint8Array, options?: DduOptions): Promise<string>;
  decodeAsync(encoded: string, options?: DduOptions): Promise<string>;
  decodeToUint8ArrayAsync(encoded: string, options?: DduOptions): Promise<Uint8Array>;

  getStats(data: string | Uint8Array, options?: DduOptions): DduEncodeStats;
  getCharSetInfo(): CharSetInfo;
}
```

브라우저 진입점(`@ddunigma/node/browser`)은 `Buffer` API를 노출하지 않습니다.

### Core Entry

```typescript
class Ddu64 {
  encode(data: string | Uint8Array, options?: DduOptions): string;
  decode(encoded: string, options?: DduOptions): string;
  decodeToUint8Array(encoded: string, options?: DduOptions): Uint8Array;

  encodeAsync(data: string | Uint8Array, options?: DduOptions): Promise<string>;
  decodeAsync(encoded: string, options?: DduOptions): Promise<string>;
  decodeToUint8ArrayAsync(encoded: string, options?: DduOptions): Promise<Uint8Array>;

  getStats(data: string | Uint8Array, options?: DduOptions): DduEncodeStats;
  getCharSetInfo(): CharSetInfo;
}
```

코어 진입점(`@ddunigma/node/core`)은 플랫폼 어댑터를 자동 로드하지 않습니다.
압축 또는 암호화가 필요한 async 호출에는 `adapter`를 명시적으로 전달하세요.

## Constructor Options

```typescript
// 옵션만 전달 (권장)
new Ddu64(options?);

// charset 직접 지정
new Ddu64(dduChar, paddingChar, options?);
```

| Option                 | Type                      | Default       | 설명                                                         |
| ---------------------- | ------------------------- | ------------- | ------------------------------------------------------------ |
| `dduSetSymbol`         | `DduSetSymbol`            | `DDU`         | 프리셋 선택                                                  |
| `dduChar`              | `string \| string[]`      | -             | 커스텀 charset                                               |
| `paddingChar`          | `string`                  | -             | 패딩 문자                                                    |
| `codaChar`             | `string[]`                | -             | 종성 조합 문자                                               |
| `compress`             | `boolean`                 | `false`       | 압축 활성화                                                  |
| `compressionAlgorithm` | `"deflate" \| "brotli"`   | `"deflate"`   | 압축 알고리즘                                                |
| `compressionLevel`     | `number`                  | `6`           | 압축 레벨                                                    |
| `encryptionKey`        | `string`                  | -             | AES-256-GCM 암호화 키                                        |
| `keyDerivation`        | `KeyDerivationOptions`    | `sha256`      | 키 파생 방식. 비밀번호 기반 키는 `pbkdf2`와 고유 `salt` 권장 |
| `checksum`             | `boolean`                 | `false`       | CRC32 체크섬                                                 |
| `checksumScope`        | `"plaintext" \| "output"` | `"plaintext"` | 체크섬 계산 범위(`"output"`은 압축/암호화 후 바이트 기준)    |
| `urlSafe`              | `boolean`                 | `false`       | URL-Safe 변환                                                |
| `obfuscate`            | `boolean`                 | `false`       | 한글 난독화                                                  |
| `chunkSize`            | `number`                  | -             | 청크 분할 크기                                               |
| `chunkSeparator`       | `string`                  | `"\n"`        | 청크 구분자                                                  |
| `maxDecodedBytes`      | `number`                  | `67108864`    | 디코딩 크기 제한                                             |
| `maxDecompressedBytes` | `number`                  | `67108864`    | 압축해제 크기 제한                                           |
| `wasmThreshold`        | `number`                  | `16384`       | WASM 사용 임계값 (`Infinity`면 비활성화)                     |
| `throwOnError`         | `boolean`                 | `false`       | 초기화 에러 시 throw                                         |

## Per-Call Options

`encode`, `decode`, `encodeAsync`, `decodeAsync` 등에서 호출별로 오버라이드 가능:

| Option                 | Type                      | 설명               |
| ---------------------- | ------------------------- | ------------------ |
| `compress`             | `boolean`                 | 압축 사용 여부     |
| `compressionAlgorithm` | `"deflate" \| "brotli"`   | 압축 알고리즘      |
| `compressionLevel`     | `number`                  | 압축 레벨          |
| `encrypt`              | `boolean`                 | 암호화 사용 여부   |
| `checksum`             | `boolean`                 | 체크섬 사용 여부   |
| `checksumScope`        | `"plaintext" \| "output"` | 체크섬 계산 범위   |
| `obfuscate`            | `boolean`                 | 난독화 사용 여부   |
| `chunkSize`            | `number`                  | 청크 크기          |
| `maxDecodedBytes`      | `number`                  | 디코딩 크기 제한   |
| `maxDecompressedBytes` | `number`                  | 압축해제 크기 제한 |
| `onProgress`           | `(info) => void`          | 진행률 콜백        |

## Entry Points

| Runtime / Target                | Import Path                      | 용도                                  |
| ------------------------------- | -------------------------------- | ------------------------------------- |
| Node.js server/CLI              | `@ddunigma/node`                 | Node.js 전체 기능 (동기+비동기)       |
| Browser / Vite / webpack        | `@ddunigma/node` 또는 `/browser` | 브라우저 최적화 (BrowserAdapter 기본) |
| Cloudflare Workers / Deno / Bun | `@ddunigma/node` 또는 `/browser` | Node.js 내장 모듈 없는 Web API 경로   |
| Adapter 직접 주입 최소 번들     | `@ddunigma/node/core`            | 최소 코어 (인코딩/디코딩만)           |

루트 진입점은 v4부터 `browser`/`worker`/`workerd`/`deno`/`bun`/`node` 조건을 가진 conditional export입니다. Node.js에서는 기존처럼 `Buffer` API와 NodeAdapter를 노출하고, 브라우저 및 Workers 계열 번들러에서는 Node.js 내장 모듈 없는 BrowserAdapter 경로로 해석됩니다. 런타임 조건을 알 수 없는 ESM 환경의 기본 fallback도 browser 번들을 사용합니다.
Node.js 런타임에서는 `node` 조건이 `index.js`/`index.cjs`를 선택하므로 기본 import로 NodeAdapter와 `decodeToBuffer()`를 사용할 수 있습니다.

## Build & Test

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm pack:check
pnpm bench
```

## License

BSD-2-Clause
