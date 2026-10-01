# 오류·예외 전수 점검

점검일: 2026-09-22. 대상: 6.3.0 작업 트리(`f4eef3d` 이후의 기존 변경 포함, 미배포).
아래 최초 조사 당시에는 production 코드를 수정하지 않았다. 재현된 결함과 보완 후보를 구분한 과거 기록이다.

**2026-09-30 후속 수정:** E01~E09 및 별도 청크 구분자 중첩 결함을 구현·회귀 테스트에 반영했다. 최종 검증 결과는 아래 후속 기록에서 관리한다.
최초 조사에서 9개 보완 항목을 확인했다. 우선순위는 수정 순서이며 외부 보안 취약점 등급이나 CVSS가 아니다.

## 2026-09-30 후속 수정

- E01: onProgress는 sync 전용이다. Promise/thenable을 반환하면 InvalidInput으로 호출을 실패시키고 rejection을 관측한다. sync 반환 타입은 유지한다.
- E02: 길이 접근 전에 intrinsic Uint8Array 종류·detached 여부 또는 문자열 타입을 검증한다. 잘못된 청크·subclass 실패는 양쪽 stream에 같은 오류로 전달하고 상태를 정리한다.
- E03/E04: 기존 오류 정규화가 메시지 getter·문자열 변환·revoked Proxy 실패를 처리한다. 생성자·factory·sync 가드·stream 생성/transform/flush의 원인을 보존한다.
- E05: WebCrypto decrypt의 native cause를 연결한다. 인증 완료 전 결과는 반환하지 않는다.
- E06: undefined/null 등 객체가 아닌 초기화 결과는 AdapterUnavailable로 실패하고 lazy Promise를 해제한다. eager create도 이 결과를 거부한다. 부분 adapter의 개별 capability는 기존 gateway에서 검사한다.
- E07: 같은 오류 프로토콜의 ESM/CJS는 비열거 Symbol.for 표식과 Error 태그로 식별해 객체·code를 보존한다. 실제 양방향 혼용을 packed consumer에서 검사한다.
- E08/E09: garbage stream의 거부 자체를 단언하고 REFERENCE에 공개 오류 계약을 추가했다. CharsetBuilder는 입력을 순회해 큰 문자열·배열을 처리한다.
- 추가 결함: 다문자 chunkSeparator는 분할 후 제거 결과가 분할 전 문자열과 같은지 검사한다. ABCC에 ABA를 넣어 [0,16,130]이 [4,0,130]으로 변하던 조합은 EncodeFailed로 거부한다. 유효한 wire 출력은 바꾸지 않는다.

최종 검증은 Node 24.21.0에서 완료했다.

- `pnpm verify`: 30개 파일·1,196개 테스트, format/type/lint/Knip/build/coverage/size/pack/Node·web smoke 통과.
- coverage: statements 93.99%, branches 91.13%, functions 96.86%, lines 94.61%.
- packed ESM/CJS 양방향 오류 식별·객체/code 보존 및 NodeNext 타입 검사 통과.
- 실제 Chromium 153.0.8010.12 / Firefox 155.0 / WebKit 26.6: 정상 wire·Node 교환과 Promise callback·잘못된 stream 청크·detached salt·구분자 중첩·native cause 검사 통과.
- `pnpm bench:guard`: 기존 하한 6개 통과. 기존 초기/전체 번들 예산과 390,000B 배포물 한도를 유지했다. tarball unpacked 384,260B.
- 별도 프로브: charset/숫자·마커 padding/반복 padding 15,840건의 bytes round-trip과 fulfilled/rejected thenable·다른 realm의 rejected Promise 3건 통과.
- 이번 수정의 Node 22/26·Bun/Deno 추가 실행과 원격 CI·배포는 수행하지 않았다. 아래 2026-09-22 수치는 과거 조사 결과다.

## 조사 범위와 근거

- `src/`의 TypeScript 41개 파일을 대상으로 예외 경로를 정적으로 목록화했다.
  AST 기준 explicit throw 137곳, catch 36곳, catch/finally/controller.error 등 처리 호출 8곳이다.
  명시적 throw뿐 아니라 옵션 접근·형변환·버퍼 생성·사용자 callback의 암묵적 예외도 추적했다.
- core, Node/browser, secure Node/browser의 5개 클래스와 두 `createDdu` 구현을 검사했다.
  생성자, 동기/Async encode·decode·bytes/Buffer·통계, adapter, 난독화, Streams, 패키지 오류 식별을 포함한다.
- Node 24.21.0에서 표준 오류 시나리오 1,603개를 실행했다. 기대한 거부가 모두 발생했고
  13종 오류 코드를 전부 확인했으며 이 범위에서는 plain Error 누출이 없었다.
- 별도로 경계 조건 28개, 기본 설정 Node 자식 프로세스 종료, ESM/CJS 혼용,
  취소 후 상태, 큰 CharsetBuilder 입력을 조사했다. 아래 결함은 이 별도 검사에서 발견했다.
- Chromium 153.0.8010.12 / Firefox 155.0 / WebKit 26.6에서 8개씩 총 24개 경계 조건을 재현했다.
  Node에서 BrowserAdapter만 실행한 결과와 실제 브라우저 결과를 구별했다.
- 기존 관련 테스트는 16개 파일·539개가 통과했다. 정상적인 거부 테스트가 통과해도 별도 경계
  조건의 결함까지 없다는 뜻은 아니다.
- 공개 npm 6.2.0과 현재 빌드를 비교한 핵심 8개 재현 조건은 결과가 같았다. E01/E02의
  핵심 동작과 정규화·초기화 관련 문제는 기존 경로에 존재하며 새 API에도 전달된다.

실행 명령은 `pnpm exec vitest run`으로 아래 파일을 지정한 것이다.

```text
error-invariant, wrapError-classification, NodeAdapter, BrowserAdapter, WebStreams,
Ddu64Core, Ddu64Secure, regressions, wireFormat, nativeBase64,
obfuscated-encrypted-compat, scoped-checksum-vectors, createDdu,
CharsetBuilder, ObfuscationLayer, detect
```

원시 inventory·결과 JSON·재현 스크립트·브라우저 로그는 이번 작업의 별도 증빙 파일에 보관했다.
Node 22/26·Bun/Deno의 추가 예외 프로브는 이번 조사에서 실행하지 않았다. 앞선 런타임 호환
검증과 이번 예외 조사를 혼동하지 않는다. 강제 OOM·OS 종료 및 모든 JavaScript 객체/환경의
조합을 증명하는 검사는 수행하지 않았다.

## 우선순위

| ID  | 우선순위 | 발견 사항                                          | 영향                                                            |
| --- | -------- | -------------------------------------------------- | --------------------------------------------------------------- |
| E01 | P1       | async onProgress의 rejection을 관측하지 않음       | encode 성공 후 unhandled rejection, 기본 Node에서 프로세스 종료 |
| E02 | P1       | Streams가 청크 타입 검사 전에 length·형변환을 사용 | 잘못된 타입으로 축적 한도 우회, 무음 데이터 변경/손실           |
| E03 | P2       | 예외 메시지 변환 자체가 다시 throw                 | 원인 예외가 사라지고 plain TypeError 노출                       |
| E04 | P2       | 생성·sync 가드·stream transform의 오류 경계 공백   | 같은 원인이 API 경로에 따라 typed/raw 오류로 달라짐             |
| E05 | P2       | BrowserAdapter.decrypt가 원인을 버림               | native 실패 원인·stack을 cause에서 추적 불가                    |
| E06 | P2       | 잘못된 adapter 로딩 결과를 성공으로 캐시           | undefined 결과 이후 재호출도 회복하지 못함                      |
| E07 | P2       | ESM/CJS 오류 클래스의 식별 불일치                  | 동일 패키지 오류의 code가 바뀌고 중복 래핑됨                    |
| E08 | P3       | 일부 거부 테스트와 공개 오류 문서의 공백           | 거부 여부·지원 범위·오류별 대응을 충분히 고정하지 못함          |
| E09 | P3       | CharsetBuilder의 큰 입력을 spread 인자로 전달      | 정상 타입의 문자열/배열에서 VM 인자 한도 RangeError             |

## E01 — 비동기 진행률 callback의 실패가 연산과 분리됨

위치: [Ddu64Core.reportProgress](../src/core/Ddu64Core.ts#L768),
[onProgress 타입](../src/core/types.ts#L188).

```js
import { createDdu } from "@ddunigma/node";

const ddu = createDdu({
  onProgress: async () => {
    throw new Error("progress failed");
  },
});
await ddu.encode("x"); // 현재는 정상 resolve
```

callback 반환값을 읽지 않아 반환된 Promise의 실패가 encode Promise에 연결되지 않는다.
Node와 세 브라우저에서 한 번의 encode가 문자열을 반환한 뒤 unhandled rejection 3개를
발생시켰다. 전역 오류 수신자를 설치하지 않은 Node 자식 프로세스는 호출자의 try/catch 밖에서
종료 코드 1로 끝났다. 이는 [Node의 기본 unhandled rejection 처리](https://nodejs.org/api/process.html#event-unhandledrejection)와 일치한다.

`onProgress: (...) => void` 타입에도 async 함수를 넣을 수 있음을 별도 TypeScript 소비자 검사로
확인했다. 다만 현재 void 타입에 Promise callback 지원이 명시된 것은 아니다. 따라서 이미
약속한 async callback 기능의 회귀로 단정하지 않고, 허용·거부와 실패 책임이 불명확한 계약
공백으로 분류한다. reportProgress는 encode/decode/통계에서 공유되므로 이 지점의 계약을 정해야 한다.

수정 기준:

- callback을 동기 전용으로 제한할지, 비동기 경로에서 반환 Promise를 기다릴지 명시한다.
- 기존 동기 메서드의 반환 타입을 Promise로 바꾸지 않는다. 반환된 rejection을 관측하지 않은
  채 두거나 전역 unhandledRejection 처리로 문제를 숨기지 않는다.
- 동기 throw·async reject·성공한 callback, callback 실패 후 다음 호출을 각각 검증한다.
- 당장은 async callback을 직접 전달하기보다 callback 내부 비동기 작업의 rejection을 호출자가
  처리해야 한다. `await ddu.encode()`만으로 그 비동기 부수 작업의 실패를 잡을 수는 없다.

## E02 — 스트림 청크 타입 미검증으로 상한 우회·데이터 변경

위치: [encode transform](../src/streams/WebStreams.ts#L98),
[축적 시 복사](../src/streams/WebStreams.ts#L146),
[decode transform](../src/streams/WebStreams.ts#L263).

encode는 Uint8Array, decode는 문자열을 받아야 하지만 실제 transform에서 이를 검사하지 않는다.
`chunk.length`를 먼저 믿고 `new Uint8Array(chunk)` 또는 문자열 덧셈으로 형변환한다.

| 재현 입력                                                              | 현재 결과                                                              |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| checksum을 사용하는 encode stream에 문자열 `"abc"` 전달                | 오류 없이 성공하며 decode 결과는 `[0, 0, 0]`                           |
| 일반 encode stream에 DataView 전달                                     | 헤더만 출력하고 성공해 원래 바이트가 사라짐                            |
| decode stream의 `maxBufferedChars: 1`에 `[encodedText]` 배열 청크 전달 | 배열 length 1로 검사 후 224문자 문자열로 변환; 160바이트가 정상 반환됨 |
| encode stream에 null 전달                                              | typed codec 오류 대신 raw TypeError로 양쪽 stream 실패                 |

한도 우회·문자열의 0 바이트 변환은 Node와 세 브라우저 모두에서 확인했다. 올바른 타입의 청크에
대한 한도 우회를 확인한 것은 아니다. 잘못된 타입을 넘기는 호출 경계에서 발생하는 문제다.

수정 기준:

- 각 transform 시작 지점에서 청크 타입을 검증한 다음 길이 검사·상태 변경·출력을 수행한다.
- Buffer와 정상 Uint8Array는 유지하고 string/array/DataView/다른 typed array를 암묵적으로
  변환하지 않는다. decode도 문자열 외 입력을 명시적으로 거부한다.
- 두 stream 면의 실패·원인 보존·한도·writer 입력 재사용을 검증한다. 간단한 검사는 기존
  transform 안에서 처리하며 별도 변환 프레임워크를 추가하지 않는다.

## E03 — 오류를 포장하다가 원래 오류를 잃음

위치: [toErrorMessage](../src/core/errors.ts#L140),
[wrapDdu64Error](../src/core/errors.ts#L145).

```js
import { createDdu } from "@ddunigma/node";

await createDdu({
  onProgress() {
    throw Object.create(null);
  },
}).encode("x");
```

JavaScript에서는 Error 이외의 값도 throw할 수 있다. 위 값은 `String(error)`에서 다시
TypeError를 발생시키므로 최종 오류는 Ddu64Error가 아니며 원래 값도 cause에 남지 않는다.
세 브라우저에서도 같은 문제가 발생했고 엔진별 TypeError 문구만 달랐다.

수정 기준: 기존 오류 정규화 함수가 unknown 값을 처리하다 다시 실패하지 않도록 한다.
변환 불가능한 값에는 고정된 설명을 사용하고 원래 값은 cause로 보존한다. null/undefined/
Symbol/null-prototype 객체와 message·문자열 변환이 실패하는 객체를 회귀 범위에 포함한다.
이미 인식한 도메인 오류를 메시지 키워드로 재분류하지 않는다.

## E04 — 공개 경계의 일부 작업이 try/catch 바깥에 있음

위치: [Node sync wrapper](../src/Ddu64Node.ts#L136),
[Browser sync wrapper](../src/Ddu64Browser.ts#L119),
[생성 시 salt 복사](../src/core/Ddu64Core.ts#L312),
[Node createDdu](../src/Ddu64Node.ts#L229),
[stream transform](../src/streams/WebStreams.ts#L98).

- `compress` getter가 Error를 throw하는 옵션으로 encode를 호출하면 core/secure와 Async
  경로는 typed 오류와 cause를 제공하지만 Node/browser sync wrapper는 raw Error를 노출한다.
  `#assertSync()`가 core의 try/catch보다 먼저 옵션을 읽기 때문이다.
- detached Uint8Array를 KDF salt로 제공하면 생성 중 복사에서 raw TypeError가 발생한다.
  Node/browser의 새 createDdu에서도 그대로 노출된다. 생성 옵션 getter의 throw도 같은 공백에 해당한다.
- 정상 Uint8Array를 쓰더라도 사용자 subclass의 encodeAsync가 plain Error를 reject하면
  encode stream의 transform에서 그대로 노출된다. 같은 파일의 flush/decode는 래핑한다.

수정 기준: 기존 오류 코드를 보존하면서 실제 공개 경계를 감싼다. 옵션 snapshot은 첫 await 전에
유지하고 sync 가드 정책·하위 클래스 호출을 우회하지 않는다. 생성 실패는 옵션/charset/adapter
중 원인에 맞게 분류하며 모든 생성 오류를 adapter 문제로 덮지 않는다.

## E05 — 브라우저 복호화의 native 원인 손실

위치: [BrowserAdapter.decrypt catch](../src/adapters/BrowserAdapter.ts#L201).

catch에서 원래 예외를 받지 않고 새 Error만 만든다. gateway가 이를 Ddu64DecryptionError로
감싸도 cause는 일반화된 메시지뿐이고 최초 native 예외는 사라진다. sentinel 예외를 주입해
직접 adapter와 codec에서 확인했으며 세 브라우저에서도 cause 체인에 원인이 없었다.

직접 adapter의 plain Error 자체는 기존 계약이다. 문제는 타입이 아니라 원인 손실이다.
현재의 일반화된 외부 메시지를 유지하면서 catch한 원인을 cause로 연결하는 것이 적절하다.
인증 검증 후에만 결과를 반환하는 순서는 유지해야 한다.

## E06 — invalid adapter 결과가 성공한 초기화로 남음

위치: [getAsyncAdapter](../src/core/Ddu64Core.ts#L784).

첫 호출에서 undefined를 resolve하고 다음 호출에서 정상 adapter를 반환하도록 factory를
구성하면, encode 두 번 모두 `DDU64_ADAPTER_UNAVAILABLE`로 실패하는데 factory는 한 번만
실행된다. 초기화 Promise가 성공 상태로 캐시되어 후속 호출이 재시도하지 않기 때문이다.

기본 내장 factory에서 이 잘못된 반환을 관찰한 것은 아니다. 사용자 factory가 타입 계약을
어겼을 때 초기화 실패로 처리하지 못하는 경계 문제다. 실제 reject의 재시도·동시 초기화 공유는
이번 검사에서 정상 동작했다.

추가로 같은 로딩 Error가 lazy encode에서는 `DDU64_ENCODE_FAILED`, eager create에서는
`DDU64_ADAPTER_UNAVAILABLE`로 분류됐다. 로딩·알고리즘 실행의 분류 정책도 명시할 필요가 있다.

수정 기준: 유효한 초기화 결과만 캐시하고 잘못된 결과는 typed 초기화 실패로 처리한다.
실패 Promise는 해제하되 정상적으로 준비된 adapter를 일반 연산 실패마다 폐기하지 않는다.
오류 code 변경은 기존 소비자 분기에 영향을 주므로 재시도 보완과 구분해 호환성을 검토한다.

## E07 — ESM/CJS 혼용 시 동일 패키지 오류가 다른 종류로 바뀜

위치: [isDdu64Error](../src/core/errors.ts#L136), `package.json`의 import/require 진입점.

같은 빌드의 CJS에서 만든 Ddu64AdapterError를 ESM 쪽에 전달했을 때:

```text
CJS isDdu64Error(original) = true
ESM isDdu64Error(original) = false
original.code             = DDU64_ADAPTER_UNAVAILABLE
최종 codec 오류 code      = DDU64_ENCODE_FAILED
최종 오류 === original    = false
최종 오류.cause === original = true
```

두 빌드의 클래스 identity가 달라 instanceof 검사만으로는 같은 라이브러리 오류를 식별하지
못한다. ESM/CJS를 각각 사용하는 기존 pack smoke만으로는 이 혼용 조건을 확인할 수 없다.

수정 기준: 지원할 오류 식별 범위를 정하고 혼용 조건의 code·operation·인스턴스 보존을
검증한다. 메시지 문구로 오류를 추측하거나 이름이 같은 객체를 무조건 신뢰하는 방식은 피한다.

## E08 — 오류 거부 검증과 사용자 문서 보완

위치: [assertTypedOnReject](../test/error-invariant.test.ts#L37),
[garbage stream 검사](../test/error-invariant.test.ts#L142), [REFERENCE](REFERENCE.md).

`assertTypedOnReject`는 reject할 때만 타입을 확인하고 resolve하면 통과한다. 이 동작은
성공 가능한 입력을 포함하는 일반 property 검사에는 맞지만, 이름에 반드시 reject한다고
명시한 garbage stream 검사에는 충분하지 않다. 오류가 사라져도 해당 검사가 통과할 수 있다.

공개 reference에는 13종 code의 발생 조건, 동기 throw/Promise rejection, callback 계약,
stream 양쪽의 오류 수신과 외부 취소 이유, ESM/CJS 식별 범위에 대한 한 곳의 안내가 없다.
개발용 CONTRIBUTING의 설명만으로 npm 사용자에게 충분한 오류 계약을 제공하지 못한다.

수정 기준: 반드시 잘못된 입력인 사례에는 거부 자체를 단언한다. 일반 property helper를
모두 무조건 throw 검사로 바꾸지는 않는다. 각 결함의 최소 회귀 검사를 추가하고 확정한
사용자 계약은 REFERENCE에 작성한다. 주석으로 완료되지 않은 오류 보장을 선언하지 않는다.

## E09 — CharsetBuilder의 큰 입력이 VM 인자 한도에 걸림

위치: [CharsetBuilder.addString](../src/core/CharsetBuilder.ts#L128).

`CharsetBuilder.fromString("ab".repeat(100_000)).unique().build()`와 200,000개 항목 배열이
Node 24에서 `RangeError: Maximum call stack size exceeded`로 실패했다. 1,000개 입력에서는
둘 다 `["a", "b"]`를 반환했다. 입력 전체를 push의 함수 인자로 펼치는 것이 원인이다.

CharsetBuilder의 native Error/RangeError는 허용된 계약이다. 이를 Ddu64Error로 바꾸라는
의미가 아니라, 정상 타입의 비교적 작은 입력이 회피 가능한 VM 호출 한도에 걸리는 개선 후보다.
입력 길이를 제한할지 정의하고, 범위를 유지한다면 기존 함수 안에서 순회해 추가할 수 있다.
브라우저별 임계 크기는 이번 항목에서 측정하지 않았다.

## 정상 동작·현재 계약·조사 한계

- 표준 입력/옵션 오류, malformed wire, checksum 누락·변조, encoded/decoded 크기 제한,
  압축 해제 한도, 키 누락·오류는 추가 시나리오에서 typed 오류로 거부됐다.
- 암호문 문자 위치를 바꾼 140개 사례는 모두 거부됐고 이후 정상 암호문은 같은 인스턴스에서
  복원됐다. 이 범위에서 인증 전 결과 반환이나 인증 우회를 재현하지 못했다.
- 정상 reject를 한 adapter/KDF 초기화는 다음 호출에서 재시도했고 8개 동시 연산도 복원됐다.
- plain/buffered encode stream의 reader 취소 후 writer의 대기가 같은 취소 이유로 종료됐으며
  codec을 다시 사용할 수 있었다. 외부 취소 이유는 codec이 만든 오류와 구분한다.
- close/error 시 알고리즘 참조를 해제하는 [Streams 표준](https://streams.spec.whatwg.org/#transform-stream-default-controller-clear-algorithms)을
  고려했다. 별도 cancel callback이 없다는 이유만으로 메모리 누수라고 결론 내리지 않았다.
- CharsetBuilder와 직접 adapter의 native 오류는 허용된 기존 계약이다. 문자열 decode의
  UTF-8 대체 문자 동작도 binary decode와 구별하며 새로운 오류 결함으로 분류하지 않았다.
- PBKDF2의 큰 반복 수는 native 범위 검사 대상으로 남아 있다. Web Crypto의
  [EnforceRange 규칙](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/#dfn-Pbkdf2Params)을
  확인했으며 범위를 넘긴 값이 자동 wrap되어 낮은 반복 수로 실행된다고 추정하지 않았다.
- 라이브러리가 구성하는 메시지와 외부 callback/adapter의 message·cause를 구별한다.
  원본 cause 보존은 모든 외부 메시지의 비밀정보 제거를 보장한다는 뜻이 아니다.

현재 `DDU64_LIMIT_EXCEEDED`와 `DDU64_DECOMPRESSION_FAILED`는 구별해야 한다. native 압축 해제
한도 초과는 후자로 전달된다. 이를 하나의 code로 바꾸거나 추가 상세 사유를 제공하려면 기존
에러 분기 호환성을 별도로 검토해야 하며, 이번 조사에서 코드를 임의로 통합하지 않았다.

## 현재 오류 코드 확인표

다음은 이번 1,603개 시나리오에서 관찰한 발생 경로다. 모든 가능한 원인의 목록은 아니다.

| code                       | 확인한 대표 경로                                         |
| -------------------------- | -------------------------------------------------------- |
| DDU64_INVALID_INPUT        | 입력 타입·boolean/algorithm·크기/청크·callback 옵션 검증 |
| DDU64_INVALID_CHARSET      | 너무 작은/잘못된 charset·padding 설정                    |
| DDU64_ENCODE_FAILED        | 외부 lazy factory의 plain Error                          |
| DDU64_DECODE_FAILED        | 유효하지 않은 wire 문자                                  |
| DDU64_COMPRESSION_FAILED   | adapter 압축 실패                                        |
| DDU64_DECOMPRESSION_FAILED | native 압축 해제 한도 초과                               |
| DDU64_ENCRYPTION_FAILED    | KDF 실패                                                 |
| DDU64_DECRYPTION_FAILED    | 키/암호화 정보 누락·잘못된 키·암호문 변조                |
| DDU64_CHECKSUM_MISMATCH    | checksum 누락·변조                                       |
| DDU64_LIMIT_EXCEEDED       | encoded/decoded 사전 크기 제한                           |
| DDU64_ADAPTER_UNAVAILABLE  | core에서 필요한 adapter 미제공                           |
| DDU64_OBFUSCATION_FAILED   | core에서 난독화 구현 미제공                              |
| DDU64_STREAM_FAILED        | DDS1 헤더 오류                                           |

## 수정·검증 순서

1. E01/E02의 실패 처리와 스트림 입력 검증을 먼저 확정한다. callback 지원 범위를 정할 때
   기존 동기 반환과 저장 데이터 계약을 보존한다.
2. E03/E04를 기존 정규화·공개 경계 안에서 보완한다. 타입·code·operation·원인·재시도를 함께 검사한다.
3. E05~E07의 원인 보존·초기화·모듈 간 식별을 정리한다. 기존 code 변경이 필요한 곳은
   호환성 영향과 이행 설명을 먼저 남긴다.
4. E08의 거부 단언·공개 안내와 E09의 입력 처리 개선을 반영한다. 새 범용 ErrorManager나
   단일 동기 처리를 전달하기만 하는 helper는 추가하지 않는다.
5. 수정 전 최소 재현, 수정 후 관련 회귀, 최종 `pnpm verify`와 실제 세 브라우저 오류 검사를
   실행한다. 공개 API·wire·입력 보존·인증·자원 한도·기존 크기 예산을 유지한다.

최초 조사에서는 오류 수정과 재검증이 완료되기 전 앞선 기능 검증 통과만으로 6.3.0 배포 준비가 끝났다고
판단하지 않는다. npm Trusted Publisher·원격 CI·릴리스 태그 확인은 별도의 출시 항목으로 남는다.
