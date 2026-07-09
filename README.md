# ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

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

키 없는 난독화는 암호화가 아닙니다. 동일 입력은 항상 동일 출력이 되어 기밀성·변조 방지를 제공하지
않습니다.

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

AES-256-GCM은 부가 기능입니다. 저엔트로피 키를 쓰면 애플리케이션 고유 `salt`와 높은
`iterations`를 명시하세요.

## Reference

전체 옵션, 커스텀 charset, URL-Safe, Web Streams, `/core` 고급 사용법은
[docs/REFERENCE.md](docs/REFERENCE.md)를 보세요.

## Migration notes

6.0에서 압축/암호화/체크섬/Web Streams는 기본 진입점에서 `@ddunigma/node/secure`로 이동했습니다.
WASM API(`preloadWasm`, `getWasmCodec`, `wasmThreshold`)는 제거됐습니다. 기존 wire format은 유지되어
기존 데이터는 그대로 디코딩됩니다.
