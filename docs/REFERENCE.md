# ddunigma Node Reference

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

## 옵션

생성자 옵션은 인스턴스 기본값입니다. `encode`, `decode`, `getStats` 계열 메서드에 같은 옵션을
전달하면 해당 호출에서만 기본값을 덮어씁니다.

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
| `maxEncodedChars`      | `number`                          | 비례 자동 산정    | 최대 디코딩 입력 문자열 길이            |
| `maxDecompressedBytes` | `number`                          | `67108864`        | 최대 압축 해제 바이트 수                |
| `obfuscate`            | `boolean`                         | `false`           | 출력을 한글 음절로 난독화               |
| `requireEncryption`    | `boolean`                         | 키 사용 시 `true` | 키가 있는 decoder에서 평문 payload 거부 |
| `onProgress`           | `(info: DduProgressInfo) => void` | 미사용            | 처리 진행률 콜백                        |

`maxEncodedChars`의 자동값은 `maxDecodedBytes * 4 + 1024`입니다. 호출 옵션에서
`maxDecodedBytes`를 더 작게 지정하면 명시적인 `maxEncodedChars`가 없는 한 원시 입력 상한도
함께 낮아집니다. `chunkSize: 1`과 긴 사용자 구분자처럼 조밀한 청킹을 사용한다면
`maxEncodedChars`를 별도로 지정하세요.

`@ddunigma/node`와 `@ddunigma/node/browser`는 비동기 파이프라인이 실제 압축·암복호화
단계에 도달할 때만 플랫폼 adapter를 동적 import해 현재 core에 주입합니다. 동기
압축/암호화는 `@ddunigma/node/secure`를 사용하세요. `checksum`/`checksumScope`/청킹/
난독화는 플랫폼 어댑터 없이도 동작합니다.

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
| `encryptionKey`    | `string`                     | 미사용      | AES-256-GCM 암호화 키               |
| `keyDerivation`    | `KeyDerivationOptions`       | `pbkdf2`    | 암호화 키 파생 방식                 |
| `adapter`          | `PlatformAdapter`            | 진입점 설정 | 플랫폼 어댑터 직접 주입             |

## 압축, 암호화, 체크섬

기본 진입점은 비동기 메서드에서 압축/암호화 어댑터를 필요할 때만 불러옵니다.

```typescript
import { Ddu64 } from "@ddunigma/node";

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

const encoded = await ddu.encodeAsync("보호할 데이터");
const decoded = await ddu.decodeAsync(encoded);
```

동기 압축/암호화나 Web Streams가 필요하면 `@ddunigma/node/secure`를 사용합니다.
압축 여부와 알고리즘은 footer에서 판별하므로 decode 쪽에 `compress` 옵션을 반복할
필요가 없습니다.

복호화에는 인코딩에 사용한 `encryptionKey`와 키 파생 설정(`algorithm`/`salt`/`iterations`)이
동일하게 필요합니다. 키 파생 파라미터는 wire format에 기록되지 않습니다.
저엔트로피 비밀번호를 사용하면 application-specific `salt`와 명시적 PBKDF2 iteration을
설정하세요. 기본 210,000회·고정 fallback salt는 기존 데이터 호환을 위해 유지됩니다.

`encryptionKey`가 설정된 인스턴스는 기본적으로 암호화 footer가 없는 payload를 거부합니다.
레거시 평문을 같은 인스턴스로 읽어야 하면 해당 decode 호출에 `requireEncryption: false`를
명시합니다.

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

난독화는 암호화 키 없이 기본 진입점에서 바로 사용할 수 있습니다. charset payload를
한글 음절 블록(U+AC00–U+D7A3)으로 1:1 가역 변환합니다. Checksum을 함께 사용하면
checksum marker와 값은 난독화 밖의 ASCII suffix로 남습니다.

```typescript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64({ obfuscate: true });
const encoded = ddu.encode("재미있는 난독화");
const decoded = ddu.decode(encoded);
```

키 없는 난독화는 암호화가 아니며 입력 빈도를 숨기지 않습니다. 기밀성이 필요하면
`encryptionKey`와 함께 사용하세요.

## 브라우저와 Workers

기본 브라우저 진입점(`@ddunigma/node/browser`)은 codec·체크섬·난독화를 동기로 제공합니다.
브라우저에서 압축/암호화가 필요하면 같은 진입점의 비동기 메서드를 쓰면 됩니다.
해당 연산이 실제로 필요한 시점에만 BrowserAdapter(WebCrypto·CompressionStream 기반)를
동적 import합니다.

```typescript
import { Ddu64 } from "@ddunigma/node/browser";

const ddu = new Ddu64({ compress: true, checksum: true });
const encoded = await ddu.encodeAsync("browser data");
const decoded = await ddu.decodeAsync(encoded);
const bytes = await ddu.decodeToUint8ArrayAsync(encoded);
```

브라우저 압축은 실행 환경의 `CompressionStream`/`DecompressionStream` 지원 여부에 따라 사용할 수
있습니다. 브라우저는 압축 레벨 지정을 지원하지 않아 `compressionLevel`이 무시됩니다. Brotli는
런타임이 `CompressionStream("brotli")`를 지원할 때만 동작합니다.

## Web Streams

`@ddunigma/node/secure`에서 `createReadableEncodeStream`과 `createReadableDecodeStream`을
제공합니다.

- 인코딩: 압축/암호화/체크섬 비활성화 + 2의 제곱수 charset에서 청크 단위 출력.
- 디코딩: footer metadata를 최종 신뢰하기 위해 payload를 축적 후 처리.
- 압축/암호화/체크섬 또는 비-2의 제곱수 charset은 buffered transform입니다.

대용량 상수 메모리 스트리밍이 필요하면 애플리케이션 레벨에서 프레임을 나누고 각 프레임에
`encode`/`decode`를 적용하세요.

## 인코딩 통계

```typescript
const stats = ddu.getStats("payload");
const asyncStats = await ddu.getStatsAsync("payload", { compress: true });
```

브라우저의 압축 통계는 root의 `getStatsAsync`를 사용합니다. Web Streams는
`@ddunigma/node/secure`를 사용합니다.

## 진입점

| 진입점                   | 노출 `Ddu64`                                       | 기능                                       | 용도                         |
| ------------------------ | -------------------------------------------------- | ------------------------------------------ | ---------------------------- |
| `@ddunigma/node`         | `Ddu64Node`                                        | codec/checksum/난독화 + async adapter lazy | Node 기본                    |
| `@ddunigma/node/browser` | `Ddu64Browser`                                     | codec/checksum/난독화 + async adapter lazy | 브라우저/Workers 기본        |
| `@ddunigma/node/secure`  | Node: `Ddu64Secure`, browser: `Ddu64SecureBrowser` | sync/async 압축/암호화/체크섬/Web Streams  | 보안·압축 배터리 명시 사용   |
| `@ddunigma/node/core`    | `Ddu64Core`                                        | 플랫폼 독립 codec/checksum                 | 어댑터/난독 미포함 최소 번들 |

```typescript
import { Ddu64 as NodeDdu64 } from "@ddunigma/node";
import { Ddu64 as BrowserDdu64 } from "@ddunigma/node/browser";
import { Ddu64 as SecureDdu64 } from "@ddunigma/node/secure";
import { Ddu64 as CoreDdu64 } from "@ddunigma/node/core";
```

## 순수 인코딩만 필요하면 `/core`

압축·암호화·난독화 없이 커스텀/노벨티 charset 인코딩만 필요하면 `@ddunigma/node/core`를
사용하세요. 어댑터·난독화 구현이 트리셰이킹으로 제거됩니다.

```typescript
import { Ddu64Core, DduSetSymbol } from "@ddunigma/node/core";

const enc = new Ddu64Core({ dduSetSymbol: DduSetSymbol.DDU });
const encoded = enc.encode("hello");
const decoded = enc.decode(encoded);
```

`/core`에서 압축·암호화를 쓰려면 공개 `PlatformAdapter`를 `adapter`로 직접 주입하세요.
난독화까지 필요하면 내부 팩토리를 주입하기보다 root 진입점을 사용하는 편이 안정적입니다.

```typescript
import { Ddu64Core } from "@ddunigma/node/core";
import { NodeAdapter } from "@ddunigma/node/secure";

const enc = new Ddu64Core({
  encryptionKey: "secret",
  adapter: new NodeAdapter(),
});
```
