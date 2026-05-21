# ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

커스텀 charset을 사용하는 Base64 스타일 인코더/디코더 라이브러리입니다.

한글 종성 결합 시스템을 활용하여 8개 기본 문자 × 8개 종성으로 64가지 조합을 만들어, 6비트를 한 글자로 표현합니다.

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
const dduV1 = new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.DDU_V1 });
dduV1.encode("안녕하세요"); // ".우땨땨이?땨뜌.이.뜌이?이!.우우땨이?우뜌.우땨뜌이이.뜌.우땨땨!이이야"
dduV1.decode(".우땨땨이?땨뜌.이.뜌이?이!.우우땨이?우뜌.우땨뜌이이.뜌.우땨땨!이이야"); // "안녕하세요"
```

---

## 기본 사용법

### 인코딩/디코딩

```typescript
import { Ddu64 } from "@ddunigma/node";

const encoder = new Ddu64();

const encoded = encoder.encode("Hello World!");
const decoded = encoder.decode(encoded);
```

### 커스텀 charset

```typescript
// 문자열 또는 배열로 charset 지정
const encoder = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=");

// 종성 결합 커스텀 charset (dduChar × codaChar 동적 생성)
const encoder2 = new Ddu64(["가", "나", "다", "라"], "뭐", {
  codaChar: ["", "ㄱ", "ㄲ", "ㄷ"], // 4×4 = 16개 조합
});
```

### 프리셋

| Symbol       | 문자 수 | 비트 | 설명                                 |
| ------------ | ------- | ---- | ------------------------------------ |
| `DDU`        | 64      | 6    | 한글 종성 결합 (8 기본문자 × 8 종성) |
| `DDU_V1`     | 8       | 3    | 구버전 호환 (뜌땨이우야!?.)          |
| `ONECHARSET` | 64      | 6    | 영문 + 숫자 + 특수문자               |

```typescript
import { Ddu64, DduSetSymbol } from "@ddunigma/node";

const encoder = new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.ONECHARSET,
});
```

---

## 고급 기능

### 압축

deflate(기본) 또는 brotli 압축을 지원합니다. 디코딩 시 자동으로 압축 여부를 감지합니다.

```typescript
const encoder = new Ddu64();

// 호출 시 옵션으로 지정
const encoded = encoder.encode(longText, { compress: true });
const decoded = encoder.decode(encoded);

// 생성자에서 기본 활성화
const compressEncoder = new Ddu64(undefined, undefined, {
  compress: true,
  compressionAlgorithm: "brotli",
  compressionLevel: 6,
});
```

### 암호화

AES-256-GCM 암호화를 내장합니다. 동일한 키로 생성된 인코더만 복호화할 수 있습니다.

```typescript
const encoder = new Ddu64(undefined, undefined, {
  encryptionKey: "my-secret-key",
});

const encoded = encoder.encode("비밀 메시지");
const decoded = encoder.decode(encoded);
```

### 체크섬

CRC32 체크섬으로 데이터 무결성을 검증합니다.

```typescript
const encoder = new Ddu64();

const encoded = encoder.encode(data, { checksum: true });
const decoded = encoder.decode(encoded, { checksum: true });
// 데이터 변조 시 에러 발생
```

### URL-Safe

`+`, `/`, `=` 를 URL 안전 문자(`-`, `_`, `.`)로 변환합니다.

```typescript
const encoder = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
  urlSafe: true,
});
```

> charset/padding에 `-`, `_`, `.` 가 포함되면 urlSafe를 활성화할 수 없습니다.

### 청크 분할

```typescript
const encoder = new Ddu64();

const encoded = encoder.encode(data, {
  chunkSize: 76,
  chunkSeparator: "\n",
});
// 디코딩 시 구분자 자동 제거
```

### 비동기 처리

대용량 데이터에서 이벤트 루프 블로킹을 방지합니다.

```typescript
const encoded = await encoder.encodeAsync(largeBuffer);
const decoded = await encoder.decodeAsync(encoded);
const buffer = await encoder.decodeToBufferAsync(encoded);
```

### 진행률 콜백

```typescript
encoder.encode(data, {
  onProgress: ({ percent, stage }) => {
    console.log(`${percent}% (${stage})`);
  },
});
```

### 통계

```typescript
const stats = encoder.getStats(data, { compress: true });
// { originalSize, encodedSize, compressedSize, compressionRatio, expansionRatio, charsetSize, bitLength }
```

### Zip Bomb 방어

```typescript
const encoder = new Ddu64(undefined, undefined, {
  maxDecodedBytes: 10 * 1024 * 1024, // 10MB
  maxDecompressedBytes: 50 * 1024 * 1024, // 50MB
});
```

---

## CharsetBuilder

커스텀 charset을 빌더 패턴으로 생성합니다.

```typescript
import { CharsetBuilder } from "@ddunigma/node";

// 유니코드 범위
CharsetBuilder.fromUnicodeRange(0x4e00, 0x4e3f).build();

// Base64에서 혼동 문자 제외
CharsetBuilder.base64().excludeConfusing().build();

// 2의 제곱수로 제한 + 시드 셔플
CharsetBuilder.fromString("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
  .limitToPowerOfTwo()
  .shuffle(12345)
  .build();

// 패딩 문자 자동 선택
const { charset, padding } = CharsetBuilder.base64().buildWithPadding();
```

---

## DduPipeline

압축 → 암호화 → 인코딩을 체이닝하고, `reverse()`로 역순 복원합니다.

```typescript
import { DduPipeline, Ddu64 } from "@ddunigma/node";

const pipeline = new DduPipeline().compress(6, "brotli").encrypt("secret-key").encode(new Ddu64());

const encoded = pipeline.processToString("Hello");
const decoded = pipeline.reverse().processToString(encoded);
```

---

## 스트림

대용량 파일을 메모리 효율적으로 처리합니다. 스트림 헤더로 압축/암호화를 자동 감지합니다.

```typescript
import { Ddu64, createEncodeStream, createDecodeStream } from "@ddunigma/node";
import fs from "fs";

const encoder = new Ddu64(undefined, undefined, {
  compress: true,
  encryptionKey: "stream-key",
});

fs.createReadStream("input.bin")
  .pipe(createEncodeStream(encoder))
  .pipe(fs.createWriteStream("output.ddu"));

fs.createReadStream("output.ddu")
  .pipe(createDecodeStream(encoder))
  .pipe(fs.createWriteStream("restored.bin"));
```

---

## API Reference

### `new Ddu64(dduChar?, paddingChar?, options?)`

| Parameter     | Type                    | Description              |
| ------------- | ----------------------- | ------------------------ |
| `dduChar`     | `string \| string[]`    | charset 문자열 또는 배열 |
| `paddingChar` | `string`                | 패딩 문자                |
| `options`     | `DduConstructorOptions` | 옵션 객체                |

**생성자 옵션:**

| Option                 | Type                    | Default     | Description                   |
| ---------------------- | ----------------------- | ----------- | ----------------------------- |
| `dduSetSymbol`         | `DduSetSymbol`          | `DDU`       | 프리셋 심볼                   |
| `codaChar`             | `string[]`              | —           | 종성 배열 (동적 charset 생성) |
| `encoding`             | `BufferEncoding`        | `'utf-8'`   | 문자열 인코딩                 |
| `compress`             | `boolean`               | `false`     | 기본 압축 활성화              |
| `compressionAlgorithm` | `"deflate" \| "brotli"` | `'deflate'` | 압축 알고리즘                 |
| `compressionLevel`     | `number`                | `6`         | 압축 레벨                     |
| `urlSafe`              | `boolean`               | `false`     | URL-Safe 모드                 |
| `encryptionKey`        | `string`                | —           | AES-256-GCM 암호화 키         |
| `checksum`             | `boolean`               | `false`     | CRC32 체크섬                  |
| `chunkSize`            | `number`                | —           | 청크 분할 크기                |
| `chunkSeparator`       | `string`                | `'\n'`      | 청크 구분자                   |
| `maxDecodedBytes`      | `number`                | `67108864`  | 최대 디코딩 바이트 (64MB)     |
| `maxDecompressedBytes` | `number`                | `67108864`  | 최대 압축해제 바이트 (64MB)   |
| `throwOnError`         | `boolean`               | `false`     | 초기화 오류 시 throw          |
| `useRepeatPadding`     | `boolean`               | `false`     | 패딩 문자 반복 방식           |
| `usePowerOfTwo`        | `boolean`               | `true`      | 2의 제곱수 charset 강제       |

**메서드:**

| Method                                   | Return            | Description          |
| ---------------------------------------- | ----------------- | -------------------- |
| `encode(data, options?)`                 | `string`          | 인코딩               |
| `decode(encoded, options?)`              | `string`          | 디코딩               |
| `decodeToBuffer(encoded, options?)`      | `Buffer`          | Buffer로 디코딩      |
| `encodeAsync(data, options?)`            | `Promise<string>` | 비동기 인코딩        |
| `decodeAsync(encoded, options?)`         | `Promise<string>` | 비동기 디코딩        |
| `decodeToBufferAsync(encoded, options?)` | `Promise<Buffer>` | 비동기 Buffer 디코딩 |
| `getStats(data, options?)`               | `DduEncodeStats`  | 인코딩 통계          |
| `getCharSetInfo()`                       | `CharSetInfo`     | charset 정보         |

**encode/decode 옵션 (DduOptions):**

| Option                 | Type                    | Description          |
| ---------------------- | ----------------------- | -------------------- |
| `compress`             | `boolean`               | 압축 사용            |
| `compressionAlgorithm` | `"deflate" \| "brotli"` | 압축 알고리즘        |
| `compressionLevel`     | `number`                | 압축 레벨            |
| `checksum`             | `boolean`               | 체크섬 추가/검증     |
| `chunkSize`            | `number`                | 청크 분할 크기       |
| `chunkSeparator`       | `string`                | 청크 구분자          |
| `maxDecodedBytes`      | `number`                | 최대 디코딩 바이트   |
| `maxDecompressedBytes` | `number`                | 최대 압축해제 바이트 |
| `onProgress`           | `function`              | 진행률 콜백          |

---

## Testing

```bash
pnpm test            # 전체 테스트
pnpm test:watch      # 워치 모드
pnpm test:coverage   # 커버리지
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

- Original: [@i3ls](https://github.com/i3l3), [@gunu3371](https://github.com/gunu3371)
- Repository: [ddunigma](https://github.com/i3l3/ddunigma)

## License

BSD-2-Clause
