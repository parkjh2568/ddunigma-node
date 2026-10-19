# ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

런타임 의존성 없이 데이터를 한글·커스텀 charset으로 인코딩합니다.
Node.js 22 이상과 웹 런타임에서 난독화·압축·AES-256-GCM·CRC32를 선택해 사용합니다.

## 설치와 첫 실행

```bash
npm install @ddunigma/node
```

다음을 `example.mjs`로 저장하세요. 배포된 6.2.0과 6.3.0 작업본에서 모두 사용할 수 있습니다.

```javascript
import { Ddu64 } from "@ddunigma/node";

const ddu = new Ddu64();
const encoded = ddu.encode("abc");
console.log(encoded); // 우잇땩얃
console.log(ddu.decode(encoded)); // abc

const bytes = new Uint8Array([0, 128, 255]);
console.log([...ddu.decodeToUint8Array(ddu.encode(bytes))]); // [0, 128, 255]
```

```bash
node example.mjs
```

CommonJS에서는 `const { Ddu64 } = require("@ddunigma/node")`를 사용하세요.
임의 바이너리는 `decodeToUint8Array()` 또는 Node 전용 `decodeToBuffer()`로 복원합니다.

## 필요한 기능 선택

| 필요한 작업           | 사용할 API·옵션                            | 실행 예제                                           |
| --------------------- | ------------------------------------------ | --------------------------------------------------- |
| 텍스트·바이너리       | `Ddu64`의 동기 encode/decode               | 위 첫 실행                                          |
| 한글 난독화           | `new Ddu64({ obfuscate: true })`           | [난독화](docs/REFERENCE.md#한글-난독화)             |
| 압축·암호화           | `encodeAsync`/`decodeAsync`                | [압축·암호화](docs/REFERENCE.md#압축-암호화-체크섬) |
| Node 동기 압축·암호화 | `await Ddu64.create(options)` 후 동기 호출 | [동기 호출](docs/REFERENCE.md#압축-암호화-체크섬)   |
| 스트림 입출력         | `createEncodeStream`/`createDecodeStream`  | [실제 왕복 처리](docs/REFERENCE.md#web-streams)     |
| 통계·크기 측정        | `getStats`/`getStatsAsync`                 | [통계](docs/REFERENCE.md#인코딩-통계)               |

브라우저 경로를 고정하려면 `@ddunigma/node/browser`를 import하세요. 브라우저 압축·암호화는
비동기 호출을 사용하며 지원 여부는 Web API에 따릅니다. [런타임·진입점 표](docs/REFERENCE.md#진입점)

## 6.3.0 간편 API 미리보기

`createDdu`는 미배포 6.3.0의 추가 기능입니다. 설치한 6.2.x에서는 위 `Ddu64`를 사용하세요.
6.3.0 저장소에서는 `pnpm install --frozen-lockfile`·`pnpm build` 후 다음을 `simple.mjs`로
저장하고 `node simple.mjs`로 실행하세요.

```javascript
import { createDdu } from "@ddunigma/node";

const ddu = createDdu({ obfuscate: true });
console.log(await ddu.decode(await ddu.encode("abc"))); // abc
```

옵션은 생성 시 고정하며 encode/decode는 항상 Promise를 반환합니다. 바이너리 출력은
`createDdu({ output: "bytes" })`를 사용하세요. [상세 계약](docs/REFERENCE.md#간편-api)

## 사용 전 확인

- 인코더와 디코더가 같은 charset·KDF 설정을 사용해야 합니다. 2.x의 무수정 교체는 보장하지
  않습니다. [호환성 범위](docs/REFERENCE.md#호환성-범위)
- 출력 코드포인트를 보존하세요. 한글을 NFD로 정규화하면 복원할 수 없습니다.
- 난독화는 결정론적 가역 치환이고 CRC32는 손상 검출용입니다. 기밀성·위변조 인증을 제공하지 않습니다.
- 암호화는 동일한 키·KDF 파라미터로 복호화합니다. 키 관리와 KDF 설정은 애플리케이션이 담당합니다.
  비밀과 공격자 입력을 함께 압축한 뒤 암호화하면 길이 정보가 노출될 수 있습니다.
  [보안 경계와 설정](docs/REFERENCE.md#보안-경계)
- 스트림의 입력 축적 한도는 프로세스 메모리 상한이 아닙니다. 큰 입력의 CPU 작업은 async API에서도
  이벤트 루프를 점유할 수 있습니다. [입력·스트림 한도](docs/REFERENCE.md#web-streams)
- 생성 오류는 throw, 비동기 오류는 reject합니다. 생성과 await를 같은 `try`에 두고
  `isDdu64Error`·`code`로 분기하세요. [오류별 대응](docs/REFERENCE.md#오류-처리)

게임·퍼즐처럼 출력 모양이 필요한 경우에 적합합니다. 표준 교환은 Base64/Base64url, 인증 토큰·
장기 암호문은 전용 프로토콜, 대용량 연속 처리는 전용 스트리밍 도구를 사용하세요.
한글 출력은 UTF-8에서 커집니다(`abc`: 원문 3B → DDU 4문자·12B).

## 상세 문서

- [API Reference](docs/REFERENCE.md): 옵션·입출력·오류·실행 예제
- [설계 결정](docs/DECISIONS.md): 선택 근거와 최적화 재검토 조건
- [개발·검증·출시 절차](https://github.com/parkjh2568/ddunigma-node/blob/master/CONTRIBUTING.md)

## Credits

- Origin implementation: [@i3ls](https://github.com/i3l3), [@gunu3371](https://github.com/gunu3371)
- Original repository: [ddunigma](https://github.com/i3l3/ddunigma)
