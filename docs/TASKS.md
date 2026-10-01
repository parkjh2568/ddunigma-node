# 호환성 유지·간편 API·최적화 실행 태스크

작성일: 2026-09-22. 기준: `f4eef3d`, `package.json` 6.2.0, 로컬 태그 `v6.2.0`.
이 문서는 6.2.0 기준 계획과 6.3.0 작업 결과를 함께 관리한다. 현재 작업 트리는 미배포 상태다.
코드 규칙은 [CONTRIBUTING](../CONTRIBUTING.md), 현재 공개 계약은 [REFERENCE](REFERENCE.md),
기존 선택과 보류 이유는 [DECISIONS](DECISIONS.md)를 따른다.

후속 [오류·예외 전수 점검](ERROR_AUDIT.md)에서 추가 수정 항목을 확인했다.
기능 검증 완료 기록은 보존하되 E01/E02를 포함한 오류 보완(T13)을 출시 선행 조건에 추가한다.

## 목표와 변경 경계

한 번 설정한 객체에서 기능·런타임에 따라 메서드를 고르지 않고 `encode()`·`decode()`로
작업하도록 한다. 동시에 기존 `Ddu64` 사용 코드와 저장된 데이터의 호환성을 유지한다.

이번 계획의 기본안은 **기존 API 보존 + 항상 Promise를 반환하는 간편 API 추가**다.
계획에 따른 구현 요청을 받아 Node·브라우저 공통 Promise API로 확정했다.
즉시 동기 반환이 필요한 기존 소비자는 기존 `Ddu64`를 계속 사용한다.
Node 전용으로 생성 시 한 번 await할 수 있는 사용자는 현재 `Ddu64.create()`도 계속 사용할 수 있다.

| 보존할 계약 | 변경하지 않을 내용                                                                    |
| ----------- | ------------------------------------------------------------------------------------- |
| 공개 API    | `new Ddu64()`, `Ddu64.create()`, 기존 동기·Async 메서드와 반환 타입, 위치 인자 생성자 |
| 진입점·타입 | root/browser/core/secure, ESM/CJS, 기존 타입 export와 조건부 런타임 선택              |
| 저장 데이터 | charset 순서·padding·V1 프로필·V2/V3/V4·CHK/CK·AAD·DDS1·URL-safe 규칙                 |
| 보안·자원   | KDF 기본값·salt 의미, 인증 후 결과 반환, decode·압축 해제·축적 한도                   |
| 확장·상태   | 주입 adapter·factory·난독화 구현, 하위 클래스 override, 입력·옵션 보존                |
| 운영        | runtime dependency 0개, 최소 Node 22, 기존 CI·성능·크기 예산                          |

기존 `encode(): string`을 `Promise<string>`으로 교체하거나 실행 환경에 따라 반환 타입을 바꾸지
않는다. 새 API는 별도 named export로 추가하므로 기존 import는 그대로 동작한다. 신규 기능은
6.x minor 범위에서 검토할 수 있으며, 기존 클래스의 기본 계약 변경은 별도의 major 계획이다.
[SemVer](https://semver.org/spec/v2.0.0.html#spec-item-7)

새 wire format, KDF envelope, DDS2, 자동 Unicode 정규화, 암호화 실패 시 평문 fallback, 사용자 데이터의
암묵적 JSON 변환은 범위에 포함하지 않는다. 지원하지 않는 알고리즘이나 잘못된 키는 기존
오류 계약으로 알리고 보호 기능을 조용히 생략하지 않는다.

## 조사 결과와 적용할 기술

2026-09-22 공식 자료를 확인했다. 표준화·문서화된 기능과 현재 지원 런타임에서 사용 가능한
기능을 구별한다. 최신 Node 문서에만 있는 API로 최소 지원 버전을 높이지 않는다.

| 공식 근거                                                                                                                                                                                                                     | 기술과 이점                                                  | 적용 조건·관련 태스크                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [TC39 Base64](https://github.com/tc39/proposal-arraybuffer-base64), [연산 규격](https://tc39.es/proposal-arraybuffer-base64/spec/)                                                                                            | Stage 4 typed-array Base64, 기존 배열에 쓰는 `setFromBase64` | 표준 alphabet에서만 기능 탐지. 기존 strict 검증·fallback 보존, T09에서 할당 이득 평가        |
| [W3C Web Crypto](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/#subtlecrypto-interface)                                                                                                                                | 암호 연산의 Promise 계약과 키 import                         | T04의 공통 Promise API 근거. T10의 키 재사용은 별도 계약·측정 필요                           |
| [WHATWG Compression](https://compression.spec.whatwg.org/#supported-formats)                                                                                                                                                  | native deflate-raw·brotli 등과 TransformStream 인터페이스    | T05에서 엔진별 압축·압축 해제 지원을 각각 확인. API 존재만으로 알고리즘 지원을 가정하지 않음 |
| [WHATWG Encoding](https://encoding.spec.whatwg.org/#dom-textencoder-encodeinto)                                                                                                                                               | `encodeInto`로 기존 목적지에 UTF-8 기록                      | T09에서 이미 확보한 목적지 버퍼가 있을 때 평가. 과도한 선할당·잔여 공간 복사가 더 크면 보류  |
| [Node perf_hooks](https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions)                                                                                                                              | event loop 지연·utilization·호출 지연 계측                   | T06에서 처리량과 응답성을 구분. 지원 Node 공통 API 사용, ns/ms 단위 명시                     |
| [Node Worker](https://nodejs.org/api/worker_threads.html#considerations-when-transferring-typedarrays-and-buffers)                                                                                                            | CPU 작업 분리, pool·메시지 전달·transfer                     | T11 조건부 조사. 호출마다 Worker 생성 금지, 호출자 Buffer를 몰래 detach하지 않음             |
| [Node exports](https://nodejs.org/api/packages.html#conditional-exports), [TypeScript 번들 지침](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options#considerations-for-bundling-libraries) | 런타임 조건부 export와 소비자 선언 파일 검증                 | T04/T05에서 새 named export도 packed ESM/CJS·NodeNext로 확인                                 |
| [OWASP PBKDF2](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2), [npm OIDC](https://docs.npmjs.com/trusted-publishers/)                                                               | 명시적 키 파생 설정과 짧은 수명의 배포 인증                  | T03에서 문서·외부 identity 정합성 확인. 기존 KDF 기본값을 일괄 교체하지 않음                 |

OWASP의 PBKDF2-HMAC-SHA256 600,000회 권고는 비밀번호 저장 지침이다. 이를 이 codec의 보안
인증으로 해석하지 않으며, 현재 KDF metadata가 없는 기존 암호문의 파생 설정을 변경하지 않는다.

## 기준 상태와 계획 API

앞선 2026-09-22 검토에서 확인한 결과다. 이후 구현의 검증 결과로 재사용하거나 완료 체크하지 않는다.

- Node 24.21.0에서 `pnpm verify`: 29개 파일·1,115개 테스트와 lint·타입·Knip·번들·pack 검사 통과.
- Chromium 153.0.8010.12 / Firefox 155.0 / WebKit 26.6 smoke 및 성능 가드 6개 통과.
- 일반 async encode의 8MiB 입력은 Promise를 반환하기 전 약 70.6ms 사용(3회 중앙값).
  전체 플랫폼의 보장값이나 최적화 목표값으로 사용하지 않는다.
- 기존 root의 lazy 활성화 뒤 sync encode/decode 동작이 비대칭이고, Browser 오류에는 동기
  문제를 해결하지 못하는 `/secure` 안내가 있다.
- `test/detect.test.ts`의 adapter 성공 테스트는 실제 `getAdapter()`를 호출하지 않는다.
- production Knip에서 미사용 항목은 발견되지 않았다. 공개 deprecated API·구버전 decoder·독립
  검증 오라클을 내부 참조가 적다는 이유로 삭제할 근거는 없다.
- package/tag는 6.2.0이나 CHANGELOG는 해당 변경을 Unreleased로 표시한다. 원격 저장소와
  패키지 metadata의 owner도 다르며 외부 npm publisher 설정은 아직 확인하지 않았다.

확정한 API는 `createDdu`다. 아래 예제는 6.3.0 작업 트리에서 검증했으며 아직 npm에 배포하지 않았다.

```js
const { createDdu } = require("@ddunigma/node");

async function main() {
  const ddu = createDdu({ compress: true, obfuscate: true });
  const encoded = await ddu.encode("안녕하세요");
  const decoded = await ddu.decode(encoded);
  console.log(decoded);
}

main().catch(console.error);
```

객체 생성은 동기로 하고 adapter는 첫 필요 연산에서 로딩한다. 옵션은 생성 시 고정하며,
기본 사용 흐름에서 encode와 decode에 같은 설정을 반복하게 하지 않는다. 호출별 옵션을
객체에 자동 저장하지 않는다. 기존 `Ddu64`의 호출별 override 계약은 유지한다.

기본 decode 결과는 UTF-8 문자열이다. `output: "bytes"`로 생성하면 decode는 Uint8Array를
반환한다. 문자열·바이트를 입력 내용으로 추측하지 않으며, 기존 byte/Buffer 메서드도 유지한다.
타입과 오류 계약은 [REFERENCE](REFERENCE.md#간편-api)를 따른다.

## 작업 순서와 상태

우선순위는 제품 관점의 중요도이며 보안 취약점 등급이 아니다. 실행은 선행 조건을 따른다.
상태는 미착수·진행·완료·보류·외부 확인 대기로 관리한다. 조건부 실험은 이득이 없거나
계약 비용을 정당화하지 못하면 보류하고 출시 필수 항목에 포함하지 않는다. 보류는 채택·구현
완료를 뜻하지 않는다. 외부 계정·실제 배포 확인은 로컬 검증과 구분한다.

| ID  | 우선순위 | 작업                                 | 선행 조건                          | 상태           |
| --- | -------- | ------------------------------------ | ---------------------------------- | -------------- |
| T01 | P1       | 호환성 기준·새 API 계약 확정         | 없음                               | 완료           |
| T02 | P2       | 잘못된 안내·테스트·중복 분기 정리    | 없음                               | 완료           |
| T03 | P2       | 릴리스·저장소·보안 설정 문서 정합성  | 없음                               | 외부 확인 대기 |
| T04 | P1       | 간편 API 추가                        | T01                                | 완료           |
| T05 | P1       | 배포물·런타임·사용 예제 검증         | T04                                | 완료           |
| T06 | P2       | 대표 입력·응답성·메모리 기준 측정    | T01                                | 완료           |
| T07 | P2       | 역난독화 임시 할당 개선              | T06, 큰 입력 이득 확인             | 완료           |
| T08 | P2       | 스트림 중복 복사 개선 가능성 검토    | T06, override·소유권 보존          | 보류           |
| T09 | P3       | native Base64·UTF-8 목적지 기록 실험 | T06, 대상 병목 확인                | 보류           |
| T10 | P3       | Browser CryptoKey 재사용 실험        | T06, importKey 비용 확인           | 보류           |
| T11 | P3       | 큰 입력 작업 분할·Worker 비교        | T06, 실제 지연 목표 미달           | 보류           |
| T12 | P1       | 출시 검증·변경 기록·이행 안내        | T02·T03·T05·T06·T13, 채택한 최적화 | 진행           |
| T13 | P1       | 후속 오류·예외 계약 보완             | 오류 전수 점검 E01~E09             | 완료           |

기존 실행 순서는 T01 → T02/T03 → T04 → T05/T06 → 채택할 실험이다.
후속 점검에서 추가된 T13과 외부 확인을 마친 뒤 T12를 완료한다. 이 의존 관계는
검증과 변경을 작은 단위로 유지하기 위한 것이며, 불필요한 일반화나 별도 관리 프레임워크를
도입하지 않는다. production 로직은 기존 책임 위치에서 먼저 해결하고 단일 동기 로직은 인라인으로 둔다.

## 태스크 상세

### T01 — 호환성 기준과 새 API 계약 확정

- **목적:** 기존 사용자 변경 없이 새 사용 흐름을 추가할 경계를 고정한다.
- **범위:** `src/index.ts`, `src/browser.ts`, `src/core/types.ts`, `src/Ddu64*.ts`,
  `test/option-types.test.ts`, `test/fixtures/`, `docs/REFERENCE.md`.
- [x] 커스텀 문자 표현·기존 저장 데이터 호환이라는 실제 사용 목적과 대표 입력·호출 환경을
      기록한다. 범용 Base64만 필요한 경우까지 기능을 확장하지 않는다.
- [x] 기존 생성자·메서드·public type·export를 목록화하고 6.2.0 소비자 기준을 보관한다.
      비교 대상 구버전은 버전·태그/커밋·배포물 해시로 고정하고 기존 legacy fixture도 유지한다.
- [x] `createDdu` 한 생성 경로, 항상 Promise인 encode/decode, 객체 생성 오류와 연산 rejection,
      설정 snapshot·callback·난독화·adapter 주입의 지원 범위를 확정한다.
- [x] 문자열과 바이너리의 반환 계약을 결정한다. 두 출력 모드를 제공한다면 생성 시 명시하고
      타입도 고정한다. 기존 byte API는 변경하지 않는다.
- [x] 객체별 정책을 고정하고 서로 다른 옵션의 동시 호출이 상태를 덮어쓰지 않도록 한다.
- [x] 아래 호환성 표를 기준으로 누락된 최소 회귀 검사를 식별한다.
- **완료 조건:** 지원 타입·메서드·오류·옵션 범위가 하나의 설계로 설명되고, 기존 소비자는
  수정 없이 사용 가능하다. API 가칭을 확정하면 문서와 타입에서 하나의 이름만 사용한다.
- **검증:** 기존 fixture와 타입·entry 검사를 대조한다. 이미 있는 검사를 이름만 바꿔 중복 생성하지 않는다.

### T02 — 오류 안내·검증 공백·단순 중복 정리

- **범위:** [브라우저 가드](../src/Ddu64Browser.ts), [adapter 테스트](../test/detect.test.ts),
  [charset 해석](../src/core/CharsetResolver.ts).
- [x] 브라우저 동기 압축·암호화 오류에서 해결되지 않는 `/secure` 전환 안내를 수정한다.
      오류의 타입·code·operation·cause는 유지한다.
- [x] `getAdapter()` 성공 테스트가 실제 adapter를 받아 runtime과 기본 동작을 확인하도록 수정한다.
      “NodeAdapter가 아직 없을 수 있다”는 완료된 작업 주석을 제거한다.
- [x] 양쪽이 같은 charset spread 조건식을 `let arr = [...finalDduChar]`로 단순화한다.
- [x] 변경 범위의 주석·단일 중계 함수·미사용 타입/import를 점검한다. 실제 중복만 인라인화하고
      공개 API·동적 import·override와 공유 검증은 유지한다. 근거 없는 일괄 삭제는 하지 않는다.
- **완료 조건:** 원인·해결 안내가 실제 실행 결과와 맞고 성공 테스트가 대상 함수를 호출한다.
  기존 Node 동기 가드나 초기화 정책을 이번 정리에서 변경하지 않는다.
- **검증:** 관련 회귀 테스트 후 `pnpm verify`; 웹 안내 경로는 기존 browser smoke도 확인한다.

### T03 — 릴리스·저장소·설정 문서 정합성

- **범위:** `CHANGELOG.md`, `README.md`, `docs/DECISIONS.md`, `docs/REFERENCE.md`,
  `package.json`의 repository/homepage/bugs, `.github/workflows/publish.yml`.
- [x] 실제 6.2.0 릴리스 상태를 확인하고 태그에 포함된 변경과 아직 배포하지 않은 변경을 분리한다.
      DECISIONS의 과거 검증 기록을 현재 상태 설명과 구분한다.
- [x] GitHub API의 redirect·canonical repository와 npm metadata를 대조했다. 두 주소 모두
      `parkjh2568/ddunigma-node`를 가리키며 fork가 아니다. 기존 공개 링크·metadata를 유지한다.
- [ ] 외부 Trusted Publisher의 repository/workflow/environment와 GitHub environment 권한을
      실제 계정 설정에서 대조한다. 공개 API만으로 확인할 수 없어 출시 전 확인으로 남긴다.
- [x] KDF 210,000회·고정 fallback salt의 호환 목적과 새 데이터의 명시적 설정을 설명한다.
      README 예제의 키·salt 준비 책임과 압축 후 암호화의 입력 경계 설명을 유지한다.
- **완료 조건:** 현재 버전·변경 이력·공개 링크가 일치한다. 외부 설정에 접근할 수 없으면
  미확인 상태와 출시 전 필요한 확인을 기록하며 완료로 처리하지 않는다.
- **검증:** 링크·태그·설정 대조. 문서만 바꾸면 format/diff 검사, package나 workflow를 바꾸면
  `pnpm verify`와 관련 배포물 검사를 적용한다. 실제 배포는 이 태스크의 검사 단계에 포함하지 않는다.

### T04 — 기존 core를 사용하는 간편 API 추가

- **선행:** T01. **범위:** root/browser entry, 간편 객체의 최소 구현, 공개 타입, entry·옵션 테스트.
- [x] root와 `/browser`에 같은 named factory·타입을 추가하고 기존 `Ddu64` export를 그대로 둔다.
- [x] 기존 `encodeAsync`·`decodeAsync` 파이프라인을 재사용한다. sync core를 상속해 반환형만
      바꾸거나 인스턴스 메서드를 실행 중 교체하지 않는다.
- [x] 평문·압축·암호화·checksum·난독화에서 항상 동일한 메서드명과 Promise 반환을 보장한다.
- [x] 입력·설정 보존을 첫 비동기 대기 전에 수행한다. factory wrapper에서 먼저 await한 뒤
      기존 codec에 전달하여 snapshot 시점을 늦추지 않는다.
- [x] 첫 동시 호출의 adapter·KDF 초기화 공유와 실패 후 재시도, 두 인스턴스의 상태 격리를 검증한다.
- **완료 조건:** 대표 기능 조합에서 import·생성·호출 패턴이 동일하다. 호출자는 adapter/secure/
  sync/async를 분기하지 않는다. 기존 클래스·override·wire 데이터에는 변화가 없다.
- **검증:** T01 호환성 표, 병렬 호출·버퍼 변경·ArrayBuffer transfer·오류 callback 회귀와
  `pnpm verify`. 실제 웹과 packed 소비자 검증은 T05에서 완성한다.

### T05 — 패키지 소비자·브라우저·사용 예제 검증

- **선행:** T04. **범위:** `scripts/verify-pack.mjs`, `scripts/runtime-*.mjs`,
  `test/browser-smoke.mjs`, `test/bundle-isolation.test.ts`, `.size-limit.js`,
  `scripts/verify-initial-bundle-size.mjs`, 사용자 문서.
- [x] packed ESM/CJS 및 NodeNext 타입 소비자가 새 factory와 기존 API를 함께 사용하도록 확인한다.
- [x] 기존 크기 검사가 `{ Ddu64 }`만 import한다는 점을 반영해 새 factory 사용 경로도 측정한다.
      기존 예산은 유지하고 신규 경로는 실제 최소·전체 그래프를 측정해 별도 예산을 기록한다.
- [x] root의 browser 조건, 명시적 `/browser`, Bun·Deno 조건을 유지한다. 평문 경로는
      adapter·streams를 초기 정적 그래프에 포함하지 않는다.
- [x] 실제 Chromium·Firefox·WebKit에서 같은 생성법·두 메서드로 기능 조합을 확인한다.
      deflate-raw·brotli의 압축/해제 지원을 따로 기록하고, 미지원 경로는 정해진 오류를 검증한다.
- [x] native Base64와 강제 fallback을 모두 검사한다. 신규 native 경로가 있으면 그것도 강제로 끈다.
- [x] README 첫 예제는 새 간편 경로 하나를 보여주고, 기존 API는 호환·고급 절에서 설명한다.
      실제 동작하는 CommonJS/ESM 예제를 실행하며 아직 미구현인 예제와 혼합하지 않는다.
- **완료 조건:** 기존 소비자 수정이 없고 새 API가 모든 지원 조건에서 일관된다. 문서에 해당
  기능의 최초 배포 버전을 표시하며 API 추가가 단순화 효과를 상쇄하는 선택지를 늘리지 않는다.
- **검증:** `pnpm verify`, `pnpm smoke:browser`, 기존 Node 22/24/26·Bun·Deno CI matrix.

### T06 — 실제 입력을 반영한 지연·메모리 기준 측정

- **선행:** T01. **범위:** 기존 `benchmarks/` 확장, 필요한 최소 계측 스크립트, 측정 결과.
- [x] 텍스트/BMP·비BMP/BOM, byte 입력, 압축 가능한 데이터·결정론적 난수·이미 압축된 입력을 준비한다.
      시작 크기는 64B·1KiB·16KiB·1MiB·8MiB, 동시 호출은 1·4·16으로 두되 실제 사용 분포로 조정한다.
- [x] cold import·첫 KDF·재사용 인스턴스를 분리한다. 기존 API와 간편 API의 추가 호출 비용도 비교한다.
- [x] 호출 반환까지 시간, 완료까지 시간, 처리량, p50/p95, event loop 지연, heap/external/
      arrayBuffers/RSS를 구분한다. `arrayBuffers`를 `external`에 다시 더하지 않고 관찰 peak의 한계를 적는다.
- [x] 지원 Node 공통 `monitorEventLoopDelay`·utilization을 사용하고 충분한 반복과 이벤트 루프
      관측 시간을 확보한다. 3개 표본으로 p95를 대표하거나 서로 다른 계측 모드를 직접 비교하지 않는다.
- [x] 기기·OS·런타임·커밋·lockfile·표본·분모를 기록하고 결과를 소비한다. 전후 측정은 같은
      환경에서 교대 실행하며 다른 CPU 부하 작업과 동시에 측정하지 않는다.
- **완료 조건:** 실제 지연·메모리 목표와 각 후보의 채택 판단 기준이 수치로 기록된다.
  목표가 없으면 관측 결과와 미정 사항을 남기며 임의의 성능 보장을 만들지 않는다.
- **검증:** 같은 설정의 출력 동치성, 원시 표본, `pnpm bench:guard`. 이후 T07~T11은 이 결과로 선택한다.

### T07 — 역난독화의 전체 길이 배열 줄이기

- **선행:** T06에서 메모리/시간 이득이 예상될 때. **범위:** `src/obfuscation/ObfuscationLayer.ts`와 관련 검사.
- [x] `deobfuscate`의 `new Array<string>(input.length)` 대신 제한된 크기의 버퍼·배치 결합을 비교한다.
      한 번 사용하는 루프·분기·버퍼 구성은 기존 함수 안에 둔다.
- [x] 공개 alphabet이 여러 코드 유닛의 문자열을 포함할 수 있음을 고려한다. 단일 코드 유닛
      버퍼를 모든 사용자 alphabet에 적용하지 않고 기존 문자열 길이·오류 위치를 보존한다.
- **완료 조건:** 기존 벡터·custom alphabet·빈 입력·배치 경계의 동치성이 유지되고,
  대표 크기에서 개선이 재현된다. 이득이 불분명하면 근거와 함께 보류한다.
- **검증:** obfuscation/property/호환 테스트, 해당 micro benchmark, `pnpm verify`, `pnpm bench:guard`.

### T08 — 스트림 중복 복사와 소유권 검토

- **실행 결과:** 조사 후 production 도입을 보류했다. 이유와 측정 범위는 아래 실행 기록에 남겼다.

- **선행:** T06. **범위:** `src/streams/WebStreams.ts`, `src/core/pipeline/EncodePipeline.ts`, stream·입력 보존 검사.
- [ ] 보관 청크 → combined → async snapshot에서 살아 있는 버퍼와 복사 바이트를 계측한다.
- [ ] 내부 소유 버퍼임을 보장할 수 있는 경로만 검토한다. public `encodeAsync` override를
      우회하거나 외부 byte 입력의 snapshot을 삭제하는 방식은 채택하지 않는다.
- [ ] writer 완료 후 Buffer 재사용, subarray, 오류·취소 시 참조 해제, 크기 제한의 검사 순서를 확인한다.
- **완료 조건:** 메모리 절감과 override·입력 보존을 함께 입증한다. 이를 위해 범용 ownership
  프레임워크나 공개 플래그가 필요해지는 경우 복잡도 비용을 비교하고 보류할 수 있다.
- **검증:** WebStreams·입력 변조 회귀, 실제 browser smoke, 할당 계측, `pnpm verify`.
  DDS1 축적 처리를 상수 메모리 스트리밍으로 표현하지 않는다.

### T09 — native Base64·UTF-8 목적지 기록 실험

- **실행 결과:** 조사 후 production 도입을 보류했다. 이유와 측정 범위는 아래 실행 기록에 남겼다.

- **선행:** T06에서 해당 경로가 병목일 때. **범위:** `src/core/internal/NativeBase64FastPath.ts`,
  `src/core/codecUtils.ts`, 관련 benchmark.
- [ ] `setFromBase64`의 사전 할당 결과를 현재 `fromBase64`/Buffer/JS 경로와 비교한다.
      입력 유효성·canonical padding·출력 크기 검사를 먼저 유지하고 read/written과 독립 결과 버퍼를 확인한다.
- [ ] `encodeInto`는 이미 목적지가 있거나 총 할당을 줄일 수 있는 경우만 비교한다. 크기 계산을
      위한 추가 순회와 상한 선할당·최종 복사 비용을 포함한다.
- [ ] 기능이 없으면 기존 경로를 사용한다. 한글/커스텀 alphabet을 표준 Base64로 잘못 보내지 않는다.
      BOM·비BMP·불완전 surrogate·빈 입력의 기존 UTF-8 의미를 보존한다.
- **완료 조건:** 추가 검증·복사를 포함한 전체 경로에서 이득이 있고 fallback·출력·오류 계약이 같다.
  표준의 기본 `loose` 디코딩으로 라이브러리의 엄격한 검증을 대체하지 않는다.
- **검증:** native/fallback 동치·잘못된 입력·고정 벡터, 실제 엔진, micro benchmark와 전체 검증.

### T10 — WebCrypto 키 재사용의 이득과 계약 검토

- **실행 결과:** 조사 후 production 도입을 보류했다. 이유와 측정 범위는 아래 실행 기록에 남겼다.

- **선행:** T06에서 `importKey` 비용이 유의미할 때. **범위:** BrowserAdapter와 필요한 최소 내부 키 상태.
- [ ] 이미 있는 파생 키 캐시와 CryptoKey import 비용을 따로 측정한다.
- [ ] core가 소유한 불변 키의 재사용과 공개 adapter에 전달되는 가변 Uint8Array를 구분한다.
      같은 배열의 값 변경을 무시하는 참조 기반 캐시나 비밀키 문자열을 쌓는 무제한 전역 캐시는 쓰지 않는다.
- [ ] 키 사용 목적·동시 최초 호출·실패 후 재시도·인스턴스 간 격리·키 보관 수명과 상한을 정의한다.
- **완료 조건:** 키 변경 반영·AAD·인증 실패·cross-runtime 복호화가 동일하고 이득이 입증된다.
  KDF 알고리즘·기본 반복·salt·IV·tag·wire format은 변경하지 않는다.
- **검증:** adapter 및 암호화 호환 벡터, mutation/concurrency 회귀, 실제 브라우저, 해당 성능 측정.

### T11 — 큰 입력의 작업 분할·Worker 비용 비교

- **실행 결과:** 조사 후 production 도입을 보류했다. 이유와 측정 범위는 아래 실행 기록에 남겼다.

- **선행:** T06의 실제 지연 목표 미달. **범위:** 우선 별도 benchmark/prototype; production 도입은 측정 후 결정.
- [ ] 동기 연속 처리, 비동기 경로의 제한된 작업 분할, 선택적 Worker pool을 비교한다.
      Promise 이름만 바꾸거나 `await Promise.resolve()`만 반복하는 것을 event loop 양보로 간주하지 않는다.
- [ ] 작업 분할은 비트 정렬·CRC·난독화 전체 위치·진행률·첫 snapshot 시점을 보존한다.
- [ ] Worker는 시작 비용·pool 상한·큐·직렬화·취소·정리를 포함해 측정한다. 호출자 Buffer를
      자동 transfer하지 않으며, 전달 가능한 내부 독립 버퍼만 고려한다.
- [ ] Node 결과를 웹에 일반화하지 않는다. 브라우저 빌드·CSP·실패 fallback과 사용자 callback/
      adapter 직렬화 제약까지 해결할 수 있는지 확인한다.
- **완료 조건:** 실제 입력에서 지연 개선이 전체 시간·메모리·번들 비용을 정당화한다.
  충족하지 못하면 채택하지 않고 결과만 기록한다. 보류된 Worker 도입 결정을 자동으로 뒤집지 않는다.
- **검증:** 기존 동기 API 불변, 출력·오류 동치, 동시성·취소·참조 정리, 처리량과 p95·메모리 비교.

### T12 — 출시 전 호환 검증과 이행 안내

- **선행:** T02·T03·T05·T06·T13 완료. T07~T11은 채택한 작업만 완료하고 나머지는 보류 사유를 기록한다.
- [x] 기존 API 소비자가 수정 없이 동작하고 새 API가 한 가지 권장 경로로 소개되는지 확인한다.
- [x] 구버전 → 새 decoder, 새 encoder → 구버전 decoder의 호환을 지원 프로필별로 검증한다.
      새로운 영구 포맷·marker·KDF 기본값이 포함되지 않았는지 확인한다.
- [x] 최종 코드에서 `pnpm verify`, `pnpm bench:guard`, `pnpm smoke:browser`와 로컬 지원
      런타임 검증을 완료했다. fixture·성능 하한·기존 크기 예산은 완화하지 않았다.
- [x] 새 API의 minor 버전을 6.3.0으로 준비하고 CHANGELOG·최초 지원 버전을 맞췄다.
      기존 sync/Async API는 삭제하거나 자동 치환하지 않았다.
- [ ] 실제 배포 전 최종 커밋의 원격 CI와 `v6.3.0` tag를 확인한다. npm Trusted Publisher의
      외부 확인과 실제 배포는 로컬 검증으로 완료 처리하지 않는다.
- [x] 작업 기록에 커밋·실행 명령·로그·관측 이득·잔여 이슈를 남기고 실제 배포 실행과 검증을 구분한다.
- **완료 조건:** 새 API 채택은 선택 사항이며 기존 소비자의 코드·데이터 이행이 필요하지 않다.
  production runtime dependency와 최소 지원 환경은 그대로다.

### T13 — 오류·예외 전수 점검 후속 보완

- **근거:** [ERROR_AUDIT](ERROR_AUDIT.md). 2026-09-30 production 수정·회귀·최종 검증을 완료했다. 상세 결과는 ERROR_AUDIT의 후속 기록에 둔다.
- [x] E01: onProgress의 Promise 반환·rejection 처리 계약을 정하고 기존 sync 반환 타입을 유지한다.
- [x] E02: stream 청크 타입을 길이 검사·형변환·상태 변경 전에 검증한다. 상한 우회와 무음 데이터 변경을 막는다.
- [x] E03/E04: 오류 정규화와 생성·sync 가드·stream transform 경계에서 원인을 보존하고 typed 오류를 제공한다.
- [x] E05~E07: native decrypt cause, invalid adapter 결과·재시도, ESM/CJS 오류 식별을 보완한다.
- [x] E08/E09: 거부 자체를 단언하는 테스트·공개 오류 안내·CharsetBuilder 입력 처리를 보완한다.
- **완료 조건:** 각 최소 재현을 회귀 검사로 고정하고 새 조사에서 확인한 계약 공백을 해결한다.
  오류 code 변경은 소비자 분기 호환성을 검토한다. 단일 동기 검증은 기존 함수 안에서 처리한다.
- **검증:** 관련 회귀 후 `pnpm verify`와 실제 세 브라우저 오류 검사. wire·입력 보존·인증·한도·기존 예산을 유지한다.

## 공통 호환성 검증표

| 축            | 필수 확인                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------ |
| 기존 공개 API | sync 반환값, Async Promise, 생성자 overload, create, secure/core, byte/Buffer, public 타입 |
| 새 API        | 같은 이름·반환 타입, cold/warm 상태, 초기화 실패/재시도, 동시 호출·인스턴스 격리           |
| codec·문자열  | 기본/custom charset, DDU_V1, 숫자/반복/두 자리 padding, marker 충돌, BOM·Unicode           |
| wire·옵션     | V2/V3/V4, CHK/CK scope, URL-safe·구분자·난독화·checksum, 기존 fallback·오류 동작           |
| 암호화        | KDF 설정별 기존 암호문, AAD·tag 변조 거부, 인증 전 평문 미반환, Node↔브라우저              |
| 메모리·확장   | 입력 변경·transfer·subarray·Buffer 풀, 옵션 snapshot, limits, callback·override            |
| 배포물        | 실제 tarball ESM/CJS·NodeNext, 조건부 exports, legacy와 새 API 각각의 초기/전체 번들       |
| 런타임        | Node 22/24/26, Bun·Deno, Chromium·Firefox·WebKit, 지원·미지원 기능과 fallback              |

평문처럼 결정론적인 codec 출력은 기존 벡터와 정확히 비교한다. 압축은 동일 엔진·설정의
전후 비교와 엔진 간 복원 호환을 구분한다. 암호화 출력은 매번 IV가 달라지므로 암호문 문자열의
동일성을 요구하지 않고 기존 고정 복호화 벡터·왕복·변조 거부로 검증한다.

## 최적화 채택과 문서 관리

최적화 완료에는 관측된 이득과 유지한 계약이 함께 필요하다. 먼저 T06에서 표본 변동과 목표를
정하고 같은 환경에서 재측정한다. 이득이 오차 범위에 있거나 작은 입력·주요 런타임에서 회귀하면
보류한다. 이전 검증 수치를 새 구현의 성능으로 보고하지 않는다.

이 파일은 저장소에서만 관리하며 npm 배포물에 추가하지 않는다. 완료된 사용자 변화는 CHANGELOG,
확정한 설계는 DECISIONS, 사용법은 REFERENCE/README로 옮긴다. 이 문서에는 작업 상태와 검증
근거를 남기며 핵심 컨벤션을 중복 확장하지 않는다. 스킬·도구·모델별 강제 절차는 추가하지 않는다.

## 2026-09-22 실행 기록

### 기준 배포와 확정 계약

- npm 6.2.0 배포는 `2026-09-17T07:33:53.785Z`, `gitHead`는
  `f4eef3dab707b7ad152b42c889df0cf6cf49c5b9`다. registry tarball의 SHA-512를 검증하고
  별도 디렉터리에 보관했다. 기존 fixture는 재생성하지 않았다.
- 기준 tarball integrity:
  `sha512-PaPbKrPAGWF9MAlwIkzUfoFJOsoReyMyCD/v+/hRN+HOorkqGlL/8xDt6RvU7u74HQK5uAJumygg3772Idgmhw==`.
- 실제 사용 목적은 한글/custom charset과 기존 데이터 호환이다. 실제 운영 입력 분포·응답 시간
  목표는 제공되지 않았으므로 benchmark 입력을 대표 가정으로 기록하고 SLO를 임의로 만들지 않았다.
- `createDdu`·`DduCreateOptions`·`DduCodec`을 root/browser에 추가했다. 문자열/bytes 반환은 생성
  시 고정하고 기존 클래스·생성자·호출별 override는 보존했다. 새 API에도 기존 입력 보존·
  adapter/KDF 초기화 공유·재시도·주입·callback·크기 제한 계약이 적용된다.
- 버전은 6.3.0 준비 상태다. CHANGELOG의 기존 변경은 실제 6.2.0 섹션으로 이동했고 새 변경은
  Unreleased에 남겼다. GitHub Release `v6.2.0` 조회 결과는 404였으며 npm 배포와 구별한다.

### 검증 기록

| 범위                                                 | 이번 실행 결과                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 코드·타입·lint·Knip                                  | `pnpm verify` 최종 통과, production Knip 추가 통과, 30개 파일·1,159개 테스트 통과                       |
| 성능 가드                                            | 6개 통과: 185.7 / 418.5 / 175.4 / 232.1 / 15.4 / 39.6 MiB/s, 기존 하한 유지                             |
| coverage                                             | statements 93.70%, branches 90.68%, functions 96.56%, lines 94.38%                                      |
| 이전 npm 패키지와 호환                               | 6.2.0 ↔ 현재 75개 설정/입력 조합, 기존 export·sync·위치 인자·통계 비교 통과                             |
| Node 22.18.0 / 26.9.0                                | 각각 1,159개 테스트와 Node/web runtime smoke 통과                                                       |
| Bun 1.3.10 / Deno 2.9.3                              | root/browser/secure 해석과 새 API·binary·stream smoke 통과                                              |
| Chromium 153.0.8010.12 / Firefox 155.0 / WebKit 26.6 | 실제 엔진의 새 API·snapshot·native/fallback·Node 교환 통과                                              |
| 압축 지원 방향                                       | 세 엔진 모두 deflate-raw 압축/해제 지원. Brotli는 Firefox/WebKit 지원, Chromium은 양쪽 미지원 오류 검증 |
| tarball                                              | 58개 파일, unpacked 388,827B로 기존 390,000B 이하. ESM/CJS·NodeNext·browser bundle 통과                 |
| 번들                                                 | 기존 모든 예산 유지. 새 factory 전체 Node 16.35KB/browser 16.44KB, 초기 15,457B/15,369B                 |

Node 22의 첫 동시 런타임 실행에서는 기존 암호화 property test가 5초 제한을 넘었다. 같은
검사를 단독 실행해 통과했으며 timeout·테스트 수·KDF 설정은 완화하지 않았다. npm pack 초과는
중복 사용 예제와 긴 표를 정리해 해결했고 기존 크기 한도를 늘리지 않았다.

새 factory의 전체 예산은 Node 16.9KB/browser 17.1KB, 초기 예산은 16,000B/15,950B다.
전체 그래프와 초기 정적 그래프는 측정 방법이 달라 서로 빼서 chunk 크기로 해석하지 않는다.
README의 CommonJS Quick Start와 REFERENCE의 ESM text/bytes 예제도 실제 실행했다.
원격 GitHub CI와 실제 배포는 실행하지 않았으며 위 표는 로컬 런타임·엔진 검증 결과다.

### 시간·할당 측정과 채택 판단

Node 24.21.0 / Apple M1 Pro / Darwin 27.0.0에서 다른 측정 작업과 겹치지 않게 실행했다.
lockfile SHA-256은 `760597726f1eae241c336c6560b31107c7e5da703208bca3c1f15e1d611be941`이다.
`bench:latency`는 14개 workload를 API별로 20번 교대 측정해 원시 시간·경험적 p50/p95·
관측 메모리·양쪽 실행을 합친 event loop 지연을 기록한다. 64B~8MiB, Unicode/BOM·난수·이미
압축된 바이트, 작은 payload의 동시 호출 1/4/16을 포함한다. 큰 입력에 동시 16을 일괄 적용해
불필요한 메모리 압박을 만들지는 않았다.

최적화 적용 전 간편 API의 8MiB 평문 encode 호출 반환 중앙값은 59.43ms, p95는 66.70ms였다.
이 측정은 별도 스레드 실행이 아님을 확인하는 기준이며 최종 구현의 전체 성능 개선율로 쓰지 않는다.
cold import 5회는 3.39~7.72ms, 기본 PBKDF2 첫 encode는 28.09~79.04ms, 재사용은
0.068~0.119ms였다. 프로세스 시작 시간은 cold import 수치에 포함하지 않는다.

T07은 65문자 alphabet의 `A` 반복 문자열을 난독화한 고정 입력으로 공개 6.2.0과 후보를
9회 교대 측정했다. 아래는 호출당 중앙값이며 실제 사용 분포 전체를 대표하지 않는다.

| 역난독화 입력(code units) | 6.2.0    | 변경 후  |
| ------------------------- | -------- | -------- |
| 32                        | 0.0005ms | 0.0005ms |
| 1Ki                       | 0.0142ms | 0.0129ms |
| 16Ki                      | 0.2828ms | 0.2144ms |
| 1Mi                       | 14.97ms  | 12.38ms  |
| 8Mi                       | 137.99ms | 92.34ms  |

문자 매핑 배열을 최대 8,192개 항목으로 제한했다. 8Mi 입력 한 호출 직후 관측 heap 증가의
중앙값은 72.13MiB → 35.65MiB였으며 peak RSS나 전체 codec 메모리 감소량은 아니다.
출력 조각과 최종 문자열은 여전히 입력 크기에 비례한다. 작은 입력 회귀가 관측되지 않고
큰 입력 이득이 재현돼 채택했다. 출력·다중 코드 유닛 alphabet·배치 경계·오류 위치 검증을 통과했다.

| 조건부 작업       | 확인한 내용과 결정                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T08 stream 복사   | 축적 청크를 합친 뒤 public `encodeAsync`가 await 전 snapshot을 만든다. 8MiB combined와 snapshot은 각각 독립 8MiB다. override 우회·외부 입력 보존 삭제 없이 제거할 근거가 없어 보류. 기존 writer 재사용·취소·한도 회귀 검사는 유지 |
| T09 native Base64 | 세 실제 엔진에서 사전 할당·read/written 확인 포함 9표본 실험. 1MiB Chromium은 from/set 0.4125/0.225ms, Firefox 1.25/1.25ms, WebKit 0.25/0.25ms. 별도 목적지 없는 기존 경로에서 할당 제거는 없고 전 경로 이득도 미입증이므로 보류  |
| T09 UTF-8         | 상한 버퍼·`encodeInto`·최종 독립 복사를 포함해 비교. 1MiB ASCII WebKit은 encode/후보 0.125/1.5ms로 회귀. 엔진별 분기를 늘리지 않고 기존 TextEncoder 경로 유지                                                                     |
| T10 CryptoKey     | 1KiB AES의 import/재사용은 Chromium 0.011/0.006ms, Firefox 0.23/0.28ms, WebKit 0.12/0.09ms. 이득이 일관되지 않고 가변 키·수명 계약 비용이 있어 캐시 도입 보류                                                                     |
| T11 분할·Worker   | CPU 점유는 확인했으나 실제 SLO가 없어 도입 조건 미충족. protocol·callback·adapter 직렬화·pool 비용을 추가하지 않고 별도 prototype도 보류                                                                                          |

브라우저 실험은 primitive 단위의 중앙값이며 전체 codec 속도가 아니다. 타이머 해상도 때문에
짧은 입력의 0ms 표본을 실제 비용 0으로 해석하지 않는다. 단순 최신 API 여부가 채택 근거는 아니다.

### 남은 출시 확인

- T13의 로컬 수정·재검증은 2026-09-30 완료했다. 남은 출시 확인은 아래 외부 설정·원격 CI·태그·배포다.

- npm 계정의 Trusted Publisher 및 GitHub environment 권한을 실제 설정에서 확인한다.
- 최종 커밋의 원격 CI를 확인하고 배포 시 `v6.3.0` tag·버전·CHANGELOG·미배포 안내를 맞춘다.
- 실제 `npm publish`와 GitHub Release 생성은 수행하지 않았다. T03/T12의 외부 확인을
  코드 구현 완료와 섞어서 완료 처리하지 않는다.
