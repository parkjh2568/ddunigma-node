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

## 자기기술 KDF envelope - 제외

> 결정: **구현하지 않음.** opt-in(`encryptionVersion: 5`)으로 한 차례 구현했다가 되돌렸다.
> 이유: 자기기술 KDF envelope는 **인코딩 유틸리티의 정체성과 미스매치**다. 새로운 영구
> 암호화 wire 포맷을 추가하면 장기 보안 책임(salt 인증, nonce 유일성, 다운그레이드 방어,
> KDF 알고리즘 노후화 대응)을 라이브러리가 떠안게 되는데, 이는 본 라이브러리의 핵심 가치
> (zero-dependency 커스텀 charset 인코딩)와 맞지 않는다. 강한 키 파생이 필요한 사용처는
> 애플리케이션 레벨에서 전용 KDF/암호화 라이브러리를 쓰는 것이 옳다.
>
> 현행 암호화(AES-256-GCM + PBKDF2/sha256, 호출자 지정 `salt`/`iterations`)는 유지한다.
> 저엔트로피 키 사용 시 가이드는 README의 키 파생 섹션 참고(앱 고유 `salt` + 높은
> `iterations` 권장). 포맷 변경 없는 문서 수준 권고다.

---

## 프레임드 스트리밍 `DDS2` - 제외

> 결정: **구현하지 않음(제거 완료).** opt-in(`createFramedEncodeStream`/`createFramedDecodeStream`,
> `src/streams/FramedStreams.ts`)으로 한 차례 구현했다가 자기기술 KDF envelope와 같은 이유로
> 되돌렸다.
> 이유: 신규 영구 스트림 wire 포맷(`DDS2`)은 **경량 인코더 정체성과 미스매치**다. 한 번
> 릴리스하면 호환 부담이 영구이고, 프레임 nonce/AAD·절단·재정렬·교차스트림·다운그레이드
> 방어라는 **장기 보안 책임**을 라이브러리가 떠안게 된다. 이는 핵심 가치(zero-dependency
> 커스텀 charset 인코딩 + 경량 난독화)와 맞지 않는다. `DDS2`는 published(5.x) 전에 추가된
> 신규 표면이라 제거해도 기존 데이터 호환에 영향이 없다.
>
> 대용량 데이터는 애플리케이션 레벨에서 자체 프레이밍 후 `encode`/`decode`를 프레임마다
> 호출하거나, 전용 스트리밍/암호화 라이브러리를 쓰는 것이 옳다. 기존 비프레임 Web Streams
> (`createReadableEncodeStream`/`createReadableDecodeStream`)는 유지한다(2의 제곱수 charset +
> 압축/암호화/체크섬 미사용 시 청크 스트리밍, 그 외는 buffered transform).
>
> 용어 주의: 폐기된 "v5 KDF envelope"와, 코드에 현역인 "스코프 자기기술 체크섬
> 마커(`CK`, 과거 'v5 체크섬'으로 불림)"는 **별개**다. 후자는 폐기 대상이 아니며 정상 동작한다.

### (참고) 제거 시 검토했던 문제와 설계

- 현재 압축/암호화/체크섬 스트림은 사실상 **전체 버퍼링**(footer가 최종 메타라 전량 축적
  후 처리). 대용량 스트리밍에서 메모리 상한이 곧 전체 크기. → 경량 정체성 유지를 위해
  라이브러리가 해결하지 않고 애플리케이션 레벨에 위임한다.
- 프레임 단위 포맷(`DDS2`)은 상수 메모리를 달성하나 신규 영구 포맷 + nonce/truncation 보안
  책임을 동반 → 비용이 가치를 초과한다고 판단해 제외.

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
> 직접 매핑 언롤 융합으로 인코드 `packPow2ToString` ~40→~183 MB/s(약 4.5x), 디코드
> `unpackPow2FromString` ~150→~420 MB/s 개선. **출력 바이트·wire format은 100% 불변**이며
> 동치 오라클(raw `bitPackEncode`/`bitPackDecode`)·고정 벡터·property 테스트로 고정된다.
>
> 표준 base64 알파벳은 네이티브 fast path(`Uint8Array.toBase64`/`fromBase64`)로 계속 가속되며,
> 한글 charset은 비-ASCII 출력 특성상 네이티브 base64 속도에 도달할 수 없다(구조적 천장). 남은
> 속도 레버는 한계효용이 낮아 추가 최적화는 보류한다.

---

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
- 최소 Node 버전과 기본 CI LTS 재평가

새 KDF envelope, 새 wire format, DDS2, WASM, Worker 기반 병렬화는 구체적인 사용 사례와
유지보수 예산이 새로 입증되지 않는 한 도입하지 않는다.

---

## 권고

- 신규 **영구 wire 포맷은 추가하지 않는다**(KDF envelope, DDS2 제외). 기존 V4/DDS1
  단일 페이로드 포맷이 마지막 영구 표면이며, 회귀 테스트로 디코딩 호환을 고정한다.
- 경량 인코더 정체성에 부합하지 않는 대형 기능은 애플리케이션 레벨/전용 라이브러리로 위임한다.
- secure 진입점의 현행 배터리(압축/암호화/체크섬/Web Streams)는 전부 유지한다(신규 영구 포맷을
  늘리지 않으므로 제외 결정과 충돌하지 않음).
