# ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

문자열과 바이너리를 한글·커스텀 문자셋으로 인코딩하고 복원합니다.
Node.js 22 이상과 브라우저에서 사용할 수 있습니다.

## 설치

```bash
npm install @ddunigma/node
```

## 사용법

다음을 `example.mjs`로 저장하세요.

```javascript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64();
const encoded = ddu.encode("abc");

console.log(encoded); // 우잇땩얃
console.log(ddu.decode(encoded)); // abc
```

```bash
node example.mjs
```

난독화는 암호화가 아닙니다.

## 더 알아보기

- [옵션·문자셋·바이너리](docs/REFERENCE.md)
- [압축·암호화](docs/REFERENCE.md#압축-암호화-체크섬)
- [브라우저](docs/REFERENCE.md#웹-런타임) · [스트림](docs/REFERENCE.md#web-streams)
- [변경 내역](CHANGELOG.md)

## Credits

- Original: [ddunigma](https://github.com/i3l3/ddunigma)
- Authors: [@i3ls](https://github.com/i3l3), [@gunu3371](https://github.com/gunu3371)
