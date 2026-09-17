# 범위·설계 결정 기록

이 문서는 제품의 전제, 구조 선택, 확인된 최적화와 재검토 조건을 기록한다.
기존 데이터의 디코딩 호환성과 zero-dependency 경량성을 우선한다. 코드 작성·검증 절차는
저장소의 `CONTRIBUTING.md`, 에이전트의 핵심 지침·문서 탐색은 `AGENTS.md`, 사용자 계약은
[REFERENCE](REFERENCE.md)에서 관리한다.

최근 구조 검토일은 **2026-09-15**, 코드 기준은 `95d6ad8`이다. 패키지 버전은 6.1.2이며
이후 변경은 CHANGELOG의 `Unreleased`에 있으므로, 아래 구현 현황을 npm에 배포 완료된 기능으로
해석하지 않는다. 시점에 따른 검증 결과와 앞으로 유지할 규칙을 구분한다.

## 제품 범위

이 프로젝트가 해결하는 핵심 문제는 인코더와 디코더를 함께 통제하는 환경에서 한글 또는
커스텀 charset으로 데이터를 가역 표현하는 것이다. 기존 ddunigma 데이터 호환, 시각적
난독화, Node.js와 웹 런타임의 동일한 codec 계약이 제품 가치다.

설계에는 다음 전제가 있다.

- 송수신 양쪽이 같은 프리셋, charset, 버전과 외부 KDF 설정을 공유한다.
- 비표준 출력 형식과 UTF-8 전송 크기 증가를 사용자가 수용한다.
- 일반 payload는 명시된 메모리 상한 안에 들어오며, 무제한 스트리밍은 목표가 아니다.
- 난독화와 CRC32를 보안 경계로 사용하지 않는다.
- 키 관리, 위협 모델, 인증 프로토콜은 애플리케이션이 소유한다.

따라서 표준 상호운용, 최소 전송량, 인증 토큰, 키 envelope, 대용량 프레임 스트리밍은
이 라이브러리의 주목적이 아니다.

도입·유지 여부는 커스텀 표현이나 기존 ddunigma 데이터 호환이 실제 요구인지에 달려 있다.
이 요구가 없으면 표준 Base64가 더 단순하다. 압축·암호화의 통합 편의는 부가 가치이며,
그 자체를 이유로 별도 보안 프로토콜이나 영구 포맷을 늘리지 않는다.

## 구조 평가

| 관점        | 현재 선택과 이점                                                        | 비용·검토 기준                                                            |
| ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 공개 API    | root·browser·core·secure의 4개 진입점으로 일반 사용과 직접 주입 지원    | export·타입·런타임별 계약을 함께 유지                                     |
| 내부 구조   | core 계약, sync/async pipeline, 플랫폼 adapter, 난독화, streams를 분리  | 단일 전달 함수와 전용 옵션 타입까지 관성적으로 분리하지 않음              |
| 로딩·배포물 | 기본 경로의 adapter·streams를 지연 로드하고 runtime dependency 0개 유지 | 총 lazy 그래프와 최초 정적 그래프를 별도 측정                             |
| 호환성      | 기존 charset·V2/V3/V4·checksum·DDS1 데이터 유지                         | 파서 단순화보다 고정 벡터와 인증 경계 우선                                |
| 시간·메모리 | 네이티브 Base64, 융합 매핑, 한정 크기 임시 버퍼 활용                    | 한글 UTF-8 출력 증가와 축적 스트림의 전체 작업 메모리는 여전히 존재       |
| 유지보수    | 회귀·property·패키지·실제 브라우저 검증을 역할별로 운영                 | 도구 통과만으로 외부 소비자나 모든 브라우저 버전의 호환성을 보장하지 않음 |

현재 규모에서 추가 계층, monorepo, 빌드 도구 교체가 필요하다는 근거는 확인되지 않았다.
실제 결함과 할당 비용을 기존 책임 경계 안에서 해결하는 방향을 유지한다.

---

## 신규 KDF envelope·DDS2 - 제외

두 기능은 배포 전 실험을 철회했으며 현재 구현·재도입 대상이 아니다.

| 제외 기능                                      | 이유                                                                                  | 현행 지원                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 자기기술 KDF envelope (`encryptionVersion: 5`) | 영구 암호문 포맷과 salt 인증·다운그레이드·KDF 노후화 대응 책임이 codec 범위를 넘는다. | V4 AES-GCM과 호출자가 관리하는 KDF 설정 유지    |
| 프레임드 스트리밍 (`DDS2`)                     | 영구 호환성뿐 아니라 nonce/AAD·절단·재정렬·교차스트림 방어 책임이 추가된다.           | DDS1 Web Streams와 명시적인 축적 입력 한도 유지 |

대용량 프레이밍과 키 수명 관리는 애플리케이션 또는 전용 도구가 담당한다.
기존 Web Streams의 축적 조건은 [API reference](REFERENCE.md#web-streams)에 명시한다.
현행 스코프 체크섬 마커 `CK`(과거 “v5 체크섬”)는 제외된 KDF envelope와 별개이며 유지한다.

---

## secure 진입점 - 현행 기능 유지

`@ddunigma/node/secure`의 압축(deflate/brotli), AES-256-GCM, CRC32, Web Streams는 기존
공개 계약이므로 유지한다. V4 payload와 DDS1 header를 바꾸거나 새 영구 포맷을 추가하지 않는다.

root와 `/browser`는 같은 core 인스턴스에 필요한 adapter만 지연 주입한다. 첫 동시 요청은
초기화 Promise를 공유하고, 주입된 adapter/factory를 우선한다. `Ddu64.create()`는 명시적
eager 경로이며 Node에서는 준비 후 동기 secure 호출이 가능하다. 브라우저 압축·암호화는
계속 비동기로 실행한다. `/secure`의 정적 adapter·stream 함수 export는 기존 사용자를 위한
표면이고, `/core`는 구체 adapter와 난독화 구현을 포함하지 않는 직접 주입용 표면이다.

`/secure`는 기능 묶음의 이름이다. 키 저장·교환·회전, 사용자 인증, 암호문 수명주기는
애플리케이션이 담당한다. 상세 진입점 계약은 [REFERENCE](REFERENCE.md#진입점)를 따른다.

---

## 확인된 최적화 현황

| 영역           | 적용한 내용                                                                   | 보존한 계약과 검증 근거                                               |
| -------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| footer·charset | 숫자·반복 패딩과 선택 마커 충돌 수정, 최종 fallback 프로필 반영               | 정상 암호문 고정 벡터, 변조 거부, 두 자리 paddingBits 검사            |
| 비동기 입력    | 지연 사용 입력·호출 옵션·생성자 배열·salt·alphabet 보존                       | 버퍼·옵션 변경과 ArrayBuffer transfer 회귀 검사                       |
| 문자열 통계    | UTF-8 변환과 `originalSize` 기록을 기존 encode pipeline에서 한 번 처리        | 원문 바이트 단위·Unicode·callback·사용자 난독화 계약 유지             |
| 비트 매핑      | 비트 패킹과 문자열 매핑 융합, 표준 Base64에서 네이티브 경로 사용              | 독립 raw BitPack 오라클, 고정 벡터, property test, 강제 fallback 검사 |
| 임시 버퍼      | 난독화 코드 유닛 버퍼를 최대 8,192개로 제한, non-pow2는 실제 출력 크기로 할당 | 전체 위치 기준 매핑과 배치 경계 보존                                  |
| AES·스트림     | Node AES 중간 concat 제거, 스트림 결합 후 청크 참조 해제와 실패 상태 정리     | 인증 완료 후 결과 반환, 독립 결과 버퍼, write 완료 후 입력 재사용     |
| 코드·문서      | 단일 footer 중계 함수·전용 타입·기본값 객체 제거, decode transform 동기화     | 공개 Promise·override 유지, BOM·구분자·진행률·예제 설명 수정          |

통계의 8MiB 문자열 입력에서는 내부 UTF-8 배열의 추가 8MiB 복사 한 번을 제거했다.
이는 할당·복사 감소이며 최대 RSS 감소량과 같다는 뜻은 아니다. 기존 전후 시간 측정 차이는
표본 변동에 비해 작아 일반적인 속도 개선율로 제시하지 않는다.

`95d6ad8`에 포함된 구현의 앞선 검증 기록은 Node 24.13.0에서 `pnpm verify` 통과,
29개 파일·1,115개 테스트 통과다. Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6의
실제 엔진 smoke와 성능 가드 6개도 통과했다. 이 기록은 문서 갱신 시 재실행한 결과가 아니며,
Node 22·26와 Bun·Deno는 이 로컬 검증 결과에 포함하지 않는다.

성능 비교 명령·측정 기준은 `CONTRIBUTING.md`에서 관리한다. 과거 단일 환경의 속도나
bundle 크기를 현재의 보장값으로 고정하지 않는다.

## 최적화 보류와 재검토 조건

| 후보                               | 현재 유지하는 이유                                      | 다시 검토할 조건                                          |
| ---------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `decode` 사전 검증 제거            | 잘못된 입력을 byte decode override에 전달하지 않는 계약 | 오류 타입·순서와 override 동치성을 함께 입증              |
| `getStats` 전면 산술식 치환        | 사용자 난독화 길이·callback·압축·오류 동작 존재         | 실제 통계 계약을 유지하는 범위와 이득을 입증              |
| WebCrypto 키 객체 참조 캐시        | 같은 `Uint8Array`의 변경된 키 바이트도 반영해야 함      | 변경 가능한 키 입력을 구별하는 계약과 측정 근거 확보      |
| 스트림 내부 codec 우회·일괄 동기화 | 공개 비동기 override를 유지해야 함                      | override·옵션·오류 순서를 보존한 채 복사 또는 대기를 줄임 |
| 역난독화 배치 변환                 | 사용자 alphabet과 기존 오류 동작을 함께 보존해야 함     | 큰 입력에서 메모리·시간 이득과 배치 경계 동치성 입증      |

미사용 내부 중계 코드와 공개 호환 코드를 구분한다. 공유 sync/async 검증 함수, 구버전 decoder,
raw BitPack 오라클, 방어 검증과 deprecated 공개 API는 호환성과 독립 검증을 위해 유지한다.

## 배포물과 크기 정책

- npm package에는 실행 파일, 타입, README, CHANGELOG, API reference와 이 결정 기록을 포함한다.
- `AGENTS.md`, `CONTRIBUTING.md`, 테스트, benchmark, source map은 개발 저장소에만 둔다.
- 진입점별 brotli 크기 예산은 최소 경로와 adapter 활성화 경로를 구분해 유지한다.
- root의 lazy 기능은 모든 선택 청크를 포함한 총량과 초기 정적 import 그래프를 별도로 제한한다.
- 예산 조정의 측정 절차는 `CONTRIBUTING.md`에 둔다. 바이트 절감만을 위해 책임 경계를 흐리거나
  불필요한 helper를 추가하지 않는다.

## 런타임 지원 정책

- 지원 중인 LTS에서 전체 검증하고 최소 지원 버전은 별도 matrix로 유지한다. 최소 버전은
  `package.json#engines`, 실행 범위는 CI workflow를 기준으로 관리한다.
- 현재 기본 검증은 Node 24, 호환 matrix는 Node 22·26이다. Chromium·Firefox·WebKit smoke는
  Node/Bun/Deno에서 browser entry를 실행하는 smoke와 별도 CI 작업으로 유지한다.
- Bun과 Deno는 root의 browser 조건과 `/secure`의 Node 호환 조건을 각각 검증한다. Web API
  경로를 명시하려는 사용자는 `/browser`를 선택한다.
- Node 전환은 API·wire 변경과 분리하며 CI와 배포 workflow를 함께 갱신한다.

## 최근 공식 동향과 적용 판단

2026-09-15 공식 자료를 기준으로 검토했다. 아래의 적용 판단은 해당 자료와 현재 코드·설정을
비교한 프로젝트의 결정이며, 도구를 최신 버전으로 일괄 교체하라는 의미가 아니다.

| 공식 자료에서 확인한 변화·지침                                                                                                                                                                      | 이 프로젝트의 판단                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [TC39 Uint8Array Base64](https://github.com/tc39/proposal-arraybuffer-base64)는 Stage 4로 표준에 포함                                                                                               | 이미 적용한 기능 탐지와 표준 alphabet fast path 유지. 최소 런타임 지원을 위해 fallback과 사전 입력 검증 유지               |
| [Node 릴리스 일정](https://github.com/nodejs/Release)은 현재 24 Active LTS, 22 Maintenance LTS, 26 Current                                                                                          | Node 24 전체 검증, 22·26 호환 matrix 유지. 짝수 버전이면 항상 LTS라는 가정 대신 공식 일정을 확인                           |
| [TypeScript 번들 지침](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options#considerations-for-bundling-libraries)은 번들 JS·선언 파일과 소비자 해석의 일치를 요구 | tsup의 ESM/CJS·선언 번들을 유지하고 packed NodeNext 소비자를 검증. 추세만으로 CJS 제거·컴파일러 설정 전면 전환을 하지 않음 |
| [Playwright](https://playwright.dev/docs/browsers)는 버전별 브라우저 바이너리와 Chromium·Firefox·WebKit 실행을 지원                                                                                 | JS 런타임 smoke와 실제 엔진 검증을 구분하고, 버전 갱신 시 바이너리도 함께 갱신                                             |
| [Streams 표준](https://streams.spec.whatwg.org/#ts-model)은 변환기의 readable/writable queue와 backpressure를 정의                                                                                  | 내부에서 별도로 축적하는 payload까지 자동 제한된다고 가정하지 않음. DDS1 축적 한도와 전체 작업 메모리를 구분               |
| [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)은 OIDC와 조건부 자동 provenance를 제공                                                                                         | 기존 GitHub Actions OIDC 흐름 유지. npm CLI ≥11.5.1·Node ≥22.14 요구와 실제 저장소의 외부 publisher 설정을 별도 확인       |

표준 API 활용과 호환성 검증 강화는 현재 구조에 맞는다. 새로운 wire format, 보안 프로토콜,
플랫폼 계층의 추가는 제품 가치와 측정된 비용 개선이 있을 때만 판단한다.

## 남은 유지보수 확인 사항

2026-09-15 로컬 `origin`은 `keyConvert/ddunigma-node`이고, `package.json`의
repository/homepage/bugs와 README 개발 문서 링크는 `parkjh2568/ddunigma-node`를 가리킨다.
주소 불일치는 확인했지만 저장소 이전·fork 여부와 npm 외부 Trusted Publisher 설정은 확인되지 않았다.

배포 전에 실제 workflow가 실행되는 저장소를 기준으로 메타데이터·문서 링크·publisher identity를
대조해야 한다. 이전이 확인되면 해당 항목을 함께 갱신하고 이 확인 사항을 완료 기록으로 옮긴다.
외부 설정을 읽지 않은 상태에서 배포 인증이 정상이라고 단정하거나 owner를 자동 치환하지 않는다.

## 다음 major 검토 항목

다음 항목은 현재 버전에서 작업하지 않으며 major 릴리스의 호환성 검토 대상으로만 남긴다.

- deprecated `PlatformAdapter.randomBytes` 제거
- `/secure` 이름의 오해를 줄일 별칭 또는 진입점 명칭 검토
- 이미 파생된 키를 받는 저수준 API가 실제 사용 사례와 책임 경계를 단순화하는지 검토
- Node `/secure`에서 브라우저 전용 클래스·어댑터를 계속 export할 필요가 있는지 검토
- 최소 Node 버전 재평가 (기본 CI LTS 전환은 현재 호환 범위에서 별도 진행)

새 KDF envelope, 새 wire format, DDS2, WASM, Worker 기반 병렬화는 구체적인 사용 사례와
유지보수 예산이 새로 입증되지 않는 한 도입하지 않는다.
