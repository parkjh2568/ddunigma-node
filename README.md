# ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

커스텀 charset을 사용하는 Base64 스타일 인코더/디코더 라이브러리입니다.

기본 charset은 한글 종성 결합 시스템(8개 기본 문자 × 8개 종성 = 64조합)으로 6비트를 한
글자에 담습니다. 압축·AES-256-GCM 암호화·CRC32 체크섬·URL-Safe·청크 분할·한글 난독화·Web
Streams와 Node/브라우저/Workers 멀티 진입점을 제공합니다.

> **포지셔닝:** 이 라이브러리는 **무종속·멀티런타임 노벨티(한글 표면) 인코더 + 경량 난독화**가
> 핵심 가치입니다. 표준 Base64보다 출력이 크고(한글 1글자 = UTF-8 3바이트) 약 3배 느리므로,
> **저장 효율·속도·상호운용성**이 목표라면 표준/네이티브 Base64를 쓰는 편이 낫습니다. 내장
> AES-256-GCM은 부가 기능이며 **단독 보안 솔루션이 아닙니다**(아래 키 파생 주의 참고).

### Credits

- Origin implementation by:
  - [@i3ls](https://github.com/i3l3)
  - [@gunu3371](https://github.com/gunu3371)
- Original Repository: [ddunigma](https://github.com/i3l3/ddunigma)

## Requirements

- **Node.js >= 22.0.0** (활성 LTS/Current 기준 지원: Node 22·24 LTS, 26 Current).

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

## 6.0.0 사용법

### 문자열과 바이너리

```typescript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64();

const encodedText = ddu.encode("안녕하세요");
const decodedText = ddu.decode(encodedText);

const encodedBytes = ddu.encode(new Uint8Array([0, 1, 127, 128, 255]));
const decodedBytes = ddu.decodeToUint8Array(encodedBytes);
const decodedBuffer = ddu.decodeToBuffer(encodedBytes); // Node.js 전용
```

### 프리셋

```typescript
import { Ddu64, DduSetSymbol } from "@ddunigma/node";

const ddu = new Ddu64();
const legacy = new Ddu64({ dduSetSymbol: DduSetSymbol.DDU_V1 });
const oneCharset = new Ddu64({ dduSetSymbol: DduSetSymbol.ONECHARSET });
```

### 커스텀 charset

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

### 사용 가능한 옵션

생성자 옵션은 인스턴스의 기본값으로 적용됩니다. `encode`, `decode`, `getStats` 계열 메서드에
같은 옵션을 전달하면 해당 호출에서만 기본값을 덮어씁니다.

#### 공통 옵션

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
| `maxDecompressedBytes` | `number`                          | `67108864`        | 최대 압축 해제 바이트 수                |
| `obfuscate`            | `boolean`                         | `false`           | 암호화된 출력을 한글 음절로 난독화      |
| `requireEncryption`    | `boolean`                         | 키 사용 시 `true` | 키가 있는 decoder에서 평문 payload 거부 |
| `onProgress`           | `(info: DduProgressInfo) => void` | 미사용            | 처리 진행률 콜백                        |

Web Streams API는 축적 모드 메모리 제한용 `maxBufferedBytes`(인코딩, 기본 64 MiB)와
`maxBufferedChars`(디코딩, 기본 64 Mi 문자)를 추가로 지원합니다. `maxDecodedBytes`는
디코딩 결과 크기만 제한합니다.

> **스트림 동작 주의:** 현재 Web Streams는 **2의 제곱수 charset + 압축/암호화/체크섬 미사용**
> 조합에서만 청크 단위로 진정한 스트리밍을 합니다. 압축·암호화·체크섬을 켜거나 비-2의 제곱수
> charset을 쓰면 footer가 최종 메타데이터이므로 **전체 입력을 메모리에 축적한 뒤 flush에서
> 일괄 처리하는 "buffered transform"**으로 동작합니다(메모리 상한 = 전체 크기). 프레임 단위
> 진짜 스트리밍은 `createFramedEncodeStream`/`createFramedDecodeStream`(DDS2)에서 다룹니다(아래 참고).

#### 프레임드 스트리밍 (DDS2, opt-in)

대용량 데이터를 **상수 메모리**로 처리하려면 `createFramedEncodeStream`/`createFramedDecodeStream`을
사용하세요. 입력을 고정 크기 프레임으로 잘라 프레임마다 독립 압축/암호화하므로 압축·암호화를
켜도 전량 버퍼링하지 않습니다(메모리 ≈ `frameSize`).

```typescript
import { Ddu64, createFramedEncodeStream, createFramedDecodeStream } from "@ddunigma/node";

const ddu = new Ddu64({ encryptionKey: "secret", compress: true, checksum: true });

const encodedStream = sourceByteStream.pipeThrough(
  createFramedEncodeStream(ddu, { frameSize: 64 * 1024 }),
);
const decodedStream = encodedStream.pipeThrough(createFramedDecodeStream(ddu));
```

보안: 암호화 시 프레임마다 AES-256-GCM(랜덤 IV) + **프레임 인덱스를 AAD에 바인딩**해 재정렬/재생을
방어하고, 트레일러의 총 프레임 수 + final 플래그로 절단을 탐지합니다. `checksum: true`면 프레임별
CRC32(인덱스 바인딩)로 비암호화 스트림에서도 손상·재정렬을 탐지합니다. 단일 페이로드
(`encode`/`decode`) 포맷(`DDS1`/V4)과 분리된 신규 `DDS2` 포맷이라 기존 데이터 호환에 영향이 없습니다.

> 참고: DDS2는 새 영구 포맷 표면을 추가합니다. 영구 포맷으로서의 외부 보안 리뷰 항목은
> `.kiro/specs/dds2-true-streaming/security-review.md`에 정리되어 있습니다.

#### 생성자 전용 옵션

| 옵션               | 타입                   | 기본값      | 용도                                |
| ------------------ | ---------------------- | ----------- | ----------------------------------- |
| `dduSetSymbol`     | `DduSetSymbol`         | `DDU`       | 기본 charset 프리셋 선택            |
| `dduChar`          | `string \| string[]`   | 프리셋 사용 | 커스텀 charset                      |
| `codaChar`         | `string[]`             | 미사용      | 기본 문자와 조합할 한글 종성        |
| `paddingChar`      | `string`               | 프리셋 사용 | 커스텀 패딩 문자                    |
| `requiredLength`   | `number`               | `64`        | 필요한 charset 문자 수              |
| `usePowerOfTwo`    | `boolean`              | 자동 결정   | 2의 제곱수 charset 직접 인덱스 모드 |
| `useRepeatPadding` | `boolean`              | 프리셋 설정 | 반복 패딩 방식 사용                 |
| `throwOnError`     | `boolean`              | `true`      | 잘못된 charset 설정에서 예외 발생   |
| `urlSafe`          | `boolean`              | `false`     | URL-Safe 출력 변환                  |
| `encryptionKey`    | `string`               | 미사용      | AES-256-GCM 암호화 키               |
| `keyDerivation`    | `KeyDerivationOptions` | `pbkdf2`    | 암호화 키 파생 방식                 |
| `adapter`          | `PlatformAdapter`      | 진입점 설정 | 플랫폼 어댑터 직접 주입             |

`encoding` 옵션은 6.0.0에서 제거되었습니다. 런타임 문자열 처리는 항상 UTF-8이며,
`CharSetInfo.encoding`은 리터럴 `"utf-8"` 타입으로 고정됩니다.
`encrypt`와 `omitFooter`는 스트림 및 내부 파이프라인 제어용 `@internal` 옵션이므로 공개 타입에
노출되지 않으며 일반 사용에서는 지정하지 않습니다.

### 압축, 암호화, 체크섬

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
    iterations: 210_000,
  },
  checksum: true,
});

const encoded = ddu.encode("보호할 데이터");
const decoded = ddu.decode(encoded);
```

복호화할 때는 인코딩에 사용한 `encryptionKey`와 키 파생 설정을 동일하게 사용해야 합니다.
암호화 키가 설정된 인스턴스는 기본적으로 암호화 footer가 없는 payload를 거부합니다. 같은 인스턴스로
레거시 평문을 읽어야 하면 해당 decode 호출에 `requireEncryption: false`를 명시합니다.
체크섬을 호출별 옵션으로 사용한 경우 디코딩에도 `checksum: true`를 지정합니다.

> **키 파생 주의 (보안):** 기본 키 파생은 PBKDF2-HMAC-SHA256, 210,000회 반복입니다. 이는
> OWASP 권고치(PBKDF2-HMAC-SHA256 ≥ 600,000회)보다 낮고, `salt`를 생략하면 **고정 기본
> salt**가 쓰입니다. 또한 키 파생 파라미터(알고리즘/iterations/salt)는 **와이어에 자기기술되지
> 않으므로** 인코딩·디코딩 양쪽에서 동일하게 지정해야 합니다. 비밀번호성(저엔트로피) 키를
> 쓴다면 반드시 **애플리케이션 고유 `salt`** 와 충분히 높은 `iterations`를 직접 지정하세요.
> 강력한 키 파생/키 관리가 핵심 요구사항이라면 애플리케이션 레벨에서 전용 KDF/암호화
> 라이브러리(예: Argon2id)를 사용하는 것을 권장합니다(자세한 배경은 `ROADMAP.md` 참고).

```typescript
const encoded = ddu.encode("data", { checksum: true });
const decoded = ddu.decode(encoded, { checksum: true });
```

### URL-Safe와 청크 분할

```typescript
const ddu = new Ddu64("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", "=", {
  urlSafe: true,
  chunkSize: 76,
  chunkSeparator: "\n",
});

const encoded = ddu.encode("long data");
const decoded = ddu.decode(encoded);
```

### 한글 난독화

```typescript
const ddu = new Ddu64({
  encryptionKey: "my-secret-key",
  obfuscate: true,
});

const encoded = ddu.encode("secret");
const decoded = ddu.decode(encoded);
```

난독화에는 암호화 키가 필요하며 `obfuscate: true`와 `encrypt: false`를 함께 사용할 수 없습니다.

### 브라우저와 Workers

```typescript
import { Ddu64 } from "@ddunigma/node/browser";

const ddu = new Ddu64({
  compress: true,
  checksum: true,
});

const encoded = await ddu.encodeAsync("browser data");
const decoded = await ddu.decodeAsync(encoded);
const bytes = await ddu.decodeToUint8ArrayAsync(encoded);
```

브라우저 압축은 실행 환경의 `CompressionStream`과 `DecompressionStream` 지원 여부에 따라 사용할 수
있습니다. 브라우저(Web Compression API)는 압축 레벨 지정을 지원하지 않으므로 `compressionLevel`
옵션은 **브라우저에서 무시**됩니다. 따라서 동일 입력이라도 Node(zlib, 레벨 적용)와 브라우저의
압축 출력 바이트·크기가 다를 수 있습니다(라운드트립 호환성은 유지됩니다).

### 인코딩 통계

```typescript
const stats = ddu.getStats("payload");
const asyncStats = await ddu.getStatsAsync("payload", { compress: true });
```

브라우저에서 압축 통계를 계산할 때는 `getStatsAsync`를 사용합니다.

### 진입점

```typescript
import { Ddu64 as NodeDdu64 } from "@ddunigma/node";
import { Ddu64 as BrowserDdu64 } from "@ddunigma/node/browser";
import { Ddu64 as CoreDdu64 } from "@ddunigma/node/core";

const nodeEncoder = new NodeDdu64();
const browserEncoder = new BrowserDdu64();
const coreEncoder = new CoreDdu64();
```

진입점은 `package.json`의 조건부 `exports`로 런타임에 맞춰 자동 선택됩니다.

- **Node.js**: `@ddunigma/node` → Node 빌드(zlib/crypto 동기 API 포함, `decodeToBuffer` 제공)
- **브라우저 / Workers / Deno / Bun / Edge**: 브라우저 빌드(Web Crypto·CompressionStream 기반)
- 조건 분기로 매칭되지 않는 환경의 최종 `default`는 **브라우저 빌드**입니다. Node 내장
  모듈에 의존하지 않아 미지의 번들러·런타임에서 가장 안전하기 때문입니다. Node 전용
  기능(동기 압축/암호화, `decodeToBuffer`)이 필요하면 `@ddunigma/node`를 Node 조건에서
  사용하세요.

#### 번들 경량화 — 순수 인코딩만 필요하면 `/core`

`@ddunigma/node`(Node)·`/browser` 진입점은 **배터리 포함(batteries-included)**입니다.
편의를 위해 압축/암호화 어댑터와 한글 난독화 레이어를 기본 주입하므로, 이 코드가 번들에
항상 포함됩니다(`obfuscate` 옵션이 즉시 동작).

**압축·암호화·난독화 없이 커스텀/노벨티 charset 인코딩만** 필요하면 `@ddunigma/node/core`를
사용하세요. 어댑터·난독화 구현이 정적으로 묶이지 않아 번들러가 트리셰이킹으로 제거합니다
(측정상 최소 인코드/디코드 기준 약 5KB 절감).

```typescript
import { Ddu64Core } from "@ddunigma/node/core";

// 어댑터 없이 순수 인코딩/디코딩 (압축/암호화 미사용)
const enc = new Ddu64Core(undefined, undefined, { dduSetSymbol: "ddu" as any });
const encoded = enc.encode("hello");
const decoded = enc.decode(encoded);
```

`/core`에서 압축·암호화를 쓰려면 `adapter`(또는 `adapterFactory`)를 직접 주입하고,
난독화를 쓰려면 `obfuscationLayerFactory`를 주입하세요:

```typescript
import { Ddu64Core } from "@ddunigma/node/core";
import { NodeAdapter } from "@ddunigma/node"; // 또는 자체 어댑터
import { HangulObfuscationLayer } from "@ddunigma/node";

const enc = new Ddu64Core(undefined, undefined, {
  encryptionKey: "secret",
  adapterFactory: () => new NodeAdapter(),
  obfuscationLayerFactory: (alphabet) => new HangulObfuscationLayer(alphabet),
});
```

> 참고: `@ddunigma/node`·`/browser` 진입점은 이 두 팩토리를 자동 주입하므로
> 일반 사용자는 신경 쓸 필요가 없습니다. 위 주입은 `/core`를 직접 쓰는 고급 사용자용입니다.
