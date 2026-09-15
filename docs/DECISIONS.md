# 범위·설계 결정 기록

이 문서는 구현 예정 목록이 아니라 이미 검토한 범위와 향후 변경 판단 기준을 기록한다.
핵심 원칙은 신규 영구 wire format을 무리하게 추가하지 않고, 기존 데이터의 디코딩
호환성과 zero-dependency 경량성을 우선하는 것이다.

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

> 결정: **`@ddunigma/node/secure`의 압축(deflate/brotli) + AES-256-GCM 암호화 + CRC32 체크섬 +
> Web Streams를 전부 유지한다.** KDF envelope와 DDS2를 "신규 영구 wire 포맷 추가 + 장기 보안
> 책임"을 이유로 제외한 것과 달리, secure의 현행 기능들은 **이미 존재하는 안정된 표면**이며 신규
> 영구 포맷을 늘리지 않는다(V4 페이로드/DDS1 스트림 헤더 불변). 따라서 분리·폐기 없이 전부
> 유지한다.
>
> 진입점 구성은 4종으로 고정한다. 기본 `@ddunigma/node`와 `/browser`는 codec·체크섬·난독화를
> 동기로 처리하고, 비동기 압축·암복호화가 실제 실행될 때만 현재 core에 플랫폼 adapter를 동적
> import·주입한다. Web Streams도 인스턴스 메서드 호출 시 구현을 지연 로드한다. Node root의
> `Ddu64.create()`는 adapter를 먼저 준비해 동기 secure 호출을 제공한다. `/secure`는 adapter와
> 기존 Web Streams 함수 export를 정적으로 쓰는 고급·호환 표면이고, `/core`는 구체 adapter와
> 난독화 구현을 포함하지 않는 직접 주입용 표면이다. 이 구조는 단일 root API의 편의성과 미사용
> 기능의 정적 번들 비용 회피를 함께 유지한다.
>
> 비고: root의 lazy adapter는 별도 secure 인스턴스를 만들지 않으며 첫 동시 import Promise를
> 공유한다. 동기 생성자에서 동적 import를 기다릴 수 없으므로 eager 경로는 비동기
> `Ddu64.create()`로 분리한다. `/secure`는 동기 생성과 저수준 함수·adapter export가 필요한
> 기존 사용자를 위해 유지한다. 신규 기능은 wire format·정적 import 그래프·size-limit에 미치는
> 영향을 함께 검토한다.
>
> `/secure`라는 이름은 기능 묶음을 뜻한다. 키 저장·교환·회전, 사용자 인증, 암호문 수명주기를
> 포함한 완결된 보안 프로토콜이라는 의미로 확장 해석하지 않는다.

---

## 인코딩 성능 최적화 - 완료 (출력 불변)

> `encoding-perf-optimization` 스펙으로 한글/커스텀 charset hot path를 최적화했다. `bitLength 6/8`
> 직접 매핑 언롤 융합으로 인코드 `packPow2ToString` ~40→~183 MiB/s(약 4.5x), 디코드
> `unpackPow2FromString` ~150→~420 MiB/s 개선(각각 입력 바이트/인코딩 ASCII 문자 기준).
> **출력 바이트·wire format은 100% 불변**이며
> 동치 오라클(raw `bitPackEncode`/`bitPackDecode`)·고정 벡터·property 테스트로 고정된다.
>
> 표준 Base64 알파벳은 네이티브 fast path(`Uint8Array.toBase64`/`fromBase64`)로 가속한다.
> 한글 charset과 Base64는 UTF-8 출력 크기가 다르므로 원문 바이트 기준 처리량과 결과 크기를
> 함께 비교한다. 속도 차이는 런타임·입력·구현에 따라 측정하며, 남은 비트 패킹 최적화는
> 현재 측정 범위에서 한계효용이 낮아 보류한다. 난독화 문자열 생성,
> 버퍼 복사, 작은 입력의 할당과 초기화 비용은 별도로 측정해 판단한다.

---

## 할당 최적화와 호환 경계

- 난독화는 최대 8,192개 코드 유닛 버퍼를 재사용한다. 위치 계산은 전체 문자열 기준으로
  유지하며, 배치 경계·오류 입력·기존 wire 벡터를 함께 검증한다.
- Node AES-GCM은 `update`/`final` 결과를 독립 결과 버퍼로 직접 복사한다. `final`의 인증
  검증 전에는 복호화 결과를 반환하지 않는다.
- non-pow2 문자열 생성 버퍼는 실제 심볼 수로 제한한다. DDU_V1 64바이트 입력의 임시
  코드 유닛 버퍼는 16KiB에서 344바이트로 줄어든다.
- async codec은 await를 넘기는 입력 바이트와 호출 옵션을 보존한다. 동기 완료되는 평문 경로에
  불필요한 입력 복사를 추가하지 않으며, 스트림은 합친 버퍼가 준비되면 원래 청크 참조를 해제한다.
- 통계도 입력을 파이프라인에 그대로 전달한다. 문자열은 내부에서 UTF-8로 한 번 변환하고
  압축·암호화 전에 원문 크기를 기록해, 내부 배열의 중복 snapshot과 await 이후 크기 변화를 피한다.

2026-09-08 로컬 측정: Node 24.13.0의 `pnpm bench:micro` 3표본 중앙값,
Chromium 148의 수정 전후 교대 실행 3표본 중앙값. 아래는 1Mi 문자 또는 1MiB 입력당 ms이며,
전체 애플리케이션이나 다른 엔진의 성능을 보장하는 수치가 아니다.

| 경로                       | 수정 전 | 수정 후 |
| -------------------------- | ------: | ------: |
| Node 난독화 단독           |   47.25 |   17.36 |
| Node DDU 난독화 인코딩     |  123.55 |   64.06 |
| Chromium 난독화 단독       |   34.48 |   12.74 |
| Chromium DDU 난독화 인코딩 |  136.12 |  102.48 |

다음 후보는 기존 계약을 유지하기 위해 이번 변경에서 적용하지 않는다.

- `decode`의 사전 검증: 하위 클래스의 byte decode override에 잘못된 입력을 전달하지 않는다.
- `getStats`의 전면 산술식 치환: 사용자 정의 난독화 결과 길이와 callback·오류 동작을 유지한다.
- WebCrypto의 키 객체 참조 캐시: 공개 adapter는 같은 `Uint8Array`의 변경된 키 바이트를 반영한다.
- 스트림의 일괄 동기화와 역난독화 배치 변환: 비동기 override 및 사용자 alphabet의 동작을
  보존하며, 별도 실험으로 이득과 동치성이 입증된 범위에서만 변경한다.

## 배포물과 크기 정책

- npm package에는 실행 파일, 타입, README, CHANGELOG, API reference와 이 결정 기록을 포함한다.
- `CONTRIBUTING.md`, 테스트, benchmark, source map은 개발 저장소에만 둔다.
- 진입점별 brotli 크기 예산은 최소 경로와 adapter 활성화 경로를 구분해 유지한다.
- root의 lazy 기능은 모든 선택 청크를 포함한 총량과 초기 정적 import 그래프를 별도로 제한한다.
- 도구 버전 차이로만 변하는 크기를 확인할 때는 동일 lockfile로 지원 Node 버전에서 세 번 이상
  측정한다. 1% 이내의 안정적인 결과에는 예산을 늘리지 않는다.
- 바이트 절감을 위해 도메인 경계를 흐리거나 단순 동기 코드를 불필요한 helper로 분리하지 않는다.

## 런타임 지원 정책

- 최소 Node 버전은 `package.json#engines`와 CI의 최저 버전에서 함께 관리한다.
- 기본 검증 버전은 지원 중인 LTS로 이동하되, 최소 지원 버전은 별도 호환 matrix에서 유지한다.
- 현재 기본 검증은 Node 24, 호환 matrix는 Node 22·26이다. Chromium·Firefox·WebKit smoke는
  Node/Bun/Deno에서 browser entry를 실행하는 smoke와 별도 CI 작업으로 유지한다.
- Bun과 Deno는 root의 browser 조건과 `/secure`의 Node 호환 조건을 각각 검증한다. Web API
  경로를 명시하려는 사용자는 `/browser`를 선택한다.
- Node 버전 전환은 API나 wire format 변경과 분리하고, CI와 배포 workflow를 같은 변경에서
  갱신한다.

## 다음 major 검토 항목

다음 항목은 현재 버전에서 작업하지 않으며 major 릴리스의 호환성 검토 대상으로만 남긴다.

- deprecated `PlatformAdapter.randomBytes` 제거
- `/secure` 이름의 오해를 줄일 별칭 또는 진입점 명칭 검토
- 이미 파생된 키를 받는 저수준 API가 실제 사용 사례와 책임 경계를 단순화하는지 검토
- Node `/secure`에서 브라우저 전용 클래스·어댑터를 계속 export할 필요가 있는지 검토
- 최소 Node 버전 재평가 (기본 CI LTS 전환은 현재 호환 범위에서 별도 진행)

새 KDF envelope, 새 wire format, DDS2, WASM, Worker 기반 병렬화는 구체적인 사용 사례와
유지보수 예산이 새로 입증되지 않는 한 도입하지 않는다.
