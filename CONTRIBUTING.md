# 개발·리뷰·릴리스 컨벤션

`@ddunigma/node`의 상세 개발 규칙입니다. 작업과 관련된 절을 선택해 적용하며, 판단이 충돌하면
정확성, wire 호환성, 경량성, 가독성 순으로 검토합니다.

에이전트의 핵심 지침·문서 탐색은 [AGENTS.md](AGENTS.md), 사용 예제는 [README](README.md),
공개 계약은 [REFERENCE](docs/REFERENCE.md), 구조·최적화 근거는 [DECISIONS](docs/DECISIONS.md)가
담당합니다. 상세 규칙을 에이전트 지침에 복제하거나 문서 전체를 매번 읽도록 요구하지 않습니다.

## 작업 시작과 우선순위

새 기능·구조 변경은 사용 사례, 출력·API, 대상 런타임, 입력 크기와 동시 호출 수를 기준으로
판단합니다. 적용 여부가 불명확할 때 [제품 범위](docs/DECISIONS.md#제품-범위)를 참고합니다.

1. 정상 입력의 실패, 데이터 손상, 인증·크기 제한·호환성 결함을 먼저 수정합니다.
2. 코드와 공개 타입·예제·문서의 불일치를 바로잡습니다.
3. 실제 경로의 할당·복사·번들·처리 시간 문제를 측정하고 개선합니다.
4. 내부 데드코드, 단일 중계 함수, 중복 주석·문서를 정리합니다.

### 최초 환경 준비

CI의 기본 Node 버전과 `package.json#packageManager`의 pnpm을 사용합니다.
다음 명령은 새 checkout의 환경과 기준 상태를 확인할 때 실행합니다.

```bash
pnpm install --frozen-lockfile
pnpm verify
```

기존 환경의 일반 작업은 [변경별 검증](#변경별-검증)을 따릅니다. 의존성 변경 시
[pnpm-workspace.yaml](pnpm-workspace.yaml)의 `allowBuilds`·`overrides`와 lockfile을 검토해
필요한 항목만 갱신합니다. runtime dependency 추가 여부를 확인하고 설치는 명시적으로 실행합니다.

## 핵심 원칙

- 코어는 커스텀 charset codec와 가역 난독화에 집중하고, 압축·암호화는 선택 adapter로 제공합니다.
- runtime dependency 0개를 기본 제약으로 유지합니다.
- 공개 진입점·타입·실행 동작의 일관성을 확인하고 영향받는 부분만 갱신합니다.
- 출력 형식, charset 순서, footer, KDF 기본값 변경은 와이어 호환성 변경으로 취급합니다.

## 디렉터리와 책임

| 위치                                                         | 담당하는 변경                                   | 유지할 경계                                        |
| ------------------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------- |
| `src/index.ts`, `browser.ts`, `core.ts`, `secure*.ts`        | 공개 export와 플랫폼 선택                       | 내부 구현을 편의상 공개하지 않음                   |
| `src/Ddu64*.ts`                                              | 런타임별 생성·lazy 주입·Buffer 편의 API         | wire 규칙과 압축·암호화 구현을 복제하지 않음       |
| `src/core/Ddu64Core.ts`, `types.ts`, `errors.ts`             | 공개 codec 계약, 옵션·상태·오류                 | 구체 플랫폼 adapter에 의존하지 않음                |
| `src/core/pipeline/`                                         | 동기·비동기 처리 순서                           | 버전별 단계·checksum·진행률 의미 보존              |
| `src/core/internal/`                                         | codec 전처리·후처리·검증·매핑·adapter 호출 경계 | 내부 모듈에서 공개 진입점을 역으로 import하지 않음 |
| `src/core/BitPack.ts`, `wireFormat.ts`, `CharsetResolver.ts` | 비트 연산, footer, charset 불변식               | 런타임별 구현과 분리하고 호환 벡터 유지            |
| `src/adapters/`, `src/obfuscation/`, `src/streams/`          | 플랫폼 API, 한글 매핑, DDS1 축적·청크 처리      | 각각 기존 인터페이스와 소유권 계약 유지            |
| `test/`, `test/fixtures/`, `scripts/`, `benchmarks/`         | 회귀·호환 벡터, 배포물 검사, 성능 측정          | production 소스와 분리                             |

새 로직은 기존 책임을 가진 모듈에 배치합니다. 작은 동기 로직마다 파일을 만들거나,
서로 다른 책임의 코드를 범용 `utils`로 모으지 않습니다.

## 진입점 역할

| 진입점                   | 역할                                                          | 정적 import 제약                                  |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------- |
| `@ddunigma/node`         | Node 기본 API. lazy adapter/streams, eager `create()`         | `node:crypto`, `node:zlib`, `NodeAdapter` 금지    |
| `@ddunigma/node/browser` | 브라우저 기본 API. lazy adapter/streams                       | Node 내장 모듈, `BrowserAdapter` 정적 import 금지 |
| `@ddunigma/node/core`    | 플랫폼 독립 core. 필요한 구현은 사용자가 주입                 | 구체 adapter와 난독화 구현 import 금지            |
| `@ddunigma/node/secure`  | adapter, Web Streams, 동기 Node secure API를 포함한 전체 표면 | 조건부 export의 Node/browser 경계 유지            |

위 root 설명은 Node에서의 선택입니다. 실제 `exports`의 browser·worker·workerd·Bun·Deno
선택은 [런타임별 계약](docs/REFERENCE.md#진입점)을 따릅니다.

`package.json#exports`는 공개 API 계약입니다. 해당 조건 객체의 `types`를 실행 파일 조건보다
앞에 두고, 런타임·import/require 조건을 고려해 `default`를 마지막에 둡니다. ESM `.js`/`.d.ts`와
CJS `.cjs`/`.d.cts`는 함께 검증합니다. 소스의 `moduleResolution: bundler` 검사만으로 소비자
호환성을 판단하지 않고, `pack:check`의 packed ESM/CJS 실행과 `NodeNext` 타입 검사를 유지합니다.
[Node 조건부 exports](https://nodejs.org/api/packages.html#conditional-exports),
[TypeScript 번들 라이브러리 지침](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options#considerations-for-bundling-libraries)

## TypeScript·모듈

- strict TypeScript·ES2022 타겟을 유지하고 상대 소스 import에 `.js` 확장자를 사용합니다.
- 타입 전용 참조는 `import type` 또는 `type` 지정자를, 공개 옵션은 해당 진입점의 type export를 사용합니다.
- production 경계는 `unknown`으로 받아 검증하며 `any`를 사용하지 않습니다. 테스트의 `any` 허용은
  잘못된 런타임 입력을 검증하는 경우 등에 한정합니다.

서식의 기준은 [.prettierrc](.prettierrc)의 공백 2칸·큰따옴표·세미콜론·trailing comma·100열입니다.
ESLint는 [flat config](eslint.config.mjs)와 `--max-warnings=0`, 타입 검사는
[tsconfig-base.json](tsconfig-base.json)과 [tsconfig.test.json](tsconfig.test.json)을 따릅니다.

함수·변수는 camelCase, 클래스·타입은 PascalCase를 사용합니다. 파일명과 private 필드 표기는
주변 모듈의 관례를 따르며, 컨벤션 정리만을 위한 일괄 rename은 하지 않습니다. lint 예외가
필요하면 해당 위치에 이유를 남기고 설정 전체를 완화하지 않습니다.

## 함수 분리 기준

한 곳에서 쓰는 단순 조건·할당·객체 구성·변환·중계는 호출 함수 안에서 동기적으로 작성합니다.
`PayloadCodec`의 footer 구성처럼 지역 변수와 호출 순서로 읽히는 로직을 이름만 붙이기 위해
분리하지 않습니다. 줄 수만으로 분리·통합하지 않습니다.

분리는 실제 재사용, 복잡한 불변식의 독립 검증, 플랫폼·에러 경계가 있거나 중복을 줄이면서
제어 흐름이 단순해질 때 적용합니다. sync/async의 공유 설정·checksum 검증과 wire parser가 해당합니다.

미사용 내부 인자는 시그니처와 호출부에서 제거합니다. 공개 adapter의 미지원 옵션
(예: BrowserAdapter의 `_level`)처럼 호환성에 필요한 인자는 유지합니다.
`await`도 Promise 계약도 필요 없는 내부 callback은 동기로 작성하되, 공개 비동기 반환 타입,
하위 클래스 override, rejection을 감싸는 `try/catch`의 `return await`는 보존합니다.

## 옵션·상태 규칙

- `undefined`와 명시된 `""`·`[]`·`0`·`false`를 구분합니다. 기본값은 `??`로 합성하고
  boolean override를 명시적으로 처리합니다.
- 생성자 기본값과 호출별 옵션을 합성한 후 조합 불변식을 다시 검증합니다.
- 필터링, 중복 제거, padding 제거 등으로 데이터가 변하면 길이·bitLength·충돌을 재검증합니다.
- `throwOnError:false`는 무효한 상태를 인코더에 남기는 옵션이 아니라 유효한 preset으로
  fallback하는 옵션입니다.
- 비트 패킹, 버퍼 할당, 반복문 경계에는 생성자 검증과 별개의 방어 검증을 둡니다.

### 입력 소유권과 비동기 경계

| 대상                                         | 보존 시점과 방법                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 생성자 charset·coda·KDF salt·난독화 alphabet | 외부의 가변 배열을 내부 상태로 보관하기 전에 복사. `create()`는 adapter를 기다리기 전 보존           |
| 비동기 codec·stream 생성의 호출 옵션         | 지연 사용 전에 얕은 복사. 새 가변 중첩 필드를 추가하면 그 필드의 복사 계약도 정의                    |
| 외부 `Uint8Array`·`Buffer`                   | 압축·암호화로 await를 넘겨 쓰는 경로에서 첫 await 전에 독립 복사                                     |
| 문자열에서 내부 생성한 UTF-8 배열            | 이미 소유한 배열을 같은 파이프라인에 전달. `originalSize`는 변환 직후 기록                           |
| 스트림의 보관 청크·잔여 바이트               | `writer.write()` 완료 후 재사용 가능하도록 복사. 결합 후 원래 청크 참조를 해제하고 실패 시 상태 정리 |

`subarray()`와 `Buffer.slice()`는 독립 복사가 아닙니다. 반대로 동기 완료하는 평문 경로와 이미
내부에서 소유한 배열에는 무조건 복사를 추가하지 않습니다. 주입한 adapter·callback·난독화
구현은 참조 계약을 유지하며 범용 deep clone이나 JSON 직렬화를 적용하지 않습니다.

## Lazy adapter 규칙

- root의 adapter는 비동기 압축·암복호화 단계에서, Web Streams는 stream 메서드 호출에서만
  import합니다. 평문 codec·checksum·난독화 경로에 adapter를 정적으로 연결하지 않습니다.
- 현재 core에 adapter를 주입하며 첫 동시 호출은 초기화 Promise를 공유합니다.
- 디코딩의 알고리즘·버전은 wire metadata로 판별합니다. 호출별 처리 비활성화와 크기 제한은
  해당 공개 옵션의 계약에 따라 별도로 적용합니다.
- 사용자가 `adapter` 또는 `adapterFactory`를 주입하면 자동 adapter보다 우선합니다.
- `Ddu64.create()`는 별도 import 없이 adapter를 먼저 준비하는 명시적 eager 경로입니다.
  Node에서는 준비 후 동기 secure 호출을 허용하고 브라우저는 계속 비동기 호출만 지원합니다.

## Wire·문자열 불변식

- 인코딩 후처리의 footer → 난독화 → checksum suffix → URL-safe → 청크 분할 순서를 유지합니다.
- 디코딩은 사용자 구분자를 CR/LF 제거보다 먼저 처리하고, 선택 footer 마커와 실제 payload·padding
  경계를 함께 검증합니다. 숫자 패딩, 반복 패딩, 두 자리 paddingBits, 마커 충돌을 회귀 벡터에 포함합니다.
- V2/V3/V4의 처리 순서, V4의 AAD, legacy `CHK`와 scoped `CK` 의미를 임의로 통합하지 않습니다.
  잘못 추정한 선택 마커를 되돌릴 때 이미 확인한 암호화·버전 정보를 함께 버리지 않습니다.
- UTF-8 BOM을 보존하고 Unicode 정규화를 자동 적용하지 않습니다. 바이트 수와 `String.length`의
  UTF-16 코드 유닛 수를 구분하며, 통계·진행률의 기존 공개 단위는 [REFERENCE](docs/REFERENCE.md)를 따릅니다.
- 네이티브 Base64는 정확한 표준 alphabet·패딩 조건에서만 선택합니다. 기능 존재 여부를 확인하고
  JS fallback을 유지하며, 네이티브 decoder의 관대한 입력 허용으로 기존 검증을 우회하지 않습니다.

## 에러 계약

- `Ddu64` codec 공개 경계는 실패 시 `Ddu64Error` 하위 타입만 throw/reject합니다.
  `CharsetBuilder` 및 저수준 adapter 직접 호출은 각 API의 기존 오류 타입을 유지합니다.
- 내부 모듈은 가능하면 발생 지점에서 charset, encode, decode, adapter, limit 에러를 분류합니다.
- 사용자 callback·플랫폼 API의 plain `Error`는 원인을 보존해 래핑하고, `Ddu64Error`는 중복 래핑하지 않습니다.
- 에러 문구에는 작업과 해결 경로를 포함하고 비밀키·평문·전체 payload를 포함하지 않습니다.
- AES-GCM 복호화 결과는 인증 검증이 끝난 후 반환합니다. `maxEncodedChars` 검사는 문자열
  전처리 전에, decode·압축 해제·스트림 축적 한도 검사는 큰 할당이나 결합 전에 수행합니다.

## 주석·문서

- 주석은 불변식·wire 호환성·보안 경계·성능 근거를 설명합니다. 코드 반복, 완료된 Task 번호,
  리팩터링 과정 기록은 제거합니다.
- 난독화를 암호화, 무작위화, 자연어 생성으로 표현하지 않습니다.
- 구현 변경이 영향을 주는 JSDoc·예제·공개 계약을 같은 변경에서 갱신합니다. 내부 정리만으로
  모든 문서를 고치거나 CHANGELOG 항목을 만들지는 않습니다.
- 예제의 encode/decode 옵션은 서로 맞추고, 동작을 바꾼 예제는 실제 공개 진입점에서 실행합니다.
- 사용자 관점의 변경은 CHANGELOG, 구조 선택의 이유와 재검토 조건은 DECISIONS에 기록합니다.

## 테스트·데드코드

- 테스트와 fixture는 `test/`, `test/fixtures/`에 둡니다. 결함 수정에는 기존 테스트 보완 또는
  새 최소 회귀 테스트로 수정 전 실패를 재현합니다.
- 반복 라운드트립보다 경계값·불변식·호환 벡터를 우선하고, 넓은 입력 공간은 property test로 검증합니다.
  기존 wire fixture는 이유 없이 재생성하지 않습니다.
- 비정상 종료 위험은 유효한 상태로 진입하지 못하게 테스트하고, 필요하면 자식 프로세스
  timeout으로 검증합니다.
- 테스트 이름·주석은 현재 용어를 사용하며 제거된 내부 구현의 부재만 검사하지 않습니다.
- `pnpm knip`과 필요 시 `pnpm exec knip --production`으로 내부 미사용 경로를 확인합니다.
  결과는 삭제 후보이지 공개 API 미사용의 증거가 아닙니다. `exports`, 동적 import, 스크립트·브라우저
  진입점, 하위 클래스 override를 대조한 뒤 정리합니다. 누락된 entry는 `knip.json`에서 보완합니다.
  [Knip production mode](https://knip.dev/features/production-mode),
  [진단 해석](https://knip.dev/guides/handling-issues)
- 구버전 decoder·공개 deprecated API·독립 BitPack 동치 오라클·방어 검증은 단순 참조 수나 낮은
  커버리지만으로 삭제하지 않습니다. 헬퍼를 통합하면 전용 타입·인자·import·주석도 함께 정리합니다.

## 변경별 검증

| 변경                                     | 작업 중 확인                                      | 마무리 검증                                                     |
| ---------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| 설명·링크만 수정                         | 코드·설정과 대조, 상대 링크·앵커·배포물 포함 여부 | `pnpm format:check`, `git diff --check`                         |
| 실행 예제 수정                           | 해당 예제를 실제 공개 진입점에서 실행             | 문서 검사, dist가 오래됐으면 먼저 `pnpm build`                  |
| codec·footer·옵션·소유권·에러            | 실패 재현, 관련 회귀·고정 벡터·property test      | `pnpm verify`                                                   |
| export·타입·lazy import·번들 설정        | ESM/CJS·NodeNext·정적 그래프·packed consumer      | `pnpm verify`, 웹 경로에 영향이 있으면 browser smoke            |
| BrowserAdapter·Web Streams·네이티브 경로 | 관련 테스트와 Node↔브라우저 호환                  | `pnpm verify`, `pnpm smoke:browser`                             |
| hot path·할당·크기                       | 동일 조건 전후 비교와 출력 동치성                 | `pnpm verify`, `pnpm bench:guard`, 해당 benchmark               |
| 의존성·런타임·배포                       | lockfile·설치 정책·exports·CI matrix 검토         | `pnpm verify`, 영향받는 런타임·브라우저 작업, 배포 전 성능 가드 |

표의 검사는 해당 변경을 마무리할 때 적용합니다. 한 줄을 수정할 때마다 전체 검사를 반복하지 않습니다.
작업 중에는 관련 검사로 실패를 좁히고, 코드·타입·빌드 변경은 마지막 수정 상태에서 `pnpm verify`로
마무리합니다. CI·릴리스의 필수 검증은 유지합니다.

footer 수정은 `pnpm exec vitest run test/wireFormat.test.ts test/regressions.test.ts`로 먼저 확인합니다.
문서 표현만 바꾸는 작업에는 전체 코드·성능·브라우저 검사나 새 회귀 테스트가 필요하지 않습니다.

`pnpm verify`는 format → typecheck → lint → Knip → build → coverage → size → pack → Node/web
smoke를 실행합니다. 실제 브라우저, Bun·Deno, Node 호환 matrix, 성능 가드는 별도 검사입니다.
새 변경·실패·미해결 우려가 있을 때만 검사를 확대·반복하며, 실행하지 않은 환경은 통과로 보고하지 않습니다.

lazy import 변경은 초기 정적 그래프의 구현 포함 여부를, 브라우저 경로 변경은 실제 엔진의
네이티브 기능·강제 fallback·Node 상호 호환을 확인합니다. 브라우저 검증이 필요한 경우:

```bash
pnpm exec playwright install chromium firefox webkit
pnpm build
pnpm smoke:browser
```

한 엔진은 `pnpm smoke:browser firefox`로 지정합니다. Linux CI는 설치에 `--with-deps`를 사용합니다.
Playwright를 갱신하면 해당 버전의 브라우저 바이너리도 다시 설치합니다.
[Playwright browser 설치](https://playwright.dev/docs/browsers)

## 성능·크기·안전성

- hot path의 전체 크기 임시 배열·복사·반복 lookup 생성을 줄일 때는 출력 동치성과 측정 근거를
  함께 제공합니다. 기준 커밋·런타임·입력·표본 수·측정 분모를 기록합니다.
- `pnpm bench`는 3표본 중앙값의 호출당 시간과 원문 바이트 기준 왕복 MiB/s를 표시합니다.
  일반 문자열 길이와 UTF-8 출력 크기를 구분하고, 직접 플랫폼 Base64·압축 가능한 텍스트·결정론적
  난수·이미 압축된 입력을 비교합니다. 첫 KDF 측정은 새 인스턴스 기준이며 재사용 비용과 구분하고
  프로세스 시작 비용은 포함하지 않습니다. `bench:guard`의 ASCII unpack만 인코딩 문자 수를 분모로 사용합니다.
- 문자열의 UTF-8 변환 포함 여부와 Web Streams의 미리 변환한 byte 입력을 구분합니다.
  footer처럼 짧은 suffix만 읽는 연산은 호출당 시간으로 비교합니다.
- 원문·압축·출력 바이트와 UTF-16 길이를 섞지 않습니다. 표본 노이즈 수준의 시간 차이를 속도 개선으로,
  복사 한 번 제거를 동일 크기의 최대 RSS 감소로 보고하지 않습니다.
- 스트림 입력 상한은 출력·작업 버퍼·동시 호출을 포함한 프로세스 메모리 상한이 아닙니다.
- 번들 크기는 진입점별 최소 경로, adapter 활성화 경로, 전체 lazy 그래프와 초기 정적 그래프를 구분합니다.
- 새 runtime dependency는 표준 API로 해결할 수 없고 크기·유지보수·공급망 비용을 정량화한 경우에만
  추가합니다.
- 난독화는 보안 경계가 아닙니다. 기밀성이 필요하면 AES-GCM과 충분한 entropy의 키를 사용합니다.
- 비밀번호를 키로 사용하면 PBKDF2, application-specific salt, 명시적 iteration을 사용합니다.
- 비밀 데이터와 공격자가 조절할 수 있는 입력을 같은 payload에서 압축 후 암호화하는 예제나
  권장 경로를 추가하지 않습니다. 길이 기반 정보 노출 가능성을 사용자 문서와 공개 타입에
  함께 명시합니다.
- `/secure`는 기능 묶음의 진입점이며 인증 프로토콜이나 키 관리 체계로 표현하지 않습니다.
- size-limit 변경 전 동일 lockfile과 지원 Node 버전에서 세 번 이상 측정합니다. 변동이 1% 이내면
  기존 예산을 유지하고, 도구 변동으로 지속 실패할 때만 3-5% 범위의 근거 있는 여유를 둡니다.

## 호환성·릴리스

- 의도된 공개 동작·출력 형식·기본 KDF·export를 깨는 변경은 major에서 수행합니다. 계약을 복원하는
  결함 수정도 기존 데이터·오류 동작에 미치는 영향을 확인하고 사용자에게 필요한 이행 내용을 기록합니다.
- 미사용 공개 API는 즉시 삭제하지 않고 `@deprecated`와 대체 경로를 먼저 제공합니다.
- 배포 전 `pnpm verify`, `pnpm bench:guard`, `pnpm smoke:browser`, 패키지 버전과 tag 일치를 확인합니다.
- npm 배포는 긴 수명의 write token 대신 GitHub Actions OIDC trusted publishing을 사용합니다.
- CHANGELOG의 `Unreleased`는 다음 배포 변경만 포함하고, 태그된 변경은 버전·날짜 섹션으로 이동합니다.
- npm package에는 실행 파일·타입과 사용자용 README/CHANGELOG/API reference/설계 결정만 포함합니다.
  `AGENTS.md`, `CONTRIBUTING.md`, 테스트, benchmark, source map은 저장소에만 둡니다.
- 최소 Node 버전, 기본 검증 LTS, 호환 matrix는 함께 검토합니다. Bun과 Deno는 root의 browser
  조건과 `/secure`의 Node 호환 조건을 각각 검증합니다.

Trusted Publisher의 owner/repository는 **실제 배포 workflow가 실행되는 GitHub 저장소**와
일치시킵니다. 현재 workflow는 `publish.yml`, environment는 `npm`이며 `npm publish`를 실행하므로,
외부 publisher 설정에서도 해당 작업을 허용해야 합니다.
저장소 이전 시 Git remote, `package.json`의 repository/homepage/bugs, 문서 링크, npm의 외부
Trusted Publisher 설정을 함께 확인합니다. URL redirect만으로 OIDC 설정이 갱신됐다고 판단하지 않습니다.

GitHub Release tag는 `v${package.json.version}`이어야 하며 workflow가 불일치 배포를 차단합니다.
최종 `npm publish --ignore-scripts`는 앞 단계에서 검증을 마친 배포 경로입니다. 이 옵션만 복사해
검증을 생략하지 않습니다. 배포 Node/npm은 [npm의 OIDC 요구 버전](https://docs.npmjs.com/trusted-publishers/)을
충족해야 하며, 패키지의 최소 실행 Node 버전과 별도로 관리합니다.

## 참고

- 최근 공식 자료와 이 프로젝트의 채택·보류 판단: [설계 검토](docs/DECISIONS.md#최근-공식-동향과-적용-판단)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- 에이전트 지침은 작업별 문서 선택과 완료 기준을 명시합니다. 모델별 세부 실행 순서를 강제하지 않는
  방향은 [OpenAI의 스킬·프롬프트 검토 지침](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)을
  참고했습니다. 프로젝트의 API·wire·검증 계약은 모델과 관계없이 유지합니다.
