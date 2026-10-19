# ddunigma Node Reference

예제는 Node.js >=22의 독립 `.mjs` 파일에서 실행할 수 있습니다. 웹 예제는 번들러가 있는
웹 앱에서 사용하세요. `createDdu` 예제만 미배포 6.3.0 빌드를 요구합니다.

## 간편 API

`createDdu`·`DduCreateOptions`·`DduCodec`은 **6.3.0 추가 API이며 현재 미배포**입니다.
설치된 6.2.x에서는 [기존 Ddu64 API](#기존-ddu64-api)를 사용하세요.

```javascript
import { createDdu } from "@ddunigma/node";

const ddu = createDdu({ compress: true, obfuscate: true, checksum: true });
console.log(await ddu.decode(await ddu.encode("안녕하세요"))); // 안녕하세요

const binary = createDdu({ output: "bytes" });
const bytes = new Uint8Array([0, 128, 255]);
console.log(await binary.decode(await binary.encode(bytes))); // Uint8Array [0, 128, 255]
```

| 계약                           | 동작                                                                   |
| ------------------------------ | ---------------------------------------------------------------------- |
| 생성                           | 동기. 잘못된 설정은 즉시 throw                                         |
| `encode(string \| Uint8Array)` | `Promise<string>`                                                      |
| `decode(string)`               | 기본 `Promise<string>`, `output: "bytes"`는 `Promise<Uint8Array>`      |
| 옵션                           | 생성 시 고정. 호출별 override·자동 문자열/바이너리 판별·JSON 변환 없음 |

Node Buffer도 바이트 입력으로 받습니다. charset·KDF salt 등 가변 생성 설정을 보존하며,
통계·스트림·호출별 옵션은 `Ddu64`를 사용합니다. Promise 반환이 CPU 작업의 별도 스레드
실행을 뜻하지 않으며, 큰 입력은 호출 중 이벤트 루프를 점유할 수 있습니다.

## 기존 Ddu64 API

### 문자열과 바이너리

```javascript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64();
console.log(ddu.decode(ddu.encode("안녕하세요"))); // 안녕하세요

const encoded = ddu.encode(new Uint8Array([0, 1, 127, 128, 255]));
console.log(ddu.decodeToUint8Array(encoded)); // Uint8Array [0, 1, 127, 128, 255]
console.log(ddu.decodeToBuffer(encoded)); // Node.js Buffer
```

문자열은 UTF-8이며 선두 `U+FEFF`(BOM)도 보존합니다. 임의 바이너리는 문자열 대신 바이트로
복원하세요. 출력 코드포인트를 보존해야 하며, NFD 정규화로 한글이 자모로 분해되면 decode가
실패합니다. 디코더는 Unicode 정규화를 자동 적용하지 않습니다.

`encodeAsync`·`getStatsAsync`는 await를 넘겨 사용할 외부 바이트를 첫 await 전에 복사하고,
비동기 호출 옵션도 호출 시점에 보존합니다. 반환된 Promise를 기다리는 동안 원래 배열·옵션을
재사용할 수 있습니다. 입력 `Uint8Array.length`와 실제 view 길이가 다르면 `InvalidInput`으로
거부하며, Node의 Base64·압축 경로는 실제 버퍼·offset·길이를 사용합니다. 스트림 입력 재사용은
`writer.write()` 완료 후에 가능합니다.

## 프리셋

생성 설정을 선택하는 부분 예제입니다. `dduSetSymbol`은 enum 또는 `"ddu"`·`"ddu_v1"`·
`"oneCharSet"` 문자열을 받습니다.

```javascript
import { Ddu64, DduSetSymbol } from "@ddunigma/node";

const ddu = new Ddu64();
const v1 = new Ddu64({ dduSetSymbol: DduSetSymbol.DDU_V1 });
const oneCharset = new Ddu64({ dduSetSymbol: DduSetSymbol.ONECHARSET });
```

## 호환성 범위

6.3.0은 npm 6.2.0의 같은 charset·옵션·KDF 설정을 회귀 검증합니다. 2.x의 무수정 교체는 보장하지 않습니다.

현재 `DDU`는 64문자·6비트 직접 매핑이고 `DDU_V1`은 8문자·6비트 쌍 표현입니다.
npm 2.0.2·2.2.0의 기본 DDU는 8문자·3비트이므로 서로 다릅니다. 잘못된 문자표에서도
오류 없이 다른 바이트가 나올 수 있어 이름이나 decode 성공만으로 형식을 추정하지 마세요.

2.x의 zlib wrapper와 현재 raw DEFLATE, 2.2.0 암호문의 SHA-256 파생과 현재 기본 PBKDF2도
구분해야 합니다. `TWOCHARSET`·`THREECHARSET`, `BaseDdu`·`encoding`·`useBuildErrorReturn`,
2.2.0의 `DduPipeline`·Node Transform API는 그대로 사용할 수 없습니다. 기존 데이터는
실제 생성 버전·설정으로 복원한 뒤 현재 codec으로 재인코딩하세요.

## 커스텀 charset

생성 설정을 선택하는 부분 예제입니다.

```javascript
import { Ddu64 } from "@ddunigma/node";

const base64 = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=");
const hangul = new Ddu64(["가", "나", "다", "라"], "뭐", { codaChar: ["", "ㄱ", "ㄲ", "ㄷ"] });
```

charset과 padding은 **각각 단일 UTF-16 코드 유닛**이어야 합니다. `CharsetBuilder.fromUnicodeRange()`로
non-BMP 문자를 만들 수 있어도 codec에는 BMP 단일 코드 유닛 문자만 전달할 수 있습니다.

## 옵션

`Ddu64` 생성 옵션은 기본값이며, `encode`·`decode`·`getStats`의 sync/async 메서드 옵션은
해당 호출에서만 덮어씁니다. `createDdu`는 생성 시 고정한 정책만 사용합니다.
`compress:false`·`checksum:false`·`obfuscate:false`는 해당 호출에서 기능을 끕니다.
키가 있는 인스턴스의 암호화만 끄는 공개 옵션은 없으므로 평문 처리는 별도 인스턴스를 사용하세요.

### 공통 옵션

| 옵션                   | 타입·기본값                            | 의미                                     |
| ---------------------- | -------------------------------------- | ---------------------------------------- |
| `compress`             | boolean · `false`                      | 압축 사용                                |
| `compressionAlgorithm` | `"deflate" \| "brotli"` · `"deflate"`  | 압축 알고리즘                            |
| `compressionLevel`     | number · `6`                           | deflate 0–9, Brotli 0–11로 보정          |
| `checksum`             | boolean · `false`                      | CRC32 추가·검증                          |
| `checksumScope`        | `"plaintext" \| "output"` · `"output"` | 원문 또는 압축·암호화 후 바이트의 CRC32  |
| `chunkSize`            | number · 미사용                        | 출력 분할 크기. 0은 비활성화             |
| `chunkSeparator`       | string · `"\n"`                        | 청크 구분자                              |
| `maxDecodedBytes`      | number · `67108864`                    | 복호화·압축 해제 전 디코딩 바이트 한도   |
| `maxEncodedChars`      | number · 자동                          | 전처리 전 입력 UTF-16 코드 유닛 한도     |
| `maxDecompressedBytes` | number · `67108864`                    | 압축 해제 출력 바이트 한도               |
| `obfuscate`            | boolean · `false`                      | 한글 음절 난독화                         |
| `requireEncryption`    | boolean · 키 사용 시 `true`            | 키가 있는 decoder에서 암호화 footer 요구 |
| `onProgress`           | 동기 함수 · 미사용                     | 단계별 진행률                            |

`maxEncodedChars`의 기본 자동값은 `maxDecodedBytes * 4 + 1024`입니다. 생성자의 명시값을
유지하며, 호출별 바이트 한도를 낮추면 해당 호출에 `maxEncodedChars`를 지정하지 않는 한
원시 입력 한도도 낮아집니다. 작은 charset이나 `chunkSize:1`·긴 구분자처럼 출력이 크게
늘어나는 설정은 문자 한도를 별도로 지정하세요. 크기 제한은 큰 할당·전처리·결합 전에 적용합니다.

`onProgress.percent`는 한 호출에서 감소하지 않는 0–100 단계별 근사값입니다. decode의 `start`·`decode` 단계에서
`processedBytes`·`totalBytes`는 UTF-16 코드 유닛, 나머지 단계는 바이트입니다. 단계별 전체 크기가
달라지므로 전체 전송률로 해석하지 마세요. 스트림의 개별 codec 호출은 0부터 다시 시작할 수 있습니다.
callback의 throw는 호출 오류가 되고, Promise/thenable 반환은 `InvalidInput`으로 거부하면서
rejection도 처리합니다. callback 내부 비동기 작업은 반환하지 말고 애플리케이션에서 오류를 처리하세요.

### 생성자 전용 옵션

| 옵션               | 타입·기본값                     | 의미                                                       |
| ------------------ | ------------------------------- | ---------------------------------------------------------- |
| `dduSetSymbol`     | enum/string · `DDU`             | 프리셋                                                     |
| `dduChar`          | string/string[] · 프리셋        | 커스텀 charset                                             |
| `codaChar`         | string[] · 미사용               | 기본 문자와 조합할 한글 종성                               |
| `paddingChar`      | string · 프리셋                 | 패딩 문자                                                  |
| `requiredLength`   | number · preset/입력 길이       | 필요한 charset 문자 수                                     |
| `usePowerOfTwo`    | boolean · 자동                  | 2의 제곱수 직접 인덱스 모드                                |
| `useRepeatPadding` | boolean · 프리셋                | 반복 패딩                                                  |
| `throwOnError`     | boolean · `true`                | 잘못된 charset에서 throw. false면 유효 preset으로 fallback |
| `urlSafe`          | boolean · `false`               | URL-Safe 치환                                              |
| `encryptionKey`    | string · 미사용                 | AES-256-GCM 키                                             |
| `keyDerivation`    | KeyDerivationOptions · `pbkdf2` | 키 파생 설정                                               |
| `adapter`          | PlatformAdapter · 진입점별      | 어댑터 직접 주입                                           |

`requiredLength`가 없으면 프리셋은 자체 설정, 커스텀은 종성 결합 후 alphabet 길이를 사용합니다.
`new Ddu64("abcd", "=")`는 4문자·2비트 codec입니다. 중복·padding 제거 등으로 데이터가
변하면 최종 charset이 다시 검증됩니다.

## 압축, 암호화, 체크섬

다음은 Node용 `crypto.mjs` 완결 예제입니다. 키 관리 체계에서 `DDU64_KEY` 환경변수를 먼저
설정하고 `node crypto.mjs`로 실행하세요. salt 예시는 애플리케이션·사용자별 고유 값으로 바꾸고
암호화·복호화 양쪽에서 동일하게 관리해야 합니다.

```javascript
import { Ddu64 } from "@ddunigma/node";

const encryptionKey = process.env.DDU64_KEY;
if (!encryptionKey) throw new Error("DDU64_KEY is required");

const ddu = new Ddu64({
  compress: true,
  encryptionKey,
  keyDerivation: {
    algorithm: "pbkdf2",
    salt: "my-application-and-user-specific-salt",
    iterations: 600_000,
  },
  checksum: true,
});
console.log(await ddu.decodeAsync(await ddu.encodeAsync("보호할 데이터")));
```

Node 동기 처리는 위 예제의 생성부를 `const ddu = await Ddu64.create(options)`로 바꾼 뒤
`encode`·`decode`를 호출하세요. 여기서 `options`는 위 생성자에 전달한 같은 설정 객체를 뜻합니다.
`create()`는 adapter만 준비하며 키 파생까지 끝내지는 않습니다. 첫 암복호화에서 키를 파생하고
같은 인스턴스에서 재사용합니다. 압축 여부·알고리즘은 footer로 판별하므로 decode에 반복할 필요가 없습니다.

`checksum:true`는 decoder에도 지정해야 합니다. 현재 `CKP`·`CKO` 마커가 scope를 기록하므로
`checksumScope`는 반복하지 않습니다. legacy `CHK`도 해당 wire 버전의 처리 순서로 읽습니다.
`plaintext` scope를 암호화와 함께 사용하면 평문 CRC가 노출되므로 기본 `output`을 권장합니다.

### 보안 경계

- `/secure`는 기능 묶음 이름이며 인증 프로토콜·키 교환·저장소·암호문 envelope를 대신하지 않습니다.
- 난독화는 기밀성을, CRC32는 위변조 인증을 제공하지 않습니다. AES-GCM 결과는 **인증 완료 후에만** 반환합니다.
- 비밀과 공격자 입력을 같은 payload에 압축 후 암호화하면 길이로 정보가 노출될 수 있습니다.
- 키 entropy·수명·KDF 강도는 애플리케이션에서 관리하세요. KDF 설정은 wire 밖에서 버전 관리하며
  동일한 키·algorithm·salt·iterations·hash가 복호화에 필요합니다. PBKDF2의 hash는 기본 `SHA-256`,
  지원값은 `SHA-256`·`SHA-384`·`SHA-512`입니다.
- 기본 PBKDF2 210,000회·고정 fallback salt는 호환성을 위해 유지합니다. 새 데이터는 고유 salt와
  위협 모델·성능 예산에 맞는 명시적 iteration을 사용하고, 지연 시간을 이유로 강도를 낮추지 마세요.
- 비밀번호는 PBKDF2를 사용하세요. `algorithm: "sha256"`은 legacy 호환 또는 충분한 entropy의 키에만 사용합니다.
- 키가 있으면 기본적으로 암호화 footer 없는 payload를 거부합니다. 레거시 평문을 같은 decoder에서
  읽어야 할 때만 해당 호출에 `requireEncryption:false`를 지정하세요.

## URL-Safe와 청크 분할

```javascript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
  urlSafe: true,
  chunkSize: 76,
  chunkSeparator: "\n",
});
const encoded = ddu.encode("A");
console.log(encoded, ddu.decode(encoded)); // QQ.4 A
```

이 옵션은 `+`→`-`, `/`→`_`, `=`→`.` 치환이며 **표준 Base64url이 아닙니다**. 위 설정의
`useRepeatPadding:true` 출력은 `"QQ.."`, 표준 무패딩 Base64url은 `"QQ"`입니다. 한글 출력은
URL-Safe여도 한글이므로 URL 경계의 percent-encoding이 필요할 수 있습니다.
구분자가 본문·footer·checksum에 있거나 청크 경계와 중첩돼 복원을 바꾸면 encode가 실패합니다.
`"|"`나 줄바꿈처럼 해당 출력에 없는 구분자를 사용하세요.

## 한글 난독화

```javascript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64({ obfuscate: true });
console.log(ddu.decode(ddu.encode("재미있는 난독화"))); // 재미있는 난독화
```

charset payload를 한글 음절 블록(U+AC00–U+D7A3)으로 결정론적으로 1:1 가역 치환합니다.
입력 빈도를 숨기지 않으며 checksum marker·값은 난독화 밖의 ASCII suffix로 남습니다.

## 웹 런타임

번들러가 있는 웹 앱에서 다음 코드를 사용하세요. 진입점 선택은 [진입점 표](#진입점)를 따릅니다.

```javascript
import { Ddu64 } from "@ddunigma/node/browser";

const ddu = new Ddu64({ compress: true, checksum: true });
console.log(await ddu.decodeAsync(await ddu.encodeAsync("browser data"))); // browser data
```

압축·암호화는 비동기 메서드를 사용합니다. 압축은 `CompressionStream`·`DecompressionStream`
지원이 필요하며 브라우저의 `compressionLevel`은 무시됩니다. Brotli는 런타임의
`CompressionStream("brotli")` 지원이 있을 때만 동작합니다.

## Web Streams

```javascript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64({ checksum: true });
const input = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode("스트림 왕복"));
    controller.close();
  },
});
const output = input
  .pipeThrough(await ddu.createEncodeStream({ maxBufferedBytes: 1024 }))
  .pipeThrough(await ddu.createDecodeStream({ maxBufferedChars: 4096 }));
console.log(await new Response(output).text()); // 스트림 왕복
```

마지막 소비 Promise를 await하면 파이프라인 실패가 전파됩니다. writer·reader를 직접 쓰면
transform/flush 실패가 읽기와 현재 write/close 모두에 전달되므로 양쪽 Promise를 처리하세요.
encode 청크는 접근 가능한 `Uint8Array`(Buffer 포함), decode 청크는 문자열입니다. 배열·DataView·
다른 typed array·detached buffer·실제 view 길이와 다른 `length`는 거부합니다.

| 처리                                            | 동작                                              |
| ----------------------------------------------- | ------------------------------------------------- |
| 2의 제곱수 charset + 압축·암호화·checksum 없음  | 인코딩 청크 단위 출력                             |
| 압축·암호화·checksum 또는 비-2의 제곱수 charset | 입력 축적 후 인코딩                               |
| 모든 디코딩                                     | footer metadata를 신뢰할 수 있을 때까지 입력 축적 |

- 호출별 `obfuscate`·`onProgress`는 청크·축적 경로에 적용되며 생성 시 호출 옵션을 보존합니다.
- DDS1 본문에는 구분자를 넣지 않고 `chunkSeparator`로 본문을 제거하지 않습니다.
- 기본 `maxBufferedBytes`는 64MiB, `maxBufferedChars`는 64Mi 코드 유닛이며 **축적 입력 한도**입니다.
  결합 버퍼·snapshot·압축/암호화 버퍼·출력·동시 스트림은 별도이므로 RSS 64MiB를 보장하지 않습니다.
  결합 후 원래 청크 참조를 해제해도 실제 회수는 GC에 따릅니다.

상수 메모리 대용량 처리는 애플리케이션에서 프레임을 나눠 각 프레임에 codec을 적용하세요.

## 인코딩 통계

```javascript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64();
const input = "abc".repeat(1024);
const encoded = ddu.encode(input);
const originalBytes = new TextEncoder().encode(input).length;
const encodedUtf8Bytes = new TextEncoder().encode(encoded).length;
console.log(ddu.getStats(input));
console.log({ originalBytes, encodedChars: encoded.length, encodedUtf8Bytes });
// originalBytes: 3072, encodedChars: 4096, encodedUtf8Bytes: 12288
```

| 필드               | 단위·의미                                        |
| ------------------ | ------------------------------------------------ |
| `originalSize`     | 원문 UTF-8/바이너리 바이트                       |
| `encodedSize`      | 출력 UTF-16 코드 유닛                            |
| `expansionRatio`   | `encodedSize / originalSize`, 빈 입력은 0        |
| `compressedSize`   | 압축을 실제 적용한 바이트. 압축이 더 크면 미지정 |
| `compressionRatio` | `compressedSize / originalSize`                  |

압축 통계는 `await ddu.getStatsAsync(input, { compress:true })`로 구합니다. 통계도 압축과
출력 문자열 생성을 수행하므로 시간·메모리 비용이 있습니다. 암호화는 실행하지 않고 28바이트
AES-GCM overhead를 더한 자리표시자로 계산하므로 실제 암호문의 문자 분포·UTF-8 크기는 알 수 없습니다.
가변 길이 사용자 난독화 레이어를 주입하면 통계 문자열 길이도 실제와 달라질 수 있습니다.
전송량은 이미 생성한 출력 문자열의 UTF-8 바이트를 측정하고, JSON escaping·URL percent-encoding을
적용하면 해당 변환 후 측정하세요.

## 오류 처리

생성자·동기 codec은 throw, async codec은 reject합니다. codec 오류는 `Ddu64Error`의 `code`·
`operation`으로 분기하고 원래 예외는 `cause`로 확인하세요. 표의 이름은 `Ddu64ErrorCode` enum의 키입니다.
CharsetBuilder·adapter 직접 호출은
기존 native Error 계약, 외부 stream 취소는 호출자의 취소 이유를 유지합니다.

| 코드                                        | 발생 조건                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `InvalidInput`                              | 잘못된 입력·옵션·detached buffer·Promise progress callback → 입력·옵션 수정  |
| `InvalidCharset`                            | charset·padding 불변식 위반 → 문자표·패딩 수정                               |
| `EncodeFailed` / `DecodeFailed`             | codec·wire 또는 외부 callback 실패 → 저장 형식·설정·callback 확인            |
| `CompressionFailed` / `DecompressionFailed` | adapter 압축·해제 실패(native 해제 한도 포함) → 지원 API·압축 형식·한도 확인 |
| `EncryptionFailed` / `DecryptionFailed`     | KDF·암호화·인증·키/footer 실패 → 키·KDF 설정·데이터 손상 확인                |
| `ChecksumMismatch`                          | checksum 누락·불일치 → 송수신 설정·데이터 손상 확인                          |
| `LimitExceeded`                             | encoded/decoded·stream 한도 초과 → 입력을 줄이거나 허용 한도 재검토          |
| `AdapterUnavailable`                        | 미제공·무효 초기화·기능 미지원 → 런타임 API·factory 확인                     |
| `ObfuscationFailed`                         | 난독화 구현·alphabet·음절 검증 실패 → 같은 레이어·alphabet인지 확인          |
| `StreamFailed`                              | DDS1 헤더·외부 stream 실패 → 헤더·파이프라인 확인                            |

현재 오류 프로토콜의 ESM/CJS 빌드는 `isDdu64Error(error)`로 같은 오류 객체·code를 보존합니다.
클래스 identity가 달라 혼용 시 `instanceof` 대신 이 함수를 쓰며, 다른 프로토콜·모든 중복 설치
버전까지 보장하지는 않습니다. 실패한 lazy adapter 초기화는 다음 호출에서 재시도하고 일반
연산 실패는 준비된 adapter를 폐기하지 않습니다. 입력·한도·인증 오류는 같은 입력의 재시도로 해결되지 않습니다.

## 진입점

| 진입점           | Node.js >=22   | 브라우저·Workers·workerd | Bun·Deno       | adapter·stream 구현                        |
| ---------------- | -------------- | ------------------------ | -------------- | ------------------------------------------ |
| `@ddunigma/node` | `Ddu64Node`    | `Ddu64Browser`           | `Ddu64Browser` | lazy. Node `create()`는 adapter eager 준비 |
| `/browser`       | `Ddu64Browser` | `Ddu64Browser`           | `Ddu64Browser` | lazy                                       |
| `/secure`        | `Ddu64Secure`  | `Ddu64SecureBrowser`     | `Ddu64Secure`  | adapter·stream 함수 정적 export            |
| `/core`          | `Ddu64Core`    | `Ddu64Core`              | `Ddu64Core`    | 직접 주입, 구체 adapter·난독화 미포함      |

root·`/browser`의 평문·checksum·난독화는 adapter를 로드하지 않습니다. adapter는 압축·암복호화가
실제로 필요한 시점, streams는 stream 메서드 호출 시 로드하며 같은 core 인스턴스를 사용합니다.
한 번 로드된 모듈은 ESM 캐시에 남습니다. Node root의 sync 압축·암호화는 `create()`나 직접
adapter 주입 후, `/secure`의 sync 호출은 Node 호환 빌드에서 사용하세요. 웹은 async입니다.
`/secure`의 `createReadableEncodeStream`·`createReadableDecodeStream` 함수 export도 유지합니다.

조건 해석은 [Bun module resolution](https://bun.sh/docs/runtime/module-resolution)과
[Deno package export conditions](https://docs.deno.com/runtime/fundamentals/node/#control-package-export-conditions)를 참고하세요.

## 순수 인코딩만 필요하면 `/core`

```javascript
import { Ddu64Core } from "@ddunigma/node/core";

const ddu = new Ddu64Core();
console.log(ddu.decode(ddu.encode("hello"))); // hello
```

직접 어댑터를 주입하는 구성 부분 예제입니다. 런타임·번들 경계를 직접 통제할 때만 사용하고,
일반 앱은 root나 `/secure`를 선택하세요. 난독화까지 필요하면 root가 더 단순합니다.

```javascript
import { Ddu64Core } from "@ddunigma/node/core";
import { NodeAdapter } from "@ddunigma/node/secure";

const ddu = new Ddu64Core({ adapter: new NodeAdapter(), compress: true });
```
