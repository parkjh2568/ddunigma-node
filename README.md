## ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

## Overview

Node.js implementation of [ddunigma](https://github.com/i3l3/ddunigma) (Python original)

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

### 간단한 문자열 인코딩/디코딩

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
const decodedBuffer = encoder1.decodeToBuffer(encoded);
```

### 커스텀 Charset 사용

```typescript
import { Ddu64 } from "@ddunigma/node";

const koreanChars = [
  "뜌", "뜍", "뜎", "뜏", "뜐", "뜑", "뜒", "뜓",
  "뜔", "뜕", "뜖", "뜗", "뜘", "뜙", "뜚", "뜛",
  "뜜", "뜝", "뜞", "뜟", "뜠", "뜡", "뜢", "뜣",
  "뜨", "뜩", "뜪", "뜫",
  // ... 256개 문자
];

const encoder = new Ddu64(koreanChars, "뭐");

const text = "안녕하세요12";
const encoded = encoder.encode(text);
const decoded = encoder.decode(encoded);
const decodedBuffer = encoder.decodeToBuffer(encoded);
```

### 압축 인코딩 사용

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

### Zip Bomb 방어 설정

```typescript
import { Ddu64 } from "@ddunigma/node";

// 디코딩/압축해제 크기 제한 설정 (기본값: 64MB)
const encoder = new Ddu64(undefined, undefined, {
  maxDecodedBytes: 10 * 1024 * 1024, // 10MB
  maxDecompressedBytes: 50 * 1024 * 1024, // 50MB
});

// 또는 decode 호출 시 옵션 지정
const decoded = encoder.decode(encoded, {
  maxDecodedBytes: 1024 * 1024, // 1MB
});
```

## API

### `new Ddu64(dduChar?, paddingChar?, options?)`

인코더 인스턴스를 생성합니다.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `dduChar` | `string \| string[]` | charset 문자열 또는 배열 |
| `paddingChar` | `string` | 패딩 문자 |
| `options` | `DduConstructorOptions` | 옵션 객체 |

**DduConstructorOptions:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dduSetSymbol` | `DduSetSymbol` | `DDU` | 미리 정의된 charset 심볼 |
| `encoding` | `BufferEncoding` | `'utf-8'` | 문자열 인코딩 |
| `usePowerOfTwo` | `boolean` | `true` | 2의 제곱수 강제 여부 |
| `useBuildErrorReturn` | `boolean` | `false` | 에러 발생 시 throw 여부 |
| `compress` | `boolean` | `false` | 기본 압축 활성화 |
| `maxDecodedBytes` | `number` | `67108864` | 최대 디코딩 바이트 (64MB) |
| `maxDecompressedBytes` | `number` | `67108864` | 최대 압축해제 바이트 (64MB) |

### `encode(data, options?): string`

데이터를 인코딩합니다.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `string \| Buffer` | 인코딩할 데이터 |
| `options.compress` | `boolean` | 압축 사용 여부 |

**Returns:** 인코딩된 문자열

### `decode(encoded, options?): string`

인코딩된 문자열을 디코딩합니다.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `encoded` | `string` | 인코딩된 문자열 |
| `options.maxDecodedBytes` | `number` | 최대 디코딩 바이트 |
| `options.maxDecompressedBytes` | `number` | 최대 압축해제 바이트 |

**Returns:** 디코딩된 문자열

### `decodeToBuffer(encoded, options?): Buffer`

인코딩된 문자열을 Buffer로 직접 디코딩합니다.

**Parameters:** `decode`와 동일

**Returns:** 디코딩된 Buffer

### `getCharSetInfo(): CharSetInfo`

현재 인코더의 charset 정보를 반환합니다.

**Returns:**

```typescript
{
  charSet: string[];
  paddingChar: string;
  charLength: number;
  bitLength: number;
  usePowerOfTwo: boolean;
  encoding: BufferEncoding;
  defaultCompress: boolean;
  defaultMaxDecodedBytes: number;
  defaultMaxDecompressedBytes: number;
}
```

## DduSetSymbol

| Symbol | 문자 수 | 비트 길이 | 설명 |
|--------|---------|-----------|------|
| `DDU` | 8 | 3 | 한글 + 특수문자 기본 세트 |
| `ONECHARSET` | 64 | 6 | 영문 + 숫자 + 특수문자 |
| `TWOCHARSET` | 1024 | 10 | 2글자 조합 세트 |
| `THREECHARSET` | 32768 | 15 | 3글자 조합 세트 |
