# Contributing to ddunigma-node

이 문서는 `@ddunigma/node`의 코드, 테스트, 문서, 패키지 진입점을 변경할 때 따라야 할
프로젝트 컨벤션입니다. 현재 구조와 공개 API 호환성을 우선하며, 규칙이 충돌하면
정확성, 와이어 호환성, 경량성, 가독성 순으로 판단합니다.

## 핵심 원칙

- 코어는 커스텀 charset codec와 가역 난독화에 집중합니다.
- 압축·암호화는 플랫폼 어댑터를 통한 선택 기능입니다.
- runtime dependency 0개를 기본 제약으로 유지합니다.
- 공개 진입점·타입·실행 동작은 항상 같이 변경합니다.
- 출력 형식, charset 순서, footer, KDF 기본값 변경은 와이어 호환성 변경으로 취급합니다.
- 추상화는 실제 복잡도나 중복을 줄일 때만 추가합니다.

## 진입점 역할

| 진입점                   | 역할                                                                       | 정적 import 제약                                  |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------- |
| `@ddunigma/node`         | Node 기본 API. 동기 codec/checksum/난독화, 비동기 secure adapter lazy load | `node:crypto`, `node:zlib`, `NodeAdapter` 금지    |
| `@ddunigma/node/browser` | 브라우저 기본 API. 비동기 secure adapter lazy load                         | Node 내장 모듈, `BrowserAdapter` 정적 import 금지 |
| `@ddunigma/node/core`    | 플랫폼 독립 core. 필요한 구현은 사용자가 주입                              | 구체 adapter와 난독화 구현 import 금지            |
| `@ddunigma/node/secure`  | adapter, Web Streams, 동기 Node secure API를 포함한 전체 표면              | 조건부 export의 Node/browser 경계 유지            |

`package.json#exports`는 공개 API 계약입니다. 진입점을 추가하거나 제거할 때는 ESM, CJS,
browser, worker, types 조건과 pack smoke를 함께 갱신합니다. 조건은 구체적인 항목에서
`default`로 배치합니다.

## TypeScript·모듈

- strict TypeScript와 ES2022 번들 타겟을 유지합니다.
- 소스 import는 번들 후 경로와 맞도록 `.js` 확장자를 사용합니다.
- 공개 메서드가 받는 정확한 옵션 타입은 해당 진입점에서 다시 export합니다.
- production 코드의 `any`는 금지합니다. 외부 경계는 `unknown`으로 받고 검증합니다.
- 입력으로 받은 배열, typed array, 설정 객체를 지연 사용하면 생성 시점에 snapshot을 만듭니다.
- 공개 API 변경 시 `src/index.ts`, `src/browser.ts`, `src/core.ts`, secure 진입점과 `.d.ts`
  pack 검증을 모두 확인합니다.

## 함수 분리 기준

다음 내용은 별도 헬퍼로 빼지 않고 호출 함수 내에 동기적으로 작성합니다.

- 한 곳에서만 사용하는 단순 조건 판정, 필드 할당, 객체 구성
- 즉시 다음 줄의 메서드를 호출하는 단순 전달 함수
- 부수효과가 없고 5-10줄 내에서 자연스럽게 읽히는 변환
- 이름이 있어도 도메인 경계나 재사용 가치가 생기지 않는 코드

다음 경우에만 함수나 모듈로 분리합니다.

- 동기·비동기 파이프라인 등 두 곳 이상에서 실제로 공유
- 복잡한 불변식, wire parser, checksum, lookup table처럼 독립 테스트 가치가 있음
- 플랫폼 경계나 에러 분류 경계를 명확히 표현
- 반복 코드를 제거하면서도 인자 수와 제어 흐름이 더 단순해짐

헬퍼를 추가할 때는 이름만으로 역할이 드러나야 하며, 미사용 인자를 `_`로 숨겨
두지 않습니다. 인자가 필요 없으면 시그니처와 호출부에서 제거합니다.

## 옵션·상태 규칙

- `undefined`는 미지정, `""`·`[]`·`0`·`false`는 사용자가 명시한 값입니다. truthy 검사로
  둘을 합치지 않습니다.
- 기본값 합성은 우선 `??`를 사용하고, boolean override는 명시적으로 처리합니다.
- 생성자 기본값과 호출별 옵션을 합성한 후 조합 불변식을 다시 검증합니다.
- 필터링, 중복 제거, padding 제거 등으로 데이터가 변하면 길이·bitLength·충돌을 재검증합니다.
- `throwOnError:false`는 무효한 상태를 인코더에 남기는 옵션이 아니라 유효한 preset으로
  fallback하는 옵션입니다.
- 비트 패킹, 버퍼 할당, 반복문 경계에는 생성자 검증과 별개의 방어 검증을 둡니다.

## Lazy adapter 규칙

- root의 평문 codec, checksum, 난독화 호출은 adapter chunk를 불러오지 않습니다.
- 비동기 압축·암복호화 파이프라인이 해당 단계에 도달했을 때만 adapter를 import합니다.
- lazy 활성화는 별도 core 인스턴스를 만들지 않고 현재 인스턴스에 adapter만 주입합니다.
- 첫 동시 호출은 Promise를 캐시해 import와 adapter 생성을 한 번만 수행합니다.
- 디코딩은 호출 옵션보다 wire metadata를 권위 있는 정보로 사용합니다.
- 사용자가 `adapter` 또는 `adapterFactory`를 주입하면 자동 adapter보다 우선합니다.

## 에러 계약

- 모든 공개 API는 실패 시 `Ddu64Error` 하위 타입만 throw/reject합니다.
- 내부 모듈은 가능하면 발생 지점에서 charset, encode, decode, adapter, limit 에러를 분류합니다.
- 사용자 callback과 플랫폼 API의 plain `Error`는 공개 경계에서 원인을 보존해 래핑합니다.
- 이미 `Ddu64Error`인 오류는 중복 래핑하지 않습니다.
- 에러 문구에는 작업과 해결 경로를 포함하고 비밀키·평문·전체 payload를 포함하지 않습니다.

## 주석·문서

- 주석은 코드가 보여주지 못하는 불변식, wire 호환성, 보안 경계, 성능 근거를 설명합니다.
- 코드를 그대로 반복하는 주석, 완료된 Task/요구사항 번호, 리팩터링 과정 기록은 남기지 않습니다.
- 난독화를 암호화, 무작위화, 자연어 생성으로 표현하지 않습니다.
- README는 첫 사용과 안전한 기본 경로, REFERENCE는 전체 계약, CHANGELOG는 사용자 관점의
  변경을 담당합니다.
- 구현이 바뀌면 같은 변경에서 JSDoc, README, REFERENCE, CHANGELOG을 갱신합니다.

## 테스트

- 모든 테스트와 fixture는 각각 `test/`, `test/fixtures/`에 둡니다. `src/`에는 배포 대상
  소스만 유지합니다.
- 결함 수정은 수정 전에 실패하는 최소 회귀 테스트를 포함합니다.
- 단순 라운드트립을 파일별로 반복하지 않고 경계값, 불변식, 호환 벡터를 우선합니다.
- 사용자 입력 공간이 넓은 codec은 property test로 라운드트립·길이·에러 타입을 검증합니다.
- 와이어 호환성은 fixture/vector를 유지하고 이유 없이 재생성하지 않습니다.
- 진입점 변경은 소스 테스트와 packed ESM/CJS/browser smoke를 모두 추가합니다.
- 비정상 종료 위험은 유효한 상태로 진입하지 못하게 테스트하고, 필요하면 자식 프로세스
  timeout으로 검증합니다.
- 테스트 제목과 주석은 현재 구현 용어를 사용하고 제거된 API의 부재를 계속 테스트하지 않습니다.

## 성능·크기·안전성

- hot path에서 전체 크기 임시 배열, 불필요한 문자열 복사, 반복 lookup 객체 생성을 피합니다.
- 최적화는 benchmark 수치와 동치성 테스트를 함께 제공해야 합니다.
- 모든 디코딩·압축 해제·스트림 버퍼는 명시적 크기 상한을 유지합니다.
- 크기 제한은 각 진입점의 최소 사용 경로와 adapter 활성화 경로를 따로 검증합니다.
- 새 runtime dependency는 표준 API로 해결할 수 없고 크기·유지보수·공급망 비용을 정량화한 경우에만
  추가합니다.
- 난독화는 보안 경계가 아닙니다. 기밀성이 필요하면 AES-GCM과 충분한 entropy의 키를 사용합니다.
- 비밀번호를 키로 사용하면 PBKDF2, application-specific salt, 명시적 iteration을 사용합니다.

## 호환성·릴리스

- 기능 제거, 출력 변경, 기본 KDF 변경, export 제거는 major 버전에서만 수행합니다.
- 미사용 공개 API는 즉시 삭제하지 않고 `@deprecated`와 대체 경로를 먼저 제공합니다.
- 배포 전 `pnpm verify`, `pnpm bench:guard`, 패키지 버전과 tag 일치를 확인합니다.
- `pnpm verify`는 typecheck, lint, format, dead-code, build, coverage, size, pack, runtime smoke를 모두 포함합니다.
- npm 배포는 긴 수명의 write token 대신 GitHub Actions OIDC trusted publishing을 사용합니다.
- CHANGELOG의 `Unreleased`는 다음 배포 변경만 포함하고, 태그된 변경은 버전·날짜 섹션으로 이동합니다.

npm package 설정의 Trusted Publisher는 GitHub 저장소 `parkjh2568/ddunigma-node`, workflow
`publish.yml`, environment `npm`, 허용 작업 `npm publish`와 정확히 일치시킵니다. GitHub Release
tag는 `v${package.json.version}` 형식이어야 하며 workflow가 불일치 배포를 차단합니다.

## 참고

- [Node.js package exports and conditional exports](https://nodejs.org/api/packages.html)
- [TypeScript modules reference](https://www.typescriptlang.org/docs/handbook/modules/reference)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
