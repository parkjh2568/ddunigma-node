# ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

커스텀 charset을 사용하는 Base64 스타일 인코더/디코더 라이브러리입니다.

V2 추가사항

- 이제 한글 종성 결합 시스템을 활용하여 8개 기본 문자 × 8개 종성으로 64가지 조합을 만들어, 6비트를 한 글자로 표현합니다.

## Credits

- Origin implementation by:
  - [@i3ls](https://github.com/i3l3)
  - [@gunu3371](https://github.com/gunu3371)
- Original Repository: [ddunigma](https://github.com/i3l3/ddunigma)

## Requirements

- Node.js >= 22.0.0

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

## 진입점

| 진입점                   | 기능                                    | 용도                  |
| ------------------------ | --------------------------------------- | --------------------- |
| `@ddunigma/node`         | 인코딩 + 한글 난독화                    | Node 기본 lean        |
| `@ddunigma/node/browser` | 인코딩 + 한글 난독화                    | 브라우저/Workers lean |
| `@ddunigma/node/secure`  | 압축/암호화/체크섬/Web Streams + 난독화 | 배터리 필요할 때      |
| `@ddunigma/node/core`    | 순수 인코딩/디코딩                      | 최소 번들             |

```typescript
import { Ddu64 as NodeDdu64 } from "@ddunigma/node";
import { Ddu64 as BrowserDdu64 } from "@ddunigma/node/browser";
import { Ddu64 as SecureDdu64 } from "@ddunigma/node/secure";
import { Ddu64 as CoreDdu64 } from "@ddunigma/node/core";
```

## 한글 난독화

```typescript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64({ obfuscate: true });
const encoded = ddu.encode("재미있는 난독화");
const decoded = ddu.decode(encoded);
```

## 압축, 암호화, 체크섬

```typescript
import { Ddu64 } from "@ddunigma/node/secure";

const ddu = new Ddu64({
  compress: true,
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

## Reference

전체 옵션, 커스텀 charset, URL-Safe, Web Streams, `/core` 고급 사용법은
[docs/REFERENCE.md](docs/REFERENCE.md)를 보세요.
