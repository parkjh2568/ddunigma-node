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

문자열 디코딩은 선두의 `U+FEFF`(UTF-8 BOM)도 원문 문자로 보존합니다.
파일 형식의 BOM 제거가 필요하면 디코딩 후 애플리케이션에서 명시적으로 처리하세요.

`encodeAsync`/`getStatsAsync`는 지연 사용되는 입력 바이트를 첫 await 전에 복사합니다.
비동기 codec 메서드의 호출 옵션도 호출 시점에 보존하므로, 반환된 Promise를 기다리는 동안
원래 배열·옵션을 재사용할 수 있습니다. 스트림 입력은 `writer.write()`가 완료된 뒤 재사용하세요.

인코딩 출력의 코드포인트는 저장·전달 중 보존해야 합니다. 기본 한글 출력을 NFD로 정규화하면
지원 charset 밖의 자모로 분해되어 decode가 실패합니다. 임의 charset의 의미를 바꿀 수 있어
디코더는 Unicode 정규화를 자동 적용하지 않습니다.

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
압축/암호화가 필요한 Node 사용자는 `await Ddu64.create(options)`로 adapter를 먼저
준비할 수 있습니다. `checksum`/`checksumScope`/청킹/난독화는 플랫폼 어댑터 없이도
동작합니다.

Web Streams API는 축적 모드 메모리 제한용 `maxBufferedBytes`(인코딩, 기본 64 MiB)와
`maxBufferedChars`(디코딩, 기본 64 Mi 문자)를 추가로 지원합니다.

`onProgress.percent`는 단일 codec 호출 안에서 0부터 100까지 감소하지 않는 단계별 근사값입니다.
`processedBytes`/`totalBytes`는 현재 단계의 크기이며, decode의 `start`/`decode` 단계는
UTF-16 코드 유닛 수, 그 외 단계는 바이트 수입니다. 압축·암호화 전후에 전체 크기가 달라질 수
있으므로 이 값으로 전체 호출의 전송률을 계산하지 마세요. 스트림은 청크마다 별도 codec 호출이
발생하므로 진행률이 다시 0에서 시작할 수 있습니다.

### 생성자 전용 옵션

| 옵션               | 타입                         | 기본값                | 용도                                |
| ------------------ | ---------------------------- | --------------------- | ----------------------------------- |
| `dduSetSymbol`     | `DduSetSymbol \| "ddu" \| …` | `DDU`                 | 기본 charset 프리셋 선택            |
| `dduChar`          | `string \| string[]`         | 프리셋 사용           | 커스텀 charset                      |
| `codaChar`         | `string[]`                   | 미사용                | 기본 문자와 조합할 한글 종성        |
| `paddingChar`      | `string`                     | 프리셋 사용           | 커스텀 패딩 문자                    |
| `requiredLength`   | `number`                     | preset 또는 입력 길이 | 필요한 charset 문자 수              |
| `usePowerOfTwo`    | `boolean`                    | 자동 결정             | 2의 제곱수 charset 직접 인덱스 모드 |
| `useRepeatPadding` | `boolean`                    | 프리셋 설정           | 반복 패딩 방식 사용                 |
| `throwOnError`     | `boolean`                    | `true`                | 잘못된 charset 설정에서 예외 발생   |
| `urlSafe`          | `boolean`                    | `false`               | URL-Safe 출력 변환                  |
| `encryptionKey`    | `string`                     | 미사용                | AES-256-GCM 암호화 키               |
| `keyDerivation`    | `KeyDerivationOptions`       | `pbkdf2`              | 암호화 키 파생 방식                 |
| `adapter`          | `PlatformAdapter`            | 진입점 설정           | 플랫폼 어댑터 직접 주입             |

`requiredLength` 미지정 시 프리셋은 프리셋 설정을 사용하고, 커스텀 charset은 종성 결합을 적용한
alphabet의 길이를 사용합니다(종성 미지정 시 입력 길이). 예를 들어 `new Ddu64("abcd", "=")`는 4문자·2비트 codec입니다. 종성 결합이나
중복·padding 제거가 있는 설정은 최종 charset 검증을 통과해야 합니다.

## 압축, 암호화, 체크섬

기본 진입점은 비동기 메서드에서 압축/암호화 어댑터를 필요할 때만 불러옵니다.

### 보안 경계

`@ddunigma/node/secure`는 관련 기능과 어댑터를 정적으로 노출하는 진입점 이름입니다.
인증 프로토콜, 키 교환, 키 저장소 또는 암호문 envelope 전체를 제공하지 않습니다.

- 한글 난독화는 결정론적 가역 치환이며 기밀성을 제공하지 않습니다.
- CRC32는 우발적 손상 검출용이며 위변조 인증을 제공하지 않습니다.
- AES-256-GCM의 안전성은 키 entropy, KDF 설정, 키 수명과 애플리케이션 위협 모델에 의존합니다.
- 비밀 데이터와 공격자가 조절할 수 있는 입력을 같은 payload에서 압축 후 암호화하지 마세요.
  암호문 길이 차이가 비밀에 대한 정보를 노출할 수 있습니다.
- KDF 파라미터, 키 식별자, 키 회전과 폐기는 wire format 밖에서 버전 관리하세요.

```typescript
import { Ddu64 } from "@ddunigma/node";

const encryptionKey = process.env.DDU64_KEY;
if (!encryptionKey) throw new Error("DDU64_KEY is required");

const ddu = new Ddu64({
  compress: true,
  compressionAlgorithm: "deflate",
  compressionLevel: 6,
  encryptionKey,
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

Node의 동기 압축/암호화는 같은 root import의 `Ddu64.create()`로 adapter를 먼저
준비합니다. 압축 여부와 알고리즘은 footer에서 판별하므로 decode 쪽에 `compress` 옵션을
반복할 필요가 없습니다.

```typescript
const eager = await Ddu64.create({
  compress: true,
  encryptionKey,
  keyDerivation: {
    algorithm: "pbkdf2",
    salt: "my-application-salt",
    iterations: 600_000,
  },
});
const syncEncoded = eager.encode("prepared adapter");
const syncDecoded = eager.decode(syncEncoded);
```

`new Ddu64(options)`는 초기 리소스를 최소화하고 adapter-backed 기능을 비동기 호출까지
지연합니다. `Ddu64.create(options)`는 adapter를 생성 전에 준비합니다. 브라우저에서는
두 생성 방식 모두 압축·암호화를 비동기 메서드로 호출해야 합니다.

복호화에는 인코딩에 사용한 `encryptionKey`와 키 파생 설정(`algorithm`/`salt`/`iterations`)이
동일하게 필요합니다. 키 파생 파라미터는 wire format에 기록되지 않습니다.
저엔트로피 비밀번호를 사용하면 application-specific `salt`와 명시적 PBKDF2 iteration을
설정하세요. 기본 210,000회·고정 fallback salt는 기존 데이터 호환을 위해 유지됩니다.
새 데이터에는 현재 권고 수준과 애플리케이션 성능 예산을 함께 검토해 명시적으로 설정하세요.

파생된 키는 인스턴스별로 재사용합니다. 첫 암호화·복호화에는 adapter 초기화와 KDF 비용이
포함되며, `Ddu64.create()`는 adapter만 미리 준비하고 키 파생까지 완료하지는 않습니다.
요청마다 인스턴스를 만들면 KDF 비용도 반복됩니다. `pnpm bench`는 첫 호출과 같은 인스턴스의
후속 호출을 따로 측정합니다. 지연 시간을 줄이기 위해 KDF 강도를 임의로 낮추지 마세요.

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

`urlSafe`는 `+`→`-`, `/`→`_`, `=`→`.` 치환이며 footer도 유지하는 프로젝트 규칙입니다.
표준 Base64url과 호환되는 옵션이 아닙니다. 위 alphabet·padding으로 `"A"`를 인코딩하면 기본
footer는 `"QQ.4"`, `useRepeatPadding: true`는 `"QQ.."`입니다. 표준 무패딩 Base64url은 `"QQ"`입니다.
한글 charset 출력은 `urlSafe`를 켜도 한글이며, URL에 넣는 경계에서 별도 percent-encoding이
필요할 수 있습니다.

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

## 웹 런타임

기본 브라우저 진입점(`@ddunigma/node/browser`)은 codec·체크섬·난독화를 동기로 제공합니다.
브라우저에서 압축/암호화가 필요하면 같은 진입점의 비동기 메서드를 쓰면 됩니다.
해당 연산이 실제로 필요한 시점에만 BrowserAdapter(WebCrypto·CompressionStream 기반)를
동적 import합니다.

패키지 root는 브라우저, Web Workers, workerd, Bun, Deno에서 browser 호환 빌드를
선택합니다. Bun과 Deno의 `/secure`는 두 런타임이 제공하는 Node 호환 조건에 따라 Node
빌드를 선택합니다. Web API 경로를 고정하려면 `/browser`를 명시하세요. 실제 압축·암호화
지원 범위는 선택된 빌드와 런타임 API 구현으로 결정됩니다.

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

기본 `Ddu64` 인스턴스는 `createEncodeStream()`과 `createDecodeStream()` 호출 시
Web Streams 구현을 동적 import합니다.

```typescript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64({ checksum: true });
const encodeStream = await ddu.createEncodeStream({ maxBufferedBytes: 8 * 1024 * 1024 });
const decodeStream = await ddu.createDecodeStream({ maxBufferedChars: 8 * 1024 * 1024 });
```

`@ddunigma/node/secure`의 기존 `createReadableEncodeStream`과
`createReadableDecodeStream` 함수 export도 고급 사용과 하위 호환을 위해 유지합니다.

- 인코딩: 압축/암호화/체크섬 비활성화 + 2의 제곱수 charset에서 청크 단위 출력.
- 디코딩: footer metadata를 최종 신뢰하기 위해 payload를 축적 후 처리.
- 압축/암호화/체크섬 또는 비-2의 제곱수 charset은 buffered transform입니다.
- `writer.write()` 완료 후 입력 `Uint8Array`/`Buffer`를 재사용해도 보관된 입력은 바뀌지 않습니다.
- 호출별 `obfuscate`와 `onProgress`는 청크·buffered 인코딩 모두에 적용됩니다.
- 스트림 생성 함수·메서드는 생성 호출 시점의 옵션을 보존합니다.

`maxBufferedBytes`와 `maxBufferedChars`는 축적 입력의 한도입니다. 합친 바이트 배열, 비동기
입력 snapshot, 압축·암호화 작업 버퍼, 출력 문자열, 동시 스트림은 별도 메모리를 사용합니다.
64MiB 설정이 RSS 64MiB를 보장하지 않습니다. flush에서 청크를 합친 뒤 원래 청크 참조를
해제하지만 실제 회수 시점은 런타임 GC가 결정합니다.

대용량 상수 메모리 스트리밍이 필요하면 애플리케이션 레벨에서 프레임을 나누고 각 프레임에
`encode`/`decode`를 적용하세요.

## 인코딩 통계

```typescript
const stats = ddu.getStats("payload");
const asyncStats = await ddu.getStatsAsync("payload", { compress: true });
```

브라우저의 압축 통계는 root의 `getStatsAsync`를 사용합니다.

| 필드               | 단위·의미                                                           |
| ------------------ | ------------------------------------------------------------------- |
| `originalSize`     | 원문 바이트 수. 문자열은 UTF-8로 변환한 크기                        |
| `encodedSize`      | 인코딩 계산 결과의 `String.length`(UTF-16 코드 유닛 수)             |
| `expansionRatio`   | `encodedSize / originalSize`(코드 유닛/바이트), 빈 입력은 0         |
| `compressedSize`   | 실제 압축을 적용한 경우의 바이트 수. 더 커져 압축을 생략하면 미지정 |
| `compressionRatio` | `compressedSize / originalSize`                                     |

통계 계산은 압축과 인코딩 문자열 생성을 실제 수행하므로 입력 크기에 비례하는 시간·메모리가
필요합니다. 암호화는 실행하지 않고 AES-GCM의 28바이트 overhead를 더한 자리표시 바이트로
대신합니다. 따라서 실제 암호문의 문자 분포·UTF-8 크기는 알 수 없으며, 가변 길이 사용자 정의
난독화 레이어를 주입하면 암호화 통계의 문자열 길이도 실제 출력과 달라질 수 있습니다.

실제 전송량은 반환받은 결과 문자열을 한 번 측정하세요.

```typescript
const input = "abc".repeat(1024);
const ddu = new Ddu64();
const encoded = ddu.encode(input);
const originalBytes = new TextEncoder().encode(input).length; // 3072
const encodedUtf8Bytes = new TextEncoder().encode(encoded).length; // 12288
const wireExpansionRatio = encodedUtf8Bytes / originalBytes; // 4
// encoded.length === 4096, getStats(input).expansionRatio === 4096 / 3072
```

JSON escaping이나 URL percent-encoding을 적용하면 최종 전송량은 해당 변환 후에 측정하세요.

## 진입점

| 진입점                   | 노출 `Ddu64`                                       | 기능                                            | 용도                         |
| ------------------------ | -------------------------------------------------- | ----------------------------------------------- | ---------------------------- |
| `@ddunigma/node`         | `Ddu64Node`                                        | codec + lazy adapter/streams + eager `create()` | 일반 Node 기본               |
| `@ddunigma/node/browser` | `Ddu64Browser`                                     | codec + lazy adapter/streams                    | 명시적 웹 런타임             |
| `@ddunigma/node/secure`  | Node: `Ddu64Secure`, browser: `Ddu64SecureBrowser` | adapter·stream 함수 정적 export                 | 고급 제어·기존 API 호환      |
| `@ddunigma/node/core`    | `Ddu64Core`                                        | 플랫폼 독립 codec/checksum                      | 어댑터/난독 미포함 최소 번들 |

| 실행 환경        | root 선택 | `/secure` 선택 | 압축·암호화 호출 방식            |
| ---------------- | --------- | -------------- | -------------------------------- |
| Node.js >= 22    | Node      | Node           | root lazy/eager sync/async       |
| 브라우저·Workers | Browser   | Browser        | async                            |
| workerd          | Browser   | Browser        | 지원 Web API 범위에서 async      |
| Bun·Deno         | Browser   | Node           | root async, `/secure` sync/async |

조건 해석 기준은 [Bun module resolution](https://bun.sh/docs/runtime/module-resolution)과
[Deno package export conditions](https://docs.deno.com/runtime/fundamentals/node/#control-package-export-conditions)를
참고하세요.

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
  adapter: new NodeAdapter(),
  compress: true,
});
```

`/core` 직접 주입은 런타임 경계와 번들 그래프를 호출자가 통제해야 할 때 사용합니다. 일반
애플리케이션에서는 root의 lazy adapter 또는 `/secure`가 더 단순하며, 직접 주입만으로 별도의
보안 프로토콜이 만들어지지는 않습니다.
