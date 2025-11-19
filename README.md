## ddunigma Node 
[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

## Overview 

Node.js implementation of [ddunigma](https://github.com/i3l3/ddunigma) (Python original)

### Credits

- Original Python Implementation by:
  - [@i3ls](https://github.com/i3l3)
  - [@gunu3371](https://github.com/gunu3371)
- Original Repository: [ddunigma](https://github.com/i3l3/ddunigma)

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
  dduSetSymbol: DduSetSymbol.ONECHARSET 
});

// DDU (8개 문자)
const encoder2 = new Ddu64(undefined, undefined, { 
  dduSetSymbol: DduSetSymbol.DDU 
});

// TWOCHARSET (1024개 문자)
const encoder3 = new Ddu64(undefined, undefined, { 
  dduSetSymbol: DduSetSymbol.TWOCHARSET 
});

// THREECHARSET (32768개 문자)
const encoder4 = new Ddu64(undefined, undefined, { 
  dduSetSymbol: DduSetSymbol.THREECHARSET 
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
  "뜌", "뜍", "뜎", "뜏", "뜐", "뜑", "뜒", "뜓", "뜔", "뜕", "뜖", "뜗", "뜘", "뜙", "뜚", "뜛",
  "뜜", "뜝", "뜞", "뜟", "뜠", "뜡", "뜢", "뜣", "뜤", "뜥", "뜦", "뜧", "뜨", "뜩", "뜪", "뜫",
  // ... 256개 문자
];

const encoder = new Ddu64(koreanChars, "뭐");

const text = "안녕하세요12";
const encoded = encoder.encode(text);
const decoded = encoder.decode(encoded);
const decodedBuffer = encoder.decodeToBuffer(encoded);
```

## API

### `new Ddu64(dduChar?, paddingChar?, options?)`

인코더 인스턴스를 생성합니다.

**Parameters:**
- `dduChar` (string | string[]): charset 문자열 또는 배열
- `paddingChar` (string): 패딩 문자
- `options` (DduOptions): 옵션 객체
  - `dduSetSymbol`: 미리 정의된 charset 사용
  - `encoding`: Buffer encoding (기본값: 'utf-8')
  - `usePowerOfTwo`: 2의 제곱수 강제 여부
  - `useBuildErrorReturn`: 에러 발생 시 throw 여부

### `encode(data: string | Buffer): string`

데이터를 인코딩

### `decode(encoded: string): string`

인코딩된 문자열을 디코딩

### `decodeToBuffer(encoded: string): Buffer`

인코딩된 문자열을 Buffer로 직접 디코딩

### `getCharSetInfo()`

현재 charset 정보를 반환

```typescript
{
  charSet: string[];
  paddingChar: string;
  charLength: number;
  bitLength: number;
  usePowerOfTwo: boolean;
  encoding: BufferEncoding;
}
```