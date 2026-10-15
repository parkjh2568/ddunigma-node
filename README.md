# ddunigma Node

[![npm version](https://badge.fury.io/js/@ddunigma%2Fnode.svg)](https://www.npmjs.com/package/@ddunigma/node)

한글 종성 조합 charset, 가역 난독화, 선택적 압축·AES-256-GCM 암호화·CRC32 checksum을 Node.js와 웹 런타임에서 제공합니다.
출력 형식을 직접 관리하는 애플리케이션에서 한글·커스텀 charset 표현이 필요할 때 사용합니다.

## 지원 환경

Node.js >=22는 Node 빌드, 브라우저·Web Workers·workerd는 browser 빌드를 선택합니다.
Bun·Deno의 root는 browser, `/secure`는 Node 호환 빌드를 선택합니다. Web API 경로를
고정하려면 `/browser`를 사용하세요. 실제 압축·암호화 지원은 런타임 API에 따릅니다.

CI는 Node 24 전체 검증, Node 22·26과 Bun·Deno의 호환 smoke, 별도 Chromium·Firefox·WebKit
검증을 실행합니다. [런타임별 상세 계약](docs/REFERENCE.md#진입점)을 참고하세요.

## Install

```bash
npm install @ddunigma/node
```

## 언제 사용하는가

다음 요구에는 잘 맞습니다.

- 인코더와 디코더를 모두 통제하며 한글 또는 자체 charset 출력을 사용해야 하는 경우
- 지원하는 wire profile의 기존 데이터를 같은 charset·KDF 설정으로 복원해야 하는 경우
- 런타임 의존성 없이 Node.js와 웹에서 같은 codec 계약을 유지하려는 경우
- 게임, 퍼즐, 식별 표현처럼 가역 난독화의 시각적 특성이 제품 가치인 경우

다음 요구에는 표준 또는 전용 도구가 더 적합합니다.

- 외부 시스템과 표준 형식으로 교환해야 하는 데이터: Base64/Base64url을 사용하세요.
- 전송량이 중요한 데이터: 한글 문자는 UTF-8에서 여러 바이트이므로 Base64보다 커질 수 있습니다.
- 인증 토큰, 키 봉투, 장기 보관 암호문: 검증된 보안 프로토콜과 키 관리 체계를 사용하세요.
- 제한 없는 대용량 스트리밍: 애플리케이션 프레이밍이나 전용 스트리밍 도구를 사용하세요.

프리셋·charset·KDF 설정은 송수신 양쪽에서 함께 관리해야 합니다. 회귀 검증 기준은 npm 6.2.0이며
2.x의 무수정 교체는 보장하지 않습니다. [호환성 범위](docs/REFERENCE.md#호환성-범위)를 확인하세요.

## Quick Start

`createDdu`는 6.3.0에서 추가됩니다(현재 작업 트리는 미배포). 설치된 6.2.x의 `Ddu64` API는
그대로 유지되며 [기존 API](docs/REFERENCE.md#기존-ddu64-api)로 사용할 수 있습니다.

| 필요한 작업             | 선택할 API                       | 호출 방식                                    |
| ----------------------- | -------------------------------- | -------------------------------------------- |
| 텍스트 인코딩·복원      | `createDdu()`                    | `await encode()`·`await decode()`            |
| 바이너리 복원           | `createDdu({ output: "bytes" })` | decode가 `Uint8Array` 반환                   |
| 통계·스트림·호출별 옵션 | 기존 `Ddu64` 인스턴스            | 필요한 메서드와 옵션 선택                    |
| Node 동기 압축·암호화   | `await Ddu64.create(options)`    | 준비 후 동기 encode·decode; 브라우저는 async |

```javascript
const { createDdu } = require("@ddunigma/node");

async function main() {
  const ddu = createDdu();
  const encoded = await ddu.encode("abc"); // "우잇땩얃"
  console.log(await ddu.decode(encoded)); // "abc"
}

main().catch(console.error);
```

ESM에서는 `import { createDdu } from "@ddunigma/node"`를 사용합니다. 압축·암호화·난독화는
생성 옵션으로 지정하고 두 메서드명은 그대로 사용합니다. 옵션은 객체 생성 시 보존하며
호출별 설정을 기억하거나 자동 추측하지 않습니다.

게임의 퍼즐 힌트나 커뮤니티 메시지처럼 출력의 모습 자체가 필요한 곳에 적용할 수 있습니다.
위 `abc`는 원문 3바이트, DDU 출력 4문자·UTF-8 12바이트입니다. 난독화는 같은 설정과 입력에
항상 같은 결과를 내며, 출력이 지나는 저장소·복사 경로는 Unicode 코드포인트를 보존해야 합니다.
정규화(NFD 등)로 한글 음절을 분해하면 복원할 수 없습니다.

임의 바이너리는 문자열로 디코딩하지 않고 반환 종류를 명시하세요.

```typescript
import { createDdu } from "@ddunigma/node";

const binary = createDdu({ output: "bytes" });
const bytes = new Uint8Array([0, 128, 255]);
const restored = await binary.decode(await binary.encode(bytes)); // Uint8Array [0, 128, 255]
```

## 진입점

- root: 일반 codec과 lazy adapter·Web Streams, Node의 eager `Ddu64.create()`.
- `/browser`: 웹 경로를 명시하는 codec과 lazy 기능.
- `/secure`: adapter·Web Streams 함수·런타임별 secure 클래스를 정적으로 export하는 고급·호환 경로.
- `/core`: 플랫폼 독립 codec/checksum에 구현을 직접 주입하는 최소 경로.

root·`/browser`의 평문 경로는 adapter·Web Streams를 로드하지 않습니다. 비동기 압축·암복호화나 stream 호출에서
필요한 모듈을 동적 import해 같은 core 인스턴스에서 사용합니다.

`/secure`는 기능 묶음이며 프로토콜 설계, 키 저장·교환·회전, 사용자 인증을 대신하지 않습니다.

## 한글 난독화

```typescript
import { createDdu } from "@ddunigma/node";

const ddu = createDdu({ obfuscate: true });
const encoded = await ddu.encode("재미있는 난독화");
const decoded = await ddu.decode(encoded);
```

난독화는 charset 문자를 한글 음절로 바꾸는 결정론적 1:1 가역 변환입니다. 빈도 분포를
숨기거나 암호화하지 않습니다. Checksum을 함께 사용하면 checksum marker는 한글 난독화
밖의 ASCII suffix로 남습니다.

## 압축·암호화·Checksum

```typescript
import { createDdu } from "@ddunigma/node";

const encryptionKey = process.env.DDU64_KEY;
if (!encryptionKey) throw new Error("DDU64_KEY is required");

const ddu = createDdu({
  compress: true,
  encryptionKey,
  keyDerivation: {
    algorithm: "pbkdf2",
    salt: "my-application-and-user-specific-salt",
    iterations: 600_000,
  },
  checksum: true,
});

const encoded = await ddu.encode("보호할 데이터");
const decoded = await ddu.decode(encoded);
```

비동기 메서드가 반환한 뒤 입력 `Uint8Array`/`Buffer`와 호출 옵션을 재사용해도 진행 중인
작업의 입력은 유지됩니다. 첫 암호화 호출에는 키 파생 비용이 포함되며, 같은 설정으로 반복
처리할 때 인스턴스를 재사용하면 파생된 키를 다시 사용할 수 있습니다.

압축 여부는 wire metadata에서 판별하므로 decode에 `compress:true`를 반복할 필요가 없습니다.
Node의 동기 호출은 기존 `Ddu64.create()`를 사용합니다.
[동기 압축·암호화 예제](docs/REFERENCE.md#압축-암호화-체크섬)를 참고하세요.

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

## 오류 처리

생성 오류는 즉시 throw하고 비동기 연산 오류는 reject하므로 객체 생성과 await를 같은
`try` 안에 두세요. 오류 메시지나 `instanceof` 대신 `isDdu64Error`와 `code`로 분기하면
ESM/CJS를 함께 사용하는 경우에도 같은 오류 계약을 사용할 수 있습니다.

```typescript
import { createDdu, Ddu64ErrorCode, isDdu64Error } from "@ddunigma/node";

try {
  const ddu = createDdu({ checksum: true, maxEncodedChars: 1024 });
  const encoded = await ddu.encode("저장할 데이터");
  console.log(await ddu.decode(encoded));
} catch (error) {
  if (!isDdu64Error(error)) throw error;
  if (error.code === Ddu64ErrorCode.InvalidInput) {
    console.error("입력과 옵션을 확인하세요.");
  } else if (error.code === Ddu64ErrorCode.LimitExceeded) {
    console.error("설정한 입력 크기 한도를 확인하세요.");
  } else if (error.code === Ddu64ErrorCode.ChecksumMismatch) {
    console.error("송수신 설정과 저장된 데이터의 손상 여부를 확인하세요.");
  } else {
    throw error;
  }
}
```

입력·한도·인증 오류는 같은 입력으로 반복 호출해도 해결되지 않습니다. 오류별 대응과
adapter 초기화 재시도 계약은 [오류 처리 reference](docs/REFERENCE.md#오류-처리)를 참고하세요.

## 상세 문서

- [API Reference](docs/REFERENCE.md): 옵션·오류·문자열·스트림·통계의 공개 계약
- [범위·설계 결정](docs/DECISIONS.md): 제품 전제, 구조 평가, 최적화 현황과 재검토 조건
- [개발·리뷰·릴리스 컨벤션](https://github.com/parkjh2568/ddunigma-node/blob/master/CONTRIBUTING.md): 코드 배치·함수 분리·입력 소유권·변경별 검증

## Credits

- Origin implementation: [@i3ls](https://github.com/i3l3), [@gunu3371](https://github.com/gunu3371)
- Original repository: [ddunigma](https://github.com/i3l3/ddunigma)
