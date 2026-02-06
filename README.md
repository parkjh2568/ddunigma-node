## ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

## Overview

Node.js implementation of [ddunigma](https://github.com/i3l3/ddunigma) (Python original)

커스텀 charset을 사용하는 Base64 스타일 인코더/디코더 라이브러리입니다.

### Credits

- Original Python Implementation by:
  - [@i3ls](https://github.com/i3l3)
  - [@gunu3371](https://github.com/gunu3371)
- Original Repository: [ddunigma](https://github.com/i3l3/ddunigma)

## Requirements

- **Node.js >= 14.0.0**

## Install

```bash
npm install @ddunigma/node
```

## Usage

### 기본 인코딩/디코딩

```typescript
import { Ddu64 } from "@ddunigma/node";

// 커스텀 charset으로 인코더 생성
const encoder = new Ddu64("우따야", "뭐");

const text = "Hello World!";
const encoded = encoder.encode(text);
console.log(encoded); // 우따야뭐우따... (인코딩된 문자열)

const decoded = encoder.decode(encoded);
console.log(decoded); // "Hello World!"
```

### 미리 정의된 Charset 사용

```typescript
import { Ddu64, DduSetSymbol } from "@ddunigma/node";

// ONECHARSET (64개 문자)
const encoder1 = new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.ONECHARSET,
});

// DDU (8개 문자)
const encoder2 = new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.DDU,
});

// TWOCHARSET (1024개 문자)
const encoder3 = new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.TWOCHARSET,
});

// THREECHARSET (32768개 문자)
const encoder4 = new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.THREECHARSET,
});

const text = "안녕하세요";
const encoded = encoder1.encode(text);
const decoded = encoder1.decode(encoded);
```

### 압축 인코딩

```typescript
import { Ddu64 } from "@ddunigma/node";

// 생성자에서 기본 압축 활성화
const encoder = new Ddu64(undefined, undefined, {
  compress: true,
});

// 또는 encode 호출 시 압축 옵션 지정
const text = "반복되는 긴 텍스트...".repeat(100);
const encoded = encoder.encode(text, { compress: true });
const decoded = encoder.decode(encoded); // 자동으로 압축 해제
```

### URL-Safe 인코딩

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.ONECHARSET,
  urlSafe: true, // +, /, = 를 URL 안전 문자로 변환
});

const encoded = encoder.encode("Hello World!");
// URL에서 안전하게 사용 가능한 문자열 반환
```

### 체크섬 (무결성 검증)

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64(undefined, undefined, {
  checksum: true, // CRC32 체크섬 활성화
});

const encoded = encoder.encode("Important data", { checksum: true });
const decoded = encoder.decode(encoded); // 자동으로 체크섬 검증
// 체크섬 불일치 시 에러 발생
```

### 암호화

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64(undefined, undefined, {
  encryptionKey: "my-secret-key-123", // AES-256-GCM 암호화
});

const encoded = encoder.encode("Secret message!");
const decoded = encoder.decode(encoded); // 자동으로 복호화
```

### 청크 분할

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64();

const encoded = encoder.encode(longData, {
  chunkSize: 76, // 76자마다 분할
  chunkSeparator: "\n", // 줄바꿈으로 구분
});
// 결과: "ABCDxyz...\nEFGHijk...\n..."

const decoded = encoder.decode(encoded); // 자동으로 줄바꿈 제거
```

### 비동기 인코딩/디코딩

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64();

// 비동기 인코딩 (이벤트 루프 블로킹 방지)
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
    console.log(`진행률: ${info.percent}%`);
    console.log(`처리됨: ${info.processedBytes}/${info.totalBytes}`);
  },
});
```

### 통계/분석

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64();

const stats = encoder.getStats("Test data", { compress: true });
console.log(stats);
// {
//   originalSize: 9,
//   encodedSize: 12,
//   compressedSize: 17,
//   compressionRatio: 1.89,
//   expansionRatio: 1.33,
//   charsetSize: 64,
//   bitLength: 6
// }
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
const chars1 = CharsetBuilder.fromUnicodeRange(0x4e00, 0x4e3f).build();

// Base64 문자셋
const chars2 = CharsetBuilder.base64().build();

// 혼동 문자 제외 (0, O, 1, l, I 등)
const chars3 = CharsetBuilder.base64().excludeConfusing().build();

// 2의 제곱수로 제한
const chars4 = CharsetBuilder.fromString("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
  .limitToPowerOfTwo()
  .build(); // 32자

// URL 안전 문자만
const chars5 = CharsetBuilder.base64().excludeUrlUnsafe().build();

// 시드 기반 셔플
const chars6 = CharsetBuilder.base64().shuffle(12345).build();

// 패딩 문자와 함께 빌드
const { charset, padding } = CharsetBuilder.base64().buildWithPadding();
```

---

## DduPipeline

다단계 인코딩/암호화/압축을 조합할 수 있는 파이프라인 빌더입니다.

```typescript
import { DduPipeline, Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64();

// 압축 → 암호화 → 인코딩 파이프라인
const pipeline = new DduPipeline()
  .compress()
  .encrypt("my-secret-key")
  .encode(encoder);

const encoded = pipeline.processToString("Hello World!");

// 역순 파이프라인으로 복원
const decoded = pipeline.reverse().processToString(encoded);
```

---

## 스트림 지원

대용량 파일 처리를 위한 스트림 인코딩/디코딩을 지원합니다.

```typescript
import { Ddu64, createEncodeStream, createDecodeStream } from "@ddunigma/node";
import fs from "fs";

const encoder = new Ddu64();

// 인코딩 스트림
fs.createReadStream("input.bin")
  .pipe(createEncodeStream(encoder))
  .pipe(fs.createWriteStream("output.txt"));

// 디코딩 스트림
fs.createReadStream("output.txt")
  .pipe(createDecodeStream(encoder))
  .pipe(fs.createWriteStream("restored.bin"));
```

---

## API Reference

### `new Ddu64(dduChar?, paddingChar?, options?)`

인코더 인스턴스를 생성합니다.

**Parameters:**

| Parameter     | Type                    | Description              |
| ------------- | ----------------------- | ------------------------ |
| `dduChar`     | `string \| string[]`    | charset 문자열 또는 배열 |
| `paddingChar` | `string`                | 패딩 문자                |
| `options`     | `DduConstructorOptions` | 옵션 객체                |

**DduConstructorOptions:**

| Option                 | Type             | Default     | Description                 |
| ---------------------- | ---------------- | ----------- | --------------------------- |
| `dduSetSymbol`         | `DduSetSymbol`   | `DDU`       | 미리 정의된 charset 심볼    |
| `encoding`             | `BufferEncoding` | `'utf-8'`   | 문자열 인코딩               |
| `usePowerOfTwo`        | `boolean`        | `true`      | 2의 제곱수 강제 여부        |
| `useBuildErrorReturn`  | `boolean`        | `false`     | 에러 발생 시 throw 여부     |
| `compress`             | `boolean`        | `false`     | 기본 압축 활성화            |
| `maxDecodedBytes`      | `number`         | `67108864`  | 최대 디코딩 바이트 (64MB)   |
| `maxDecompressedBytes` | `number`         | `67108864`  | 최대 압축해제 바이트 (64MB) |
| `urlSafe`              | `boolean`        | `false`     | URL-Safe 모드               |
| `encryptionKey`        | `string`         | `undefined` | AES-256-GCM 암호화 키       |
| `checksum`             | `boolean`        | `false`     | CRC32 체크섬 활성화         |
| `chunkSize`            | `number`         | `undefined` | 청크 분할 크기              |
| `chunkSeparator`       | `string`         | `'\n'`      | 청크 구분자                 |

### `encode(data, options?): string`

데이터를 인코딩합니다.

**DduOptions:**

| Option           | Type       | Description      |
| ---------------- | ---------- | ---------------- |
| `compress`       | `boolean`  | 압축 사용 여부   |
| `checksum`       | `boolean`  | 체크섬 추가 여부 |
| `chunkSize`      | `number`   | 청크 분할 크기   |
| `chunkSeparator` | `string`   | 청크 구분자      |
| `onProgress`     | `function` | 진행률 콜백      |

### `decode(encoded, options?): string`

인코딩된 문자열을 디코딩합니다.

### `decodeToBuffer(encoded, options?): Buffer`

인코딩된 문자열을 Buffer로 직접 디코딩합니다.

### `encodeAsync(data, options?): Promise<string>`

비동기로 데이터를 인코딩합니다.

### `decodeAsync(encoded, options?): Promise<string>`

비동기로 데이터를 디코딩합니다.

### `decodeToBufferAsync(encoded, options?): Promise<Buffer>`

비동기로 Buffer로 디코딩합니다.

### `getStats(data, options?): DduEncodeStats`

인코딩 통계 정보를 반환합니다.

```typescript
{
  originalSize: number;      // 원본 데이터 크기
  encodedSize: number;       // 인코딩된 문자열 길이
  compressedSize?: number;   // 압축된 크기
  compressionRatio?: number; // 압축률 (0-1)
  expansionRatio: number;    // 인코딩 확장 비율
  charsetSize: number;       // charset 크기
  bitLength: number;         // 비트 길이
}
```

### `getCharSetInfo(): CharSetInfo`

현재 인코더의 charset 정보를 반환합니다.

---

## DduSetSymbol

| Symbol         | 문자 수 | 비트 길이 | 설명                      |
| -------------- | ------- | --------- | ------------------------- |
| `DDU`          | 8       | 3         | 한글 + 특수문자 기본 세트 |
| `ONECHARSET`   | 64      | 6         | 영문 + 숫자 + 특수문자    |
| `TWOCHARSET`   | 1024    | 10        | 2글자 조합 세트           |
| `THREECHARSET` | 32768   | 15        | 3글자 조합 세트           |

---

## License

BSD-2-Clause
