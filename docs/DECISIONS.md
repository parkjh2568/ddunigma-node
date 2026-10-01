# 범위·설계 결정 기록

기존 ddunigma 데이터 호환성과 runtime dependency 0개를 우선한다. 사용자 계약은
[REFERENCE](REFERENCE.md), 개발·검증 절차는 저장소의 `CONTRIBUTING.md`와 `AGENTS.md`에서 관리한다.
구조 검토 기준은 2026-09-22, 오류 경계 보완은 2026-09-30이다. 기준 배포는 `f4eef3d`의
6.2.0(2026-09-17)이며 현재 6.3.0 작업 트리는 미배포 상태다.

## 제품 범위

인코더와 디코더를 함께 통제하면서 한글·커스텀 charset으로 데이터를 가역 표현하는 codec이다.
송수신 양쪽은 preset·charset·버전·외부 KDF 설정을 공유하고, 비표준 출력과 UTF-8 크기 증가를 수용한다.
난독화와 CRC32는 보안 경계가 아니며 키 관리·위협 모델·인증 프로토콜은 애플리케이션이 소유한다.

커스텀 표현이나 기존 데이터 호환이 필요하지 않으면 표준 Base64가 더 단순하다. 압축·암호화
통합만을 이유로 새 영구 포맷을 늘리지 않는다. 표준 상호운용, 최소 전송량, 인증 토큰,
키 envelope와 무제한 프레임 스트리밍은 주목적이 아니다. 일반 payload는 명시한 입력 한도 안에서 처리한다.

## 구조 평가

- root·browser·core·secure의 공개 API는 export·타입·실행 동작을 함께 검증한다.
- core 계약, sync/async pipeline, 플랫폼 adapter, 난독화, streams의 책임을 분리한다.
  단일 중계 함수·전용 옵션 타입을 관성적으로 추가하지 않는다.
- 기본 경로는 adapter·streams를 지연 로드한다. 전체 lazy 그래프와 초기 정적 그래프를 별도로 측정한다.
- charset·V2/V3/V4·checksum·DDS1은 고정 벡터와 인증 경계를 기준으로 유지한다.
- 네이티브 Base64·융합 매핑·한정 임시 버퍼를 사용해도 한글 출력 증가와 축적 스트림의 전체 작업 메모리는 남는다.
- 회귀·property·packed consumer·실제 브라우저 검증을 구분한다. 도구 통과는 모든 소비자·브라우저의 호환성 증명이 아니다.

현재 추가 계층·monorepo·빌드 도구 교체의 근거는 없다. 결함과 할당 비용은 기존 책임 경계 안에서 해결한다.

## 신규 KDF envelope·DDS2 - 제외

배포 전 실험을 철회한 두 기능은 재도입 대상이 아니다. 자기기술 KDF envelope
(`encryptionVersion: 5`)는 salt 인증·다운그레이드·KDF 노후화와 영구 호환 책임을 추가한다.
DDS2는 nonce/AAD·절단·재정렬·교차스트림 방어까지 필요하다. 모두 codec 범위를 넘는다.

현행 V4 AES-GCM·외부 KDF 설정·DDS1 축적 한도를 유지한다. 대용량 프레이밍과 키 수명은
애플리케이션 또는 전용 도구가 담당한다. 스코프 checksum `CK`(과거 “v5 체크섬”)는 이 제외 기능과 별개다.

## secure 진입점 - 현행 기능 유지

`/secure`의 deflate/brotli·AES-256-GCM·CRC32·Web Streams와 정적 adapter/stream 함수
export는 공개 계약이다. V4 payload·DDS1 header를 바꾸거나 새 포맷을 추가하지 않는다.

root·`/browser`는 같은 core에 필요한 adapter를 주입하고 첫 동시 초기화 Promise를 공유한다.
명시한 adapter/factory가 자동 구현보다 우선한다. `Ddu64.create()`는 eager adapter 준비 경로이며
Node의 동기 secure 호출을 허용한다. 브라우저 압축·암호화는 계속 비동기다. `/core`는 구체
adapter·난독화 구현을 포함하지 않는 직접 주입용 표면이다.

`/secure`라는 이름은 기능 묶음이며 키 저장·교환·회전, 사용자 인증이나 암호문 수명 관리를 대신하지 않는다.

## 간편 API — 기존 계약을 유지하는 추가 표면

root·`/browser`의 `createDdu`는 생성 시 정책과 text/bytes 반환 종류를 고정하고 두 메서드를
항상 Promise로 반환한다. 기존 `Ddu64.encode(): string`의 변경 대신 named export를 추가했다.
호출별 정책을 상태로 저장하지 않아 동시 호출끼리 설정을 바꾸지 않는다.

작은 팩토리는 기존 wrapper 파일에 두고 core·adapter 계층을 추가하지 않는다. 기존 비동기
pipeline을 바로 호출하므로 앞에 await나 입력 복사를 추가하지 않는다. 기존 생성자·sync/async·
override·wire 계약은 유지한다. Promise 반환을 별도 스레드 실행으로 설명하지 않는다.

## 확인된 최적화 현황

- footer·charset: 숫자/반복 패딩, 선택 마커 충돌과 최종 fallback 프로필을 고정 벡터·변조 거부·두 자리 paddingBits로 검증한다.
- 비동기 입력: 지연 사용 바이트·호출 옵션·생성자 배열·salt·alphabet을 보존하고 변경·transfer 회귀로 확인한다.
- 통계: 문자열 UTF-8 변환과 originalSize 기록을 한 번 수행한다. 8MiB 입력의 추가 8MiB 복사 제거는 peak RSS 절감량과 다르다.
- 비트 매핑: pack/unpack과 문자 매핑을 융합한다. 표준 Base64 fast path는 독립 BitPack 오라클·고정 벡터·property·강제 fallback으로 검증한다.
- 임시 버퍼: 난독화 코드 유닛을 최대 8,192개로 제한하고 non-pow2는 실제 출력 크기로 할당한다. 전체 위치와 배치 경계는 유지한다.
- AES·스트림: 중간 concat을 없애고 결합 후 청크 참조를 해제한다. 인증 후 반환·독립 결과 버퍼·write 완료 후 재사용을 보존한다.
- 내부 정리: 단일 footer 중계·전용 타입·기본값 객체를 제거하고 decode transform을 동기화했다. 공개 Promise·override·BOM·구분자·진행률은 유지한다.

과거 시간 차이가 표본 변동보다 작았던 작업을 일반 속도 개선율로 제시하지 않는다. 재현 명령은
`CONTRIBUTING.md`, 상세 측정·채택 기록은 저장소의 `docs/TASKS.md`에 둔다.

## 6.3.0 최적화 판단

역난독화의 문자열 매핑 배열을 최대 8,192개로 제한했다. 공개 6.2.0 대비 9표본 교대 측정에서
큰 입력의 시간·관측 할당이 줄었고 출력·다중 코드 유닛 alphabet·오류 위치를 보존했다.
전체 codec 속도나 peak RSS 보장은 아니다.

`setFromBase64`·`encodeInto`는 목적지 확보·복사를 포함할 때 엔진별 이득이 달라 보류했다.
CryptoKey 참조 캐시는 가변 키·보관 수명 책임을 늘리며 이득도 일관되지 않았다. 스트림 복사는
입력 보존·public override 때문에 유지한다. Worker는 실제 지연 목표가 정해진 뒤 검토한다.

## 최적화 보류와 재검토 조건

- decode 사전 검증 제거: 잘못된 입력을 byte decode override에 전달하지 않는 계약과 오류 순서·타입을 함께 입증해야 한다.
- getStats 산술식 치환: 사용자 난독화 길이·callback·압축·오류 계약을 유지하면서 이득을 보여야 한다.
- WebCrypto 키 캐시: 변경 가능한 키 입력을 구별하는 계약과 측정 근거가 필요하다.
- 스트림 codec 우회·일괄 동기화: 공개 async override와 옵션·오류 순서를 보존한 상태에서 복사·대기를 줄여야 한다.

구버전 decoder·공개 deprecated API·raw BitPack 오라클·방어 검증은 참조 수만으로 제거하지 않는다.

## 오류 경계 선택

진행률 callback은 기존 void/sync 계약을 유지한다. Promise/thenable은 InvalidInput으로 거부하고
rejection을 관측한다. 스트림은 intrinsic typed-array 검사와 detached 검증 후 길이를 읽는다.
다문자 구분자는 삽입 후 복원이 원문과 같은지 확인해 경계 중첩을 거부한다.

생성·연산·stream 경계는 기존 오류 정규화를 공유한다. 오류 protocol의 비열거 Symbol.for 표식은
ESM/CJS 식별을 연결하며 이름만 같은 객체를 신뢰하지 않는다. 인증 결과 반환·wire 포맷은 그대로다.

## 배포물과 크기 정책

npm에는 실행 파일·타입·README·CHANGELOG·REFERENCE·이 문서를 포함한다. AGENTS·CONTRIBUTING·
테스트·benchmark·source map은 저장소에 둔다. 진입점별 brotli와 전체/초기 그래프 예산을 유지한다.
측정 절차는 CONTRIBUTING에 둔다. 바이트 절감 때문에 책임 경계를 흐리거나 불필요한 helper를 추가하지 않는다.

## 런타임 지원 정책

최소 버전은 package.json engines, 실행 범위는 CI를 따른다. 현재 Node 24 전체 검증과
22·26 호환 matrix를 유지한다. Bun·Deno는 root의 browser 빌드와 `/secure` Node 조건을 검증한다.
Web API 경로를 고정하려면 `/browser`를 선택한다. 실제 Chromium·Firefox·WebKit 검증은
Node/Bun/Deno의 browser entry smoke와 별개다. Node 전환은 API·wire 변경과 분리해 CI·배포 설정을 함께 갱신한다.

## 최근 공식 동향과 적용 판단

2026-09-15 검토 자료의 적용 판단이다. 도구를 최신 버전으로 일괄 교체하라는 의미는 아니다.

- [TC39 Base64](https://github.com/tc39/proposal-arraybuffer-base64): Stage 4. 표준 alphabet의 기능 탐지·fallback·입력 검증 유지.
- [Node 일정](https://github.com/nodejs/Release): 공식 지원 단계에 맞춰 matrix 유지. 짝수 버전만으로 LTS라 판단하지 않음.
- [TypeScript 번들 지침](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options#considerations-for-bundling-libraries): ESM/CJS 선언과 packed NodeNext 소비자 검증.
- [Playwright](https://playwright.dev/docs/browsers): 실제 엔진 검사와 JS runtime smoke 구분, 패키지 갱신 시 바이너리도 갱신.
- [Streams](https://streams.spec.whatwg.org/#ts-model): backpressure는 내부 payload 축적 한도가 아니며 DDS1 입력 한도와 작업 메모리 구분.
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/): OIDC·조건부 provenance 유지. CLI ≥11.5.1·Node ≥22.14와 외부 publisher identity 별도 확인.

## 남은 유지보수 확인 사항

2026-09-22 공개 metadata에서 keyConvert/ddunigma-node가 parkjh2568/ddunigma-node로 연결되고
fork가 아니며 npm 6.2.0 gitHead가 f4eef3d와 일치함을 확인했다. tarball SHA-512도 확인했다.
canonical metadata·README 링크는 유지한다.

npm Trusted Publisher·GitHub environment npm 권한은 공개 metadata로 확인하지 못했다.
배포 전 실제 저장소·publish.yml·environment npm을 계정 설정과 대조한다. URL redirect는 OIDC 설정의 증거가 아니다.

## 다음 major 검토 항목

현재 작업 범위 밖이다: deprecated PlatformAdapter.randomBytes 제거, `/secure` 별칭·명칭,
파생 키 직접 입력 API, Node secure의 browser 클래스·adapter export, 최소 Node 버전 재평가.
CI LTS 전환은 현재 호환 범위에서 별도로 진행한다.

새 KDF envelope·wire 포맷·DDS2·WASM·Worker 병렬화는 구체적 사용 사례와 유지보수 예산이 입증되기 전 도입하지 않는다.
