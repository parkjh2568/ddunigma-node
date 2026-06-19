# Roadmap / 범위 결정 기록

외부 리뷰에서 제기됐던 대형 항목들의 **범위 결정 기록**이다. 두 항목(④ 자기기술 KDF
envelope, ⑤ 프레임드 스트리밍 `DDS2`) 모두 검토·시제 구현 후 **경량 인코더 정체성과의
미스매치**를 이유로 제외했다. 핵심 원칙: 신규 **영구 wire 포맷을 추가하지 않고**, 기존
포맷의 하위호환(기존 데이터 디코딩)을 반드시 유지한다.

---

## ④ 암호화 KDF envelope v5 (self-describing KDF) — ❌ 제외 (범위 밖)

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

## ⑤ 진짜 스트리밍 (프레임드 와이어 포맷 `DDS2`) — ❌ 제외 (범위 밖, 제거됨)

> 결정: **구현하지 않음(제거 완료).** opt-in(`createFramedEncodeStream`/`createFramedDecodeStream`,
> `src/streams/FramedStreams.ts`)으로 한 차례 구현했다가 ④ v5 KDF와 같은 이유로 되돌렸다.
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
> 용어 주의: 위 ④의 폐기된 "v5 KDF envelope"와, 코드에 현역인 "스코프 자기기술 체크섬
> 마커(`CK`, 과거 'v5 체크섬'으로 불림)"는 **별개**다. 후자는 폐기 대상이 아니며 정상 동작한다.

### (참고) 제거 시 검토했던 문제와 설계

- 현재 압축/암호화/체크섬 스트림은 사실상 **전체 버퍼링**(footer가 최종 메타라 전량 축적
  후 처리). 대용량 스트리밍에서 메모리 상한이 곧 전체 크기. → 경량 정체성 유지를 위해
  라이브러리가 해결하지 않고 애플리케이션 레벨에 위임한다.
- 프레임 단위 포맷(`DDS2`)은 상수 메모리를 달성하나 신규 영구 포맷 + nonce/truncation 보안
  책임을 동반 → 비용이 가치를 초과한다고 판단해 제외.

---

## secure 진입점 — 전부 유지 결정 (full retention)

> 결정: **`@ddunigma/node/secure`의 압축(deflate/brotli) + AES-256-GCM 암호화 + CRC32 체크섬 +
> Web Streams를 전부 유지한다.** 위 ④ v5 KDF·⑤ DDS2를 "신규 영구 wire 포맷 추가 + 장기 보안
> 책임"을 이유로 제외한 것과 달리, secure의 현행 기능들은 **이미 존재하는 안정된 표면**이며 신규
> 영구 포맷을 늘리지 않는다(V4 페이로드/DDS1 스트림 헤더 불변). 따라서 분리·폐기 없이 전부
> 유지한다.
>
> 진입점 구성은 4종으로 고정한다: 기본(`@ddunigma/node`, lean = 인코딩+난독화),
> `@ddunigma/node/browser`(lean), `@ddunigma/node/secure`(배터리 풀세트),
> `@ddunigma/node/core`(순수 인코딩). lean 진입점은 어댑터(zlib/crypto)를 정적 import하지 않아
> 트리셰이킹되고, secure 진입점에만 배터리가 포함된다. 이 분리로 "경량 기본 + 필요 시 배터리"를
> 동시에 만족한다.
>
> 비고: lean 진입점 번들 여유가 빠듯하므로(size-limit 예산 근접) **신규 기능은 secure/core
> 쪽에 싣고 lean 경로는 가볍게 유지**한다.

---

## 인코딩 성능 최적화 — ✅ 완료 (출력 불변)

> `encoding-perf-optimization` 스펙으로 한글/커스텀 charset hot path를 최적화했다. `bitLength 6/8`
> 직접 매핑 언롤 융합으로 인코드 `packPow2ToString` ~40→~183 MB/s(약 4.5x), 디코드
> `unpackPow2FromString` ~150→~420 MB/s 개선. **출력 바이트·wire format은 100% 불변**이며
> 동치 오라클(raw `bitPackEncode`/`bitPackDecode`)·고정 벡터·property 테스트로 고정된다.
>
> 표준 base64 알파벳은 네이티브 fast path(`Uint8Array.toBase64`/`fromBase64`)로 계속 가속되며,
> 한글 charset은 비-ASCII 출력 특성상 네이티브 base64 속도에 도달할 수 없다(구조적 천장). 남은
> 속도 레버는 한계효용이 낮아 추가 최적화는 보류한다.

---

## 권고

- 신규 **영구 wire 포맷은 추가하지 않는다**(④ v5 KDF, ⑤ DDS2 모두 제외). 기존 V4/DDS1
  단일 페이로드 포맷이 마지막 영구 표면이며, 회귀 테스트로 디코딩 호환을 고정한다.
- 경량 인코더 정체성에 부합하지 않는 대형 기능은 애플리케이션 레벨/전용 라이브러리로 위임한다.
- secure 진입점의 현행 배터리(압축/암호화/체크섬/Web Streams)는 전부 유지한다(신규 영구 포맷을
  늘리지 않으므로 ④⑤ 제외 논리와 충돌하지 않음).
- 제거된 기능(⑤ DDS2)의 스펙 아티팩트(`.kiro/specs/dds2-true-streaming/`)는 정리했다.
