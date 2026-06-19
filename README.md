# ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

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

## 문자열과 바이너리

```typescript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64();

const encodedText = ddu.encode("안녕하세요");
const decodedText = ddu.decode(encodedText);

const encodedBytes = ddu.encode(new Uint8Array([0, 1, 127, 128, 255]));
const decodedBytes = ddu.decodeToUint8Array(encodedBytes);
const decodedBuffer = ddu.decodeToBuffer(encodedBytes); // Node.js 전용
```

## 프리셋

```typescript
import { Ddu64, DduSetSymbol } from "@ddunigma/node";

const ddu = new Ddu64();
const legacy = new Ddu64({ dduSetSymbol: DduSetSymbol.DDU_V1 });
const oneCharset = new Ddu64({ dduSetSymbol: DduSetSymbol.ONECHARSET });
```

`dduSetSymbol`은 enum 멤버(`DduSetSymbol.DDU`)와 문자열 리터럴(`"ddu"`) 모두 받습니다.

## 커스텀 charset

```typescript
import { Ddu64 } from "@ddunigma/node";

const base64 = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=");

const hangul = new Ddu64(["가", "나", "다", "라"], "뭐", {
  codaChar: ["", "ㄱ", "ㄲ", "ㄷ"],
});
```

charset 문자와 `paddingChar`는 각각 단일 UTF-16 코드 유닛이어야 합니다.
`CharsetBuilder.fromUnicodeRange()`로 non-BMP 문자를 만들 수는 있지만, `Ddu64` 생성자에
전달할 charset은 BMP 단일 코드 유닛 문자만 사용할 수 있습니다.

## 사용 가능한 옵션

생성자 옵션은 인스턴스의 기본값으로 적용됩니다. `encode`, `decode`, `getStats` 계열 메서드에
같은 옵션을 전달하면 해당 호출에서만 기본값을 덮어씁니다.

### 공통 옵션

| 옵션                   | 타입                              | 기본값            | 용도                                    |
| ---------------------- | --------------------------------- | ----------------- | --------------------------------------- |
| `compress`             | `boolean`                         | `false`           | 압축 사용                               |
| `compressionAlgorithm` | `"deflate" \| "brotli"`           | `"deflate"`       | 압축 알고리즘                           |
| `compressionLevel`     | `number`                          | `6`               | 압축 레벨                               |
| `checksum`             | `boolean`                         | `false`           | CRC32 체크섬 추가 및 검증               |
| `checksumScope`        | `"plaintext" \| "output"`         | `"output"`        | CRC32 계산 범위                         |
| `chunkSize`            | `number`                          | 미사용            | 출력 문자열 분할 크기                   |
| `chunkSeparator`       | `string`                          | `"\n"`            | 청크 구분자                             |
| `maxDecodedBytes`      | `number`                          | `67108864`        | 최대 디코딩 바이트 수                   |
| `maxEncodedChars`      | `number`                          | 비례 자동 산정    | 최대 디코딩 입력(인코딩 문자열) 길이    |
| `maxDecompressedBytes` | `number`                          | `67108864`        | 최대 압축 해제 바이트 수 (secure 전용)  |
| `obfuscate`            | `boolean`                         | `false`           | 출력을 한글 음절로 난독화               |
| `requireEncryption`    | `boolean`                         | 키 사용 시 `true` | 키가 있는 decoder에서 평문 payload 거부 |
| `onProgress`           | `(info: DduProgressInfo) => void` | 미사용            | 처리 진행률 콜백                        |

`compress`/`compressionAlgorithm`/`compressionLevel`/`checksum`/`checksumScope`/`maxDecompressedBytes`/
`requireEncryption`은 secure 진입점(`@ddunigma/node/secure`)에서만 동작합니다. 기본/브라우저 lean
진입점은 인코딩 + 난독화만 노출하며 이 옵션들은 타입 단계에서 차단됩니다.

Web Streams API는 축적 모드 메모리 제한용 `maxBufferedBytes`(인코딩, 기본 64 MiB)와
`maxBufferedChars`(디코딩, 기본 64 Mi 문자)를 추가로 지원합니다.

### 생성자 전용 옵션

| 옵션               | 타입                         | 기본값      | 용도                                |
| ------------------ | ---------------------------- | ----------- | ----------------------------------- |
| `dduSetSymbol`     | `DduSetSymbol \| "ddu" \| …` | `DDU`       | 기본 charset 프리셋 선택            |
| `dduChar`          | `string \| string[]`         | 프리셋 사용 | 커스텀 charset                      |
| `codaChar`         | `string[]`                   | 미사용      | 기본 문자와 조합할 한글 종성        |
| `paddingChar`      | `string`                     | 프리셋 사용 | 커스텀 패딩 문자                    |
| `requiredLength`   | `number`                     | `64`        | 필요한 charset 문자 수              |
| `usePowerOfTwo`    | `boolean`                    | 자동 결정   | 2의 제곱수 charset 직접 인덱스 모드 |
| `useRepeatPadding` | `boolean`                    | 프리셋 설정 | 반복 패딩 방식 사용                 |
| `throwOnError`     | `boolean`                    | `true`      | 잘못된 charset 설정에서 예외 발생   |
| `urlSafe`          | `boolean`                    | `false`     | URL-Safe 출력 변환                  |
| `encryptionKey`    | `string`                     | 미사용      | AES-256-GCM 암호화 키 (secure 전용) |
| `keyDerivation`    | `KeyDerivationOptions`       | `pbkdf2`    | 암호화 키 파생 방식 (secure 전용)   |
| `adapter`          | `PlatformAdapter`            | 진입점 설정 | 플랫폼 어댑터 직접 주입             |

## 압축, 암호화, 체크섬 (secure 진입점)

압축/암호화/체크섬/Web Streams는 6.0부터 secure 진입점(`@ddunigma/node/secure`)으로
이전되었습니다.

```typescript
import { Ddu64 } from "@ddunigma/node/secure";

const ddu = new Ddu64({
  compress: true,
  compressionAlgorithm: "deflate",
  compressionLevel: 6,
  encryptionKey: "my-secret-key",
  keyDerivation: {
    algorithm: "pbkdf2",
    salt: "my-application-salt",
    iterations: 600_000,
  },
  checksum: true,
});

const encoded = ddu.encode("보호할 데이터");
const decoded = ddu.decode(encoded);
```

복호화할 때는 인코딩에 사용한 `encryptionKey`와 키 파생 설정(`algorithm`/`salt`/`iterations`)을
동일하게 사용해야 합니다(키 파생 파라미터는 와이어에 기록되지 않습니다). 암호화 키가 설정된
인스턴스는 기본적으로 암호화 footer가 없는 payload를 거부합니다. 같은 인스턴스로 레거시 평문을
읽어야 하면 해당 decode 호출에 `requireEncryption: false`를 명시합니다.

> 보안 주의: AES-256-GCM 암호화는 **부가 기능**이며 단독 보안 솔루션이 아닙니다. 기본 PBKDF2는
> 210k 반복 + 고정 기본 salt라 저엔트로피 키(사람 비밀번호)에는 부족합니다. OWASP 권고
> (PBKDF2-HMAC-SHA256 ≥600k)에 맞춰 **애플리케이션 고유 `salt`와 높은 `iterations`를 명시**하세요.

## URL-Safe와 청크 분할

```typescript
const ddu = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
  urlSafe: true,
  chunkSize: 76,
  chunkSeparator: "\n",
});

const encoded = ddu.encode("long data");
const decoded = ddu.decode(encoded);
```

## 한글 난독화

난독화는 라이브러리의 주목적(재미 + 시각적 난독화)으로, **암호화 키 없이** 기본 진입점에서
바로 사용할 수 있습니다. 인코딩 결과(푸터 포함) 전체를 한글 음절 블록(U+AC00–U+D7A3)으로
가역 변환합니다.

```typescript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64({ obfuscate: true });
const encoded = ddu.encode("재미있는 난독화");
const decoded = ddu.decode(encoded); // "재미있는 난독화"
```

> 다시 강조: 키 없는 난독화는 **암호화가 아닙니다.** 동일 입력은 항상 동일 출력이 되어 기밀성·
> 변조 방지를 제공하지 않습니다. 기밀이 필요하면 secure 진입점에서 `encryptionKey`와 함께
> `obfuscate`를 쓰세요(암호문을 한글 음절로 가립니다).

## 브라우저와 Workers

기본 브라우저 진입점(`@ddunigma/node/browser`)은 인코딩 + 난독화(lean)를 제공합니다.
브라우저에서 압축/암호화/체크섬이 필요하면 secure 진입점(`@ddunigma/node/secure`)을
사용합니다. 조건부 `exports`가 브라우저 환경에서 자동으로 secure 브라우저 빌드
(WebCrypto·CompressionStream 기반)를 선택합니다.

```typescript
import { Ddu64 } from "@ddunigma/node/secure";

const ddu = new Ddu64({ compress: true, checksum: true });
const encoded = await ddu.encodeAsync("browser data");
const decoded = await ddu.decodeAsync(encoded);
const bytes = await ddu.decodeToUint8ArrayAsync(encoded);
```

브라우저 압축은 실행 환경의 `CompressionStream`/`DecompressionStream` 지원 여부에 따라 사용할 수
있습니다. 브라우저는 압축 레벨 지정을 지원하지 않아 `compressionLevel`이 무시됩니다(라운드트립
호환은 유지). Brotli는 런타임이 `CompressionStream("brotli")`를 지원할 때만 동작합니다.

## 인코딩 통계

```typescript
const stats = ddu.getStats("payload");
const asyncStats = await ddu.getStatsAsync("payload", { compress: true });
```

브라우저에서 압축 통계를 계산할 때는 `getStatsAsync`를 사용합니다.

## 진입점

라이브러리는 용도별 4개 진입점을 제공합니다. `package.json`의 조건부 `exports`로 런타임에
맞춰 자동 선택됩니다.

| 진입점                   | 노출 `Ddu64`         | 기능                                   | 용도                         |
| ------------------------ | -------------------- | -------------------------------------- | ---------------------------- |
| `@ddunigma/node`         | `Ddu64Node` (lean)   | 인코딩 + 한글 난독화                   | 기본 — 재미 + 시각적 난독화  |
| `@ddunigma/node/browser` | `Ddu64Browser`(lean) | 인코딩 + 한글 난독화 (브라우저 최적화) | 브라우저/Workers 기본        |
| `@ddunigma/node/secure`  | `Ddu64Secure`        | 압축/암호화/체크섬/Web Streams + 난독  | 보안·압축 배터리 풀세트      |
| `@ddunigma/node/core`    | `Ddu64Core`          | 순수 인코딩/디코딩                     | 어댑터/난독 미포함 최소 번들 |

```typescript
import { Ddu64 as NodeDdu64 } from "@ddunigma/node"; // 인코딩 + 난독화
import { Ddu64 as BrowserDdu64 } from "@ddunigma/node/browser"; // 브라우저 lean
import { Ddu64 as SecureDdu64 } from "@ddunigma/node/secure"; // 압축/암호화/체크섬
import { Ddu64 as CoreDdu64 } from "@ddunigma/node/core"; // 순수 인코딩
```

기본/브라우저 진입점은 어댑터(zlib/crypto)를 정적으로 import하지 않으므로 압축/암호화/체크섬
코드가 번들에서 트리셰이킹됩니다(6.0 batteries 구조 대비 lean 경량화). 이들 배터리 기능은
secure 진입점에서만 노출됩니다.

### 순수 인코딩만 필요하면 `/core`

압축·암호화·난독화 없이 커스텀/노벨티 charset 인코딩만 필요하면 `@ddunigma/node/core`를
사용하세요. 어댑터·난독화 구현이 트리셰이킹으로 제거됩니다.

```typescript
import { Ddu64Core, DduSetSymbol } from "@ddunigma/node/core";

// 어댑터 없이 순수 인코딩/디코딩 (압축/암호화 미사용)
const enc = new Ddu64Core(undefined, undefined, { dduSetSymbol: DduSetSymbol.DDU });
const encoded = enc.encode("hello");
const decoded = enc.decode(encoded);
```

`/core`에서 압축·암호화를 쓰려면 `adapter`(또는 `adapterFactory`)를, 난독화를 쓰려면
`obfuscationLayerFactory`를 직접 주입하세요(배터리 포함 진입점은 자동 주입하므로 불필요).
어댑터·난독화 구현체는 secure 진입점에서 가져옵니다:

```typescript
import { Ddu64Core } from "@ddunigma/node/core";
import { NodeAdapter, HangulObfuscationLayer } from "@ddunigma/node/secure";

const enc = new Ddu64Core(undefined, undefined, {
  encryptionKey: "secret",
  adapterFactory: () => new NodeAdapter(),
  obfuscationLayerFactory: (alphabet) => new HangulObfuscationLayer(alphabet),
});
```
