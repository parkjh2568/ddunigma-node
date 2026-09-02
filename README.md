# ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

Zero-dependency 커스텀 charset codec입니다. 한글 종성 조합 charset, 가역 난독화,
선택적 압축·AES-256-GCM 암호화·CRC32 checksum을 Node.js와 브라우저에서 제공합니다.

> 난독화와 CRC32는 기밀성이나 인증을 제공하지 않습니다. 보호가 필요한 데이터는
> 충분한 entropy의 키와 AES-GCM을 사용하세요.

## 지원 환경

- Node.js >= 22.0.0
- 브라우저 압축·암호화는 WebCrypto와 해당 `CompressionStream`/
  `DecompressionStream` 형식을 지원하는 런타임

## Install

```bash
npm install @ddunigma/node
```

## Quick Start

```typescript
import { Ddu64, DduSetSymbol } from "@ddunigma/node";

const ddu = new Ddu64();
const encoded = ddu.encode("안녕하세요");
ddu.decode(encoded); // "안녕하세요"

// 구버전 8문자 쌍 형식 호환
const legacy = new Ddu64({ dduSetSymbol: DduSetSymbol.DDU_V1 });
legacy.decode(legacy.encode("legacy"));
```

## 진입점

| 진입점                   | 기능                                                        | 권장 용도               |
| ------------------------ | ----------------------------------------------------------- | ----------------------- |
| `@ddunigma/node`         | Node codec/checksum/난독화 + async secure adapter lazy load | 기본 선택               |
| `@ddunigma/node/browser` | 브라우저 codec/checksum/난독화 + async adapter lazy load    | 브라우저/Workers        |
| `@ddunigma/node/secure`  | sync/async adapter, Web Streams, adapter export             | Node 동기 secure·스트림 |
| `@ddunigma/node/core`    | 플랫폼 독립 codec/checksum                                  | 최소 번들·직접 주입     |

Root 진입점은 평문 codec 경로에서 adapter를 불러오지 않습니다. 비동기 압축·
암복호화가 실제로 실행될 때만 해당 런타임 adapter를 동적 import해 같은 core
인스턴스에 주입합니다.

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

const ddu = new Ddu64({
  compress: true,
  encryptionKey: "my-secret-key",
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

압축 여부는 wire metadata에서 판별하므로 decode에 `compress:true`를 반복할 필요가 없습니다.
동기 압축·암호화가 필요하면 `@ddunigma/node/secure`를 import하세요.

### 키 파생 주의사항

- 사람이 입력하는 비밀번호는 `pbkdf2`와 충분한 iteration을 사용하세요.
- `salt`는 애플리케이션·사용자별로 고유하게 관리하고 복호화 시 동일한 값을 제공하세요.
- 기본 PBKDF2 210,000회와 고정 fallback salt는 기존 wire 호환성을 위한 값입니다. 보안이
  중요한 새 데이터에서는 명시적 설정에 의존하세요.
- `sha256`은 구버전 호환 또는 충분한 entropy의 키에만 사용하세요.
- KDF 설정은 wire format에 기록되지 않으므로 데이터와 함께 버전 관리하세요.

OWASP의 현재 PBKDF2-HMAC-SHA256 권고와 애플리케이션 위협 모델을 함께 검토하세요.
[OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

## 상세 문서

- [API Reference](docs/REFERENCE.md)
- [범위·설계 결정](ROADMAP.md)
- [개발·릴리스 컨벤션](CONTRIBUTING.md)

## Credits

- Origin implementation: [@i3ls](https://github.com/i3l3), [@gunu3371](https://github.com/gunu3371)
- Original repository: [ddunigma](https://github.com/i3l3/ddunigma)
