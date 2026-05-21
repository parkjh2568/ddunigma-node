# ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

## Overview

커스텀 charset을 사용하는 Base64 스타일 인코더/디코더 라이브러리입니다.

한글 종성 결합 시스템을 활용하여 8개 기본 문자 × 8개 종성으로 64가지 조합을 만들어, 6비트를 한 글자로 표현합니다.

## Requirements

- **Node.js >= 18.0.0**

## Install

```bash
npm install @ddunigma/node
```

## Usage

### 기본 인코딩/디코딩

```typescript
import { Ddu64 } from "@ddunigma/node";

// 기본 DDU charset (한글 종성 결합 64개)
const encoder = new Ddu64();

const encoded = encoder.encode("Hello World!");
console.log(encoded); // 읶뜟잉듖욷뜟뎾야잉댯뎽댞욷뜟이약

const decoded = encoder.decode(encoded);
console.log(decoded); // "Hello World!"
```

### 커스텀 charset

```typescript
import { Ddu64 } from "@ddunigma/node";

// 문자열로 charset 지정
const encoder = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=");

// 종성 결합 커스텀 charset
const encoder2 = new Ddu64(["가", "나", "다", "라"], "뭐", {
  codaChar: ["", "ㄱ", "ㄲ", "ㄷ"], // 4×4 = 16개 조합 동적 생성
});
```

### 미리 정의된 Charset

```typescript
import { Ddu64, DduSetSymbol } from "@ddunigma/node";

// DDU (기본값) - 한글 종성 결합 64개
const encoder1 = new Ddu64();

// ONECHARSET - 영문+숫자+특수문자 64개
const encoder2 = new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.ONECHARSET,
});
```

### 압축

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64();

// encode 호출 시 압축 옵션 지정
const text = "반복되는 긴 텍스트...".repeat(100);
const encoded = encoder.encode(text, { compress: true });
const decoded = encoder.decode(encoded); // 자동으로 압축 해제

// 생성자에서 기본 압축 활성화
const compressEncoder = new Ddu64(undefined, undefined, {
  compress: true,
  compressionAlgorithm: "brotli", // 또는 "deflate" (기본값)
});
```

### 암호화

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64(undefined, undefined, {
  encryptionKey: "my-secret-key-123", // AES-256-GCM
});

const encoded = encoder.encode("Secret message!");
const decoded = encoder.decode(encoded); // 자동으로 복호화
```

### URL-Safe 인코딩

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
  urlSafe: true,
});

const encoded = encoder.encode("Hello World!");
// +, /, = 가 -, _, . 로 변환된 URL 안전 문자열
```

### 체크섬

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64();

const encoded = encoder.encode("Important data", { checksum: true });
const decoded = encoder.decode(encoded, { checksum: true });
// 체크섬 불일치 시 에러 발생
```

### 청크 분할

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64();

const encoded = encoder.encode(longData, {
  chunkSize: 76,
  chunkSeparator: "\n",
});
// 76자마다 줄바꿈으로 분할

const decoded = encoder.decode(encoded); // 자동으로 구분자 제거
```

### 비동기 인코딩/디코딩

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64();

const encoded = await encoder.encodeAsync(largeData);
const decoded = await encoder.decodeAsync(encoded);
const buffer = await encoder.decodeToBufferAsync(encoded);
```

### 진행률 콜백

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64();

encoder.encode(largeData, {
  onProgress: (info) => {
    console.log(`${info.percent}% (${info.stage})`);
  },
});
```

### 통계

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64();

const stats = encoder.getStats("Test data", { compress: true });
// { originalSize, encodedSize, compressedSize, compressionRatio, expansionRatio, charsetSize, bitLength }
```

### Zip Bomb 방어

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64(undefined, undefined, {
  maxDecodedBytes: 10 * 1024 * 1024, // 10MB
  maxDecompressedBytes: 50 * 1024 * 1024, // 50MB
});
// 제한 초과 시 에러 발생
```

---

## CharsetBuilder

커스텀 charset을 쉽게 생성할 수 있는 빌더 유틸리티입니다.

```typescript
import { CharsetBuilder } from "@ddunigma/node";

// 유니코드 범위에서 생성
const chars = CharsetBuilder.fromUnicodeRange(0x4e00, 0x4e3f).build();

// Base64 문자셋에서 혼동 문자 제외
const safe = CharsetBuilder.base64().excludeConfusing().build();

// 2의 제곱수로 제한 + 시드 셔플
const shuffled = CharsetBuilder.fromString("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
  .limitToPowerOfTwo()
  .shuffle(12345)
  .build();

// 패딩 문자와 함께 빌드
const { charset, padding } = CharsetBuilder.base64().buildWithPadding();
```

---

## DduPipeline

다단계 인코딩/암호화/압축을 조합할 수 있는 파이프라인 빌더입니다.

```typescript
import { DduPipeline, Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64();

const pipeline = new DduPipeline().compress(6, "brotli").encrypt("my-secret-key").encode(encoder);

const encoded = pipeline.processToString("Hello World!");
const decoded = pipeline.reverse().processToString(encoded);
```

---

## 스트림

대용량 파일 처리를 위한 스트림 인코딩/디코딩을 지원합니다.

```typescript
import { Ddu64, createEncodeStream, createDecodeStream } from "@ddunigma/node";
import fs from "fs";

const encoder = new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.ONECHARSET,
  compress: true,
  encryptionKey: "stream-secret",
});

// 인코딩
fs.createReadStream("input.bin")
  .pipe(createEncodeStream(encoder))
  .pipe(fs.createWriteStream("output.ddu"));

// 디코딩 (헤더에서 압축/암호화 자동 감지)
fs.createReadStream("output.ddu")
  .pipe(createDecodeStream(encoder))
  .pipe(fs.createWriteStream("restored.bin"));
```

---

## DduSetSymbol

| Symbol       | 문자 수 | 비트 길이 | 설명                                 |
| ------------ | ------- | --------- | ------------------------------------ |
| `DDU`        | 64      | 6         | 한글 종성 결합 (8 기본문자 × 8 종성) |
| `ONECHARSET` | 64      | 6         | 영문 + 숫자 + 특수문자               |

Charset은 최대 65,536자까지 지원되며, 각 문자는 단일 문자(1글자)여야 합니다.

---

## API Reference

### `new Ddu64(dduChar?, paddingChar?, options?)`

| Parameter     | Type                    | Description              |
| ------------- | ----------------------- | ------------------------ |
| `dduChar`     | `string \| string[]`    | charset 문자열 또는 배열 |
| `paddingChar` | `string`                | 패딩 문자                |
| `options`     | `DduConstructorOptions` | 옵션 객체                |

**주요 옵션:**

| Option                 | Type                    | Default     | Description                        |
| ---------------------- | ----------------------- | ----------- | ---------------------------------- |
| `dduSetSymbol`         | `DduSetSymbol`          | `DDU`       | 미리 정의된 charset 심볼           |
| `codaChar`             | `string[]`              | `undefined` | 종성 문자 배열 (동적 charset 생성) |
| `encoding`             | `BufferEncoding`        | `'utf-8'`   | 문자열 인코딩                      |
| `compress`             | `boolean`               | `false`     | 기본 압축 활성화                   |
| `compressionAlgorithm` | `"deflate" \| "brotli"` | `'deflate'` | 압축 알고리즘                      |
| `compressionLevel`     | `number`                | `6`         | 압축 레벨                          |
| `urlSafe`              | `boolean`               | `false`     | URL-Safe 모드                      |
| `encryptionKey`        | `string`                | `undefined` | AES-256-GCM 암호화 키              |
| `checksum`             | `boolean`               | `false`     | CRC32 체크섬 활성화                |
| `chunkSize`            | `number`                | `undefined` | 청크 분할 크기                     |
| `chunkSeparator`       | `string`                | `'\n'`      | 청크 구분자                        |
| `maxDecodedBytes`      | `number`                | `67108864`  | 최대 디코딩 바이트 (64MB)          |
| `maxDecompressedBytes` | `number`                | `67108864`  | 최대 압축해제 바이트 (64MB)        |
| `throwOnError`         | `boolean`               | `false`     | 초기화 오류 시 throw 여부          |
| `useRepeatPadding`     | `boolean`               | `false`     | 패딩 문자 반복 방식                |

### 메서드

| Method                                   | Description          |
| ---------------------------------------- | -------------------- |
| `encode(data, options?)`                 | 인코딩 → `string`    |
| `decode(encoded, options?)`              | 디코딩 → `string`    |
| `decodeToBuffer(encoded, options?)`      | 디코딩 → `Buffer`    |
| `encodeAsync(data, options?)`            | 비동기 인코딩        |
| `decodeAsync(encoded, options?)`         | 비동기 디코딩        |
| `decodeToBufferAsync(encoded, options?)` | 비동기 Buffer 디코딩 |
| `getStats(data, options?)`               | 인코딩 통계          |
| `getCharSetInfo()`                       | charset 정보         |

---

## Testing

```bash
pnpm test          # 전체 테스트
pnpm test:watch    # 워치 모드
pnpm test:coverage # 커버리지
```

## Build & Verify

```bash
pnpm build
pnpm lint
pnpm bench
pnpm pack:check
```

---

## Credits

- Original Implementation: [@i3ls](https://github.com/i3l3), [@gunu3371](https://github.com/gunu3371)
- Repository: [ddunigma](https://github.com/i3l3/ddunigma)

## License

BSD-2-Clause
