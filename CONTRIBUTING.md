# 개발·리뷰·릴리스 컨벤션

정확성 → wire 호환성 → 경량성 → 가독성 순으로 판단합니다.
사용법은 [REFERENCE](docs/REFERENCE.md), 선택 이유는 [DECISIONS](docs/DECISIONS.md),
현재 작업은 [TASKS](docs/TASKS.md)에서 관리합니다.

## 작업 시작과 우선순위

새 기능은 사용 사례·공개 API·대상 런타임·입력 크기·동시 호출 수로 판단합니다.
범위는 [제품 범위](docs/DECISIONS.md#제품-범위)를 따릅니다.

1. 데이터 손상·정상 입력 실패·인증·한도·호환성 결함
2. 코드·공개 타입·문서 불일치
3. 측정된 처리 시간·할당·복사·번들 비용
4. 데드코드·불필요한 중계·중복 설명

### 최초 환경 준비

CI의 기본 Node와 `package.json#packageManager`의 pnpm을 준비한 뒤 실행합니다.

```bash
pnpm install --frozen-lockfile
pnpm verify
```

기존 환경은 [변경별 검증](#변경별-검증)을 따릅니다. 의존성 변경 시
`pnpm-workspace.yaml`의 `allowBuilds`·`overrides`와 lockfile을 함께 검토하고 설치는 명시적으로 실행합니다.

## 디렉터리와 책임

| 위치                                                       | 책임                                 |
| ---------------------------------------------------------- | ------------------------------------ |
| `src/index.ts`·`browser.ts`·`core.ts`·`secure*.ts`         | 공개 export·플랫폼 선택              |
| `src/Ddu64*.ts`                                            | 런타임별 생성·lazy 주입·Buffer API   |
| `src/core/Ddu64Core.ts`·`types.ts`·`errors.ts`             | 옵션·상태·공개 오류                  |
| `src/core/pipeline/`                                       | sync/async 순서·checksum·진행률      |
| `src/core/internal/`                                       | 검증·전후처리·매핑·adapter 호출 경계 |
| `src/core/BitPack.ts`·`wireFormat.ts`·`CharsetResolver.ts` | 비트·footer·charset 불변식           |
| `src/adapters/`·`obfuscation/`·`streams/`                  | 플랫폼·난독화·DDS1                   |
| `test/`·`scripts/`·`benchmarks/`                           | 회귀·호환 fixture·배포물·성능 검증   |

새 로직은 기존 책임 모듈에 배치합니다. wire·압축·암호화를 래퍼에 복제하거나,
작은 동기 로직마다 파일을 만들거나, 다른 책임의 코드를 범용 utils로 모으지 않습니다.

## 진입점 역할

- root는 NodeAdapter·Node 내장 crypto/zlib·Web Streams를 정적으로 import하지 않습니다.
- `/browser`는 Node 내장 모듈·BrowserAdapter·Web Streams를 정적으로 import하지 않습니다.
- `/core`는 구체 adapter·난독화 구현을 import하지 않습니다.
- `/secure`는 전체 기능을 export하며 Node/browser 조건 경계를 유지합니다.
- core/internal은 공개 진입점을 역으로 import하지 않습니다.

실제 조건 선택은 [진입점 표](docs/REFERENCE.md#진입점)를 따릅니다.
`package.json#exports`의 `types`를 실행 조건보다 먼저, `default`를 마지막에 둡니다.
ESM/CJS와 `.d.ts`/`.d.cts`를 함께 검증하며, bundler 타입 검사 외에
`pack:check`의 packed consumer 실행·NodeNext 타입 검사를 유지합니다.
[Node 조건부 exports](https://nodejs.org/api/packages.html#conditional-exports)

## TypeScript·모듈

- strict TypeScript·ES2022와 상대 import의 `.js` 확장자를 유지합니다.
- tsc는 `noEmit` 타입 검사, tsup은 배포 JS·선언 파일 생성을 담당합니다.
- 타입 전용 참조는 `import type` 또는 `type` 지정자를, 공개 옵션은 해당 진입점의 type export를 사용합니다.
- production 경계는 `unknown`으로 검증하고 `any`를 쓰지 않습니다. 테스트의 `any`는 잘못된 런타임 입력 검증 등에 한정합니다.
- 서식·lint·타입은 기존 설정을 따르며 lint는 `--max-warnings=0`을 유지합니다.
- 함수·변수는 camelCase, 클래스·타입은 PascalCase, 파일명·private 필드는 주변 관례를 따릅니다.
- 예외는 해당 위치에 이유를 남기고 설정 전체를 완화하지 않습니다. 컨벤션만을 위한 일괄 rename은 하지 않습니다.

## 함수 분리 기준

한 곳에서 쓰는 단순 조건·할당·변환·객체 구성·중계는 호출 함수 안에서 동기적으로 작성합니다.
줄 수만으로 분리하거나 통합하지 않습니다.

분리는 실제 재사용, 복잡한 불변식의 독립 검증, 플랫폼·오류 경계가 있을 때 적용합니다.
sync/async 공유 설정·checksum 검증·wire parser가 해당합니다.

미사용 내부 인자는 호출부와 함께 제거하되 공개 adapter의 미지원 인자는 유지합니다.
불필요한 내부 async callback은 동기로 바꾸되 공개 Promise·하위 클래스 override·
rejection을 감싸는 `try/catch`의 `return await`는 보존합니다.

## 옵션·상태 규칙

- 기본값은 `??`로 합성해 `undefined`와 `""`·`[]`·`0`·`false`를 구분합니다.
- 생성자 기본값과 호출 옵션 합성 후 조합 불변식을 다시 검증합니다.
- 필터링·중복/padding 제거·종성 결합 뒤 charset 길이·bitLength·충돌을 재검증합니다.
- `throwOnError:false`는 유효한 preset으로 fallback해야 합니다.
- 비트 패킹·버퍼 할당·반복문 경계의 방어 검증은 생성자 검증과 별도로 유지합니다.

### 입력 소유권과 비동기 경계

- 가변 charset·coda·KDF salt·난독화 alphabet은 보관 전에 복사합니다. `create()`도 adapter 대기 전에 보존합니다.
- 비동기 codec·stream 옵션은 지연 사용 전에 얕게 복사합니다. 가변 중첩 필드는 별도 복사 계약을 정의합니다.
- await를 넘겨 쓰는 외부 바이트는 첫 await 전에 독립 복사합니다.
- UTF-8 변환으로 소유한 배열은 그대로 전달하고 변환 직후 `originalSize`를 기록합니다.
- 보관할 stream 청크·잔여 바이트는 write 완료 후 재사용할 수 있도록 복사하고 결합·실패 후 참조를 해제합니다.
- `subarray()`·`Buffer.slice()`는 독립 복사가 아닙니다. 동기 평문·내부 소유 배열에는 무조건 복사를 추가하지 않습니다.
- 주입 adapter·callback·난독화 구현은 참조 계약을 유지하며 deep clone·JSON 직렬화를 적용하지 않습니다.

## Lazy adapter 규칙

- adapter는 비동기 압축·암복호화가 필요할 때, Web Streams는 stream 메서드 호출 때 import합니다.
- 같은 core에 adapter를 주입하고 첫 동시 호출은 초기화 Promise를 공유합니다.
- `adapter` → `adapterFactory` → `asyncAdapterFactory` → 자동 adapter 순으로 선택합니다.
- factory의 객체가 아닌 결과는 거부하고 캐시하지 않으며 다음 호출에서 재시도합니다.
- `Ddu64.create()`는 명시적인 eager 경로입니다. Node 동기 secure와 브라우저 비동기 capability 차이를 유지합니다.

## Wire·문자열 불변식

- 출력 형식·charset 순서·footer·KDF 기본값 변경은 wire 호환성 변경으로 취급합니다.
- 인코딩의 footer → 난독화 → checksum suffix → URL-safe → 청크 순서를 유지합니다.
- 디코딩은 사용자 구분자를 CR/LF보다 먼저 제거합니다. metadata는 wire로 판별하고 호출별 비활성화·한도를 적용합니다.
- footer 후보와 실제 payload·padding·바이트 정렬을 함께 검사합니다. 숫자/반복 padding·두 자리 paddingBits·marker 충돌을 회귀에 포함합니다.
- V2/V3/V4·V4 AAD·CHK/CK 처리 순서를 유지하고 marker 추정 rollback 시 확인된 암호화·버전 정보를 보존합니다.
- UTF-8 BOM을 보존하고 Unicode를 자동 정규화하지 않습니다. 바이트 수와 UTF-16 코드 유닛을 구분합니다.
- native Base64는 정확한 표준 alphabet·padding 조건에서만 사용하며 기능 탐지·JS fallback·기존 입력 검증을 유지합니다.

## 에러 계약

- codec 공개 경계는 `Ddu64Error` 하위 타입만 throw/reject합니다. builder·adapter 직접 호출의 기존 오류 타입은 유지합니다.
- 발생 위치에서 오류를 분류하고 외부 오류는 cause를 보존해 래핑합니다. 기존 Ddu64Error는 중복 래핑하지 않습니다.
- 메시지에 작업·해결 경로를 담고 비밀키·평문·전체 payload를 넣지 않습니다.
- 인증 후 결과 반환과 전처리·큰 할당·stream 결합 전 한도 검사를 유지합니다.
- 사용자에게 필요한 오류 대응·보안 설정은 REFERENCE에 기록합니다. 비밀과 공격자 입력을 함께 압축 후 암호화하도록 권장하지 않습니다.

## 주석·문서

- 주석은 불변식·호환성·보안·성능 근거를 설명합니다. 코드 반복·완료 Task 번호·작업 과정 기록은 제거합니다.
- 공개 동작이 바뀌면 JSDoc·예제·계약을 함께 갱신하고 실제 공개 진입점에서 예제를 실행합니다.
- README는 시작 가이드, REFERENCE는 사용 계약, 이 문서는 개발 규칙, DECISIONS는 선택 이유, TASKS는 미완료 작업만 다룹니다.
- 사용자 영향은 CHANGELOG에 기록합니다. 내부 정리만으로 모든 문서나 CHANGELOG를 갱신하지 않습니다.
- 난독화·CRC32·`/secure`의 보안 의미를 과장하지 않습니다.

## 테스트·데드코드

- 회귀·fixture는 `test/`에 둡니다. 결함 수정에는 수정 전 실패하는 최소 회귀를 추가합니다.
- 경계·불변식·고정 벡터·property test를 우선하며 기존 wire fixture는 이유 없이 재생성하지 않습니다.
- 비정상 종료 위험은 유효 상태 진입을 막아 검사하고 필요하면 자식 프로세스 timeout을 사용합니다.
- 테스트 이름·주석은 현재 용어를 쓰고 제거한 구현의 부재만 검사하지 않습니다.
- Knip 결과는 삭제 후보입니다. 공개 export·동적 import·script·browser·override를 대조하고 누락 entry를 보완합니다.
- legacy decoder·deprecated API·독립 BitPack 오라클·방어 검증은 참조 수·coverage만으로 삭제하지 않습니다.
- helper 통합 시 전용 타입·인자·import·주석을 함께 정리합니다.

## 변경별 검증

| 변경                                   | 검증                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| 설명·링크                              | 코드 대조·링크/앵커·배포물 포함 여부, `pnpm format:check`, `git diff --check`     |
| 실행 예제                              | 해당 예제 실행. dist가 오래됐으면 `pnpm build` 후 문서 검사                       |
| codec·옵션·소유권·오류                 | 실패 재현·관련 회귀·고정 벡터·property test 후 `pnpm verify`                      |
| export·타입·lazy import·번들           | packed ESM/CJS·NodeNext·정적 그래프와 `pnpm verify`. 웹 경로 변경은 browser smoke |
| BrowserAdapter·Web Streams·native 경로 | 관련 회귀·Node↔브라우저 호환, `pnpm verify`·`pnpm smoke:browser`                  |
| hot path·할당·크기                     | 동일 조건 전후 비교·출력 동치, `pnpm verify`·`pnpm bench:guard`·관련 benchmark    |
| 의존성·런타임·배포 구성                | 설치 정책·lockfile·exports·CI 검토, `pnpm verify`와 영향받는 런타임 검사          |

마지막 수정 상태에서 해당 검증을 마칩니다. 새 변경·실패·미해결 우려가 없으면 반복하지 않습니다.
`pnpm verify`는 format·typecheck·lint·Knip·build·coverage·size·pack·Node/web smoke를 실행합니다.
실제 브라우저·Bun/Deno·Node 호환 matrix·성능 가드는 별도입니다.

브라우저 변경은 native·강제 fallback·Node 상호 호환을 확인합니다.

```bash
pnpm exec playwright install chromium firefox webkit
pnpm build
pnpm smoke:browser
```

한 엔진은 `pnpm smoke:browser firefox`로 지정합니다. Linux CI는 설치에 `--with-deps`를 사용하고
Playwright 갱신 후 브라우저도 재설치합니다.

## 성능·크기·안전성

| 명령                      | 측정 대상·출력                                                |
| ------------------------- | ------------------------------------------------------------- |
| `pnpm bench`              | codec·Base64·압축 특성·최초/재사용 KDF, 3표본 중앙값          |
| `pnpm bench:latency`      | API·입력 크기·동시성별 p50/p95·관측 메모리·이벤트 루프, JSONL |
| `pnpm bench:micro [이름]` | primitive/codec 지정 경로, 3표본 중앙값                       |
| `pnpm bench:guard`        | 융합 매핑·DDU·난독화의 고정 처리량 하한                       |

이전 배포물은 무결성을 확인해 추출하고, 소스 비교는 같은 lockfile·런타임에서 다른 CPU 부하 없이 실행합니다.

```bash
node --expose-gc --import tsx benchmarks/compare-obfuscation.ts <이전-package-디렉터리>
node --expose-gc --import tsx benchmarks/compare-codec.ts <수정전-소스-디렉터리>
node scripts/verify-compat.mjs <이전-package-디렉터리>
```

`verify-compat.mjs`의 기준은 공식 npm 6.2.0이며 다른 버전은 import 전에 거부합니다.
기준 변경 시 공개 표면·charset·압축·암호화·stream 검사 범위도 갱신합니다.

- 입력·반복 횟수·런타임·소스/lockfile 식별자와 분모를 기록합니다. 원문 바이트·UTF-8 출력·UTF-16 길이를 구분합니다.
- codec 왕복 처리량은 원문 바이트, ASCII unpack은 인코딩 문자 수 기준입니다. footer suffix 연산은 호출 시간으로 비교합니다.
- `bench:latency`는 최소 20표본, `compare-codec`은 최소 9표본입니다. 경험적 p95는 지연 보장이 아니며 `compare-codec`은 배치 평균의 백분위수입니다.
- `compare-codec` 소스 해시는 난독화·native Base64·codecUtils의 결합값입니다. 전체 커밋 해시가 아니며 청크·cold-layer는 시간만 기록합니다.
- 최초 KDF는 새 인스턴스, 재사용은 같은 인스턴스에서 측정합니다. cold import는 프로세스 시작 비용을 제외하고 cold-layer는 생성자와 첫 호출을 포함합니다.
- 관측 heap·external·arrayBuffers는 실제 peak RSS를 보장하지 않습니다. GC·타이머 범위를 명시하고 작은 변동을 전체 개선율로 주장하지 않습니다.
- 번들은 초기 정적 그래프와 전체 lazy 그래프를 구분합니다. 예산 변경 전 같은 lockfile·지원 Node에서 세 번 이상 측정합니다.
- 크기 변동 1% 이내는 기존 예산을 유지하고 도구 변동으로 지속 실패할 때만 3–5% 여유의 근거를 기록합니다.
- runtime dependency 0개를 유지합니다. 추가는 표준 API로 해결할 수 없고 번들·유지보수·공급망 비용을 정량화한 경우에만 검토합니다.
- 복사·검증·KDF 강도를 줄이는 최적화는 [안전 계약](docs/REFERENCE.md#보안-경계)을 보존해야 합니다.

## 호환성·릴리스

- 의도된 API·wire·KDF·export 비호환 변경은 major에서 수행합니다. 계약 복원도 기존 데이터·오류 영향과 이행을 확인합니다.
- 공개 API 제거는 먼저 deprecated와 대체 경로를 제공합니다.
- npm에는 실행 파일·타입·README·CHANGELOG·REFERENCE·LICENCE만 포함합니다. 설계 결정·작업 목록·개발 지침·테스트·benchmark·source map은 저장소에 둡니다.
- 최소 Node·기본 검증 LTS·호환 matrix를 함께 검토합니다. Bun/Deno의 root browser 조건과 secure Node 조건을 구분합니다.

현재 미완료 상태는 [TASKS](docs/TASKS.md)에 기록하며 다음 순서로 출시합니다.

1. **배포 설정:** npm Trusted Publisher의 실제 owner/repository·workflow/environment와 GitHub environment 권한·보호 설정을 대조합니다.
   redirect만으로 설정 갱신을 판단하지 않으며 Node/npm의 [OIDC 요구 버전](https://docs.npmjs.com/trusted-publishers/)을 확인합니다.
2. **출시 문서:** Unreleased를 실제 버전·날짜로 옮기고 README·REFERENCE·package version을 맞춥니다.
3. **출시 SHA:** 최종 커밋에서 `pnpm verify`·`pnpm bench:guard`·`pnpm smoke:browser`를 확인합니다.
4. **원격 CI:** 같은 SHA의 Node 24 전체 검사·Node 22/26·Bun/Deno·세 브라우저 성공을 확인합니다.
5. **게시:** package version과 같은 `vX.Y.Z` 태그를 해당 SHA에 연결합니다. 정식 Release 게시가
   [배포 workflow](.github/workflows/publish.yml)를 실행하므로 문서·검증·태그를 먼저 확정합니다.
6. **설치 확인:** npm 게시 후 ESM/CJS·NodeNext 타입·browser·공개 진입점을 설치 검사하고 TASKS를 갱신합니다.
   workflow의 `npm publish --ignore-scripts`는 선행 검증을 마친 배포 단계입니다.
