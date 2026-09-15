# ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

Zero-dependency 커스텀 charset codec입니다. 한글 종성 조합 charset, 가역 난독화,
선택적 압축·AES-256-GCM 암호화·CRC32 checksum을 Node.js와 웹 런타임에서 제공합니다.
출력 형식을 직접 관리하는 애플리케이션에서 한글·커스텀 charset 표현이 필요할 때 사용합니다.

> 이 패키지는 표준 Base64 대체 규격이나 완결된 보안 프로토콜이 아닙니다. 난독화와
> CRC32는 기밀성이나 인증을 제공하지 않으며, 키 관리와 위협 모델은 애플리케이션의
> 책임입니다.

## 지원 환경

| 런타임              | 자동 선택 빌드                 | 압축·암호화 경로                             |
| ------------------- | ------------------------------ | -------------------------------------------- |
| Node.js >= 22       | Node                           | root lazy 또는 `create()` 동기·비동기        |
| 브라우저·번들러     | browser 조건 또는 `/browser`   | WebCrypto·Compression Streams 기반 비동기    |
| Web Workers·workerd | browser 호환                   | 런타임 Web API가 지원하는 기능만 비동기      |
| Bun·Deno            | root: browser, `/secure`: Node | root 비동기, `/secure` Node 호환 동기·비동기 |

Bun과 Deno에서 root는 명시적인 `bun`/`deno` 조건으로 browser 빌드를 선택하지만,
`/secure`는 두 런타임의 Node 호환 조건에 따라 Node 빌드를 선택합니다. Web API 경로를
고정하려면 `/browser`를 사용하세요. 브라우저 계열의 실제 지원 알고리즘은 WebCrypto와
`CompressionStream`/`DecompressionStream` 구현에 따라 달라집니다.

CI는 Node 24에서 전체 검증, Node 22·26과 Bun·Deno에서 런타임 호환을 확인합니다.
별도 Playwright 작업은 Chromium·Firefox·WebKit에서 브라우저 빌드와 Node 간 데이터 호환을
실행합니다. Node에서 `/browser`를 import하는 smoke와 실제 브라우저 엔진 검증은 별개입니다.

## Install

```bash
npm install @ddunigma/node
```

## 언제 사용하는가

다음 요구에는 잘 맞습니다.

- 인코더와 디코더를 모두 통제하며 한글 또는 자체 charset 출력을 사용해야 하는 경우
- 기존 ddunigma 출력과의 하위 호환이 필요한 경우
- 런타임 의존성 없이 Node.js와 웹에서 같은 codec 계약을 유지하려는 경우
- 게임, 퍼즐, 식별 표현처럼 가역 난독화의 시각적 특성이 제품 가치인 경우

다음 요구에는 표준 또는 전용 도구가 더 적합합니다.

- 외부 시스템과 표준 형식으로 교환해야 하는 데이터: Base64/Base64url을 사용하세요.
- 전송량이 중요한 데이터: 한글 문자는 UTF-8에서 여러 바이트이므로 Base64보다 커질 수 있습니다.
- 인증 토큰, 키 봉투, 장기 보관 암호문: 검증된 보안 프로토콜과 키 관리 체계를 사용하세요.
- 제한 없는 대용량 스트리밍: 애플리케이션 프레이밍이나 전용 스트리밍 도구를 사용하세요.

프리셋, 커스텀 charset, KDF 설정은 송수신 양쪽에서 함께 관리해야 합니다. 출력 포맷을
제어할 수 없는 경계에는 이 codec을 도입하지 않는 편이 안전합니다.

## Quick Start

```typescript
import { Ddu64, DduSetSymbol } from "@ddunigma/node";

const ddu = new Ddu64();
const encoded = ddu.encode("abc"); // "우잇땩얃"
ddu.decode(encoded); // "abc"
const hidden = ddu.encode("abc", { obfuscate: true }); // "렀뜁낂붃"
ddu.decode(hidden, { obfuscate: true }); // "abc"

// 구버전 8문자 쌍 형식 호환
const legacy = new Ddu64({ dduSetSymbol: DduSetSymbol.DDU_V1 });
legacy.decode(legacy.encode("legacy"));
```

게임의 퍼즐 힌트나 커뮤니티 메시지처럼 출력의 모습 자체가 필요한 곳에 적용할 수 있습니다.
위 `abc`는 원문 3바이트, DDU 출력 4문자·UTF-8 12바이트입니다. 난독화는 같은 설정과 입력에
항상 같은 결과를 내며, 출력이 지나는 저장소·복사 경로는 Unicode 코드포인트를 보존해야 합니다.
정규화(NFD 등)로 한글 음절을 분해하면 복원할 수 없습니다.

## 진입점

| 진입점                   | 기능                                                      | 권장 용도                  |
| ------------------------ | --------------------------------------------------------- | -------------------------- |
| `@ddunigma/node`         | codec + lazy adapter·Web Streams + Node eager `create()`  | 일반 사용 기본             |
| `@ddunigma/node/browser` | 웹 codec + lazy adapter·Web Streams                       | 웹 경로 명시               |
| `@ddunigma/node/secure`  | adapter·Web Streams 함수와 Node 동기 클래스를 정적 export | 고급 제어·기존 API 호환    |
| `@ddunigma/node/core`    | 플랫폼 독립 codec/checksum, 구현 직접 주입                | 최소 정적 그래프·직접 주입 |

Root 진입점은 평문 codec 경로에서 adapter나 Web Streams 구현을 불러오지 않습니다.
비동기 압축·암복호화 또는 stream 메서드가 실제로 실행될 때만 해당 모듈을 동적 import해
같은 core 인스턴스에서 사용합니다.

Node에서 동기 압축·암호화가 필요하면 별도 import 대신 `Ddu64.create()`로 adapter를 먼저
준비할 수 있습니다. 브라우저의 압축·암호화는 `create()` 사용 여부와 관계없이 비동기입니다.

`/secure`는 adapter 클래스와 기존 Web Streams 함수 export를 정적으로 사용해야 하는
고급·호환 진입점입니다. 이름은 기능 묶음을 뜻하며 프로토콜 설계, 키 저장·교환·회전,
사용자 인증까지 대신한다는 의미는 아닙니다.

## 한글 난독화

```typescript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64({ obfuscate: true });
const encoded = ddu.encode("재미있는 난독화");
const decoded = ddu.decode(encoded);
```

난독화는 charset 문자를 한글 음절로 바꾸는 결정론적 1:1 가역 변환입니다. 빈도 분포를
숨기거나 암호화하지 않습니다. Checksum을 함께 사용하면 checksum marker는 한글 난독화
밖의 ASCII suffix로 남습니다.

## 압축·암호화·Checksum

```typescript
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

const encoded = await ddu.encodeAsync("보호할 데이터");
const decoded = await ddu.decodeAsync(encoded);
```

비동기 메서드가 반환한 뒤 입력 `Uint8Array`/`Buffer`와 호출 옵션을 재사용해도 진행 중인
작업의 입력은 유지됩니다. 첫 암호화 호출에는 키 파생 비용이 포함되며, 같은 설정으로 반복
처리할 때 인스턴스를 재사용하면 파생된 키를 다시 사용할 수 있습니다.

압축 여부는 wire metadata에서 판별하므로 decode에 `compress:true`를 반복할 필요가 없습니다.
Node에서 동기 압축·암호화가 필요하면 같은 import의 비동기 팩토리를 사용하세요.

```typescript
const eagerDdu = await Ddu64.create({
  compress: true,
  encryptionKey,
  keyDerivation: {
    algorithm: "pbkdf2",
    salt: "my-application-and-user-specific-salt",
    iterations: 600_000,
  },
});

const syncEncoded = eagerDdu.encode("보호할 데이터");
const syncDecoded = eagerDdu.decode(syncEncoded);
```

비밀 데이터와 공격자가 조절할 수 있는 입력을 같은 payload에 넣어 압축한 뒤 암호화하면
길이 차이를 이용한 정보 노출이 생길 수 있습니다. 이런 데이터는 함께 압축하지 않거나,
신뢰 경계를 분리한 별도 payload로 처리하세요.

### 키 파생 주의사항

- 사람이 입력하는 비밀번호는 `pbkdf2`와 충분한 iteration을 사용하세요.
- `salt`는 애플리케이션·사용자별로 고유하게 관리하고 복호화 시 동일한 값을 제공하세요.
- 기본 PBKDF2 210,000회와 고정 fallback salt는 기존 wire 호환성을 위한 값입니다. 보안이
  중요한 새 데이터에서는 명시적 설정에 의존하세요.
- `sha256`은 구버전 호환 또는 충분한 entropy의 키에만 사용하세요.
- KDF 설정은 wire format에 기록되지 않으므로 데이터와 함께 버전 관리하세요.
- 키 저장·교환·회전·폐기는 애플리케이션의 보안 체계에서 관리하세요.

OWASP의 현재 PBKDF2-HMAC-SHA256 권고와 애플리케이션 위협 모델을 함께 검토하세요.
[OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

## Web Streams

별도 진입점이나 함수 import 없이 인스턴스에서 필요한 구현을 지연 로드합니다.

```typescript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64({ checksum: true });
const encodeStream = await ddu.createEncodeStream();
const decodeStream = await ddu.createDecodeStream();
```

압축·암호화·체크섬을 사용한 인코딩과 모든 디코딩은 입력을 축적합니다. 기본 64MiB 제한은
입력 버퍼 상한이고, 결과 문자열·작업 버퍼·동시 호출을 포함한 프로세스 메모리 상한은 아닙니다.
입력 크기와 동시 처리 수에 맞춰 한도를 낮추세요. [상세 계약과 크기 측정](docs/REFERENCE.md#web-streams)

생성자 옵션은 인스턴스 기본값이고 호출 옵션의 `compress:false`, `checksum:false`,
`obfuscate:false`로 해당 호출에서 기능을 끌 수 있습니다. 암호화 키가 있는 인스턴스에서
암호화만 끄는 동작은 지원하지 않으므로 평문 처리는 별도 인스턴스를 사용하세요. 한 번
동적 import된 모듈은 런타임의 ESM 캐시에 남으며, 옵션 비활성화가 모듈 unload를 의미하지는
않습니다.

## 상세 문서

- [API Reference](docs/REFERENCE.md)
- [범위·설계 결정](docs/DECISIONS.md)
- [개발·릴리스 컨벤션](https://github.com/parkjh2568/ddunigma-node/blob/master/CONTRIBUTING.md)

## Credits

- Origin implementation: [@i3ls](https://github.com/i3l3), [@gunu3371](https://github.com/gunu3371)
- Original repository: [ddunigma](https://github.com/i3l3/ddunigma)
