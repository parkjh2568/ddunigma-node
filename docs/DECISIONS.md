# 범위·설계 결정 기록

기존 ddunigma 데이터 호환성과 runtime dependency 0개를 우선한다. 공개 계약은
[REFERENCE](REFERENCE.md), 구현·측정·배포 절차는 저장소의 [CONTRIBUTING](https://github.com/parkjh2568/ddunigma-node/blob/master/CONTRIBUTING.md),
미완료 출시 항목은 저장소의 [TASKS](https://github.com/parkjh2568/ddunigma-node/blob/master/docs/TASKS.md)에서 관리한다.
기준 배포는 `f4eef3d`의 6.2.0이다. 아래 측정 기록은 해당 시점의 채택 근거이며 현행 성능 보장이 아니다.

## 제품 범위

인코더와 디코더를 함께 통제하면서 한글·커스텀 charset으로 데이터를 가역 표현하는 codec이다.
양쪽은 charset·외부 KDF 설정을 공유하고 비표준 출력과 UTF-8 크기 증가를 수용한다.
난독화·CRC32는 보안 경계가 아니며 키 관리·위협 모델·인증 프로토콜은 애플리케이션이 소유한다.

표준 상호운용·최소 전송량·인증 토큰·키 envelope·무제한 프레임 스트리밍은 주목적이 아니다.
압축·암호화 통합만을 이유로 새 영구 포맷을 늘리지 않는다. 새 기능은 실제 사용 사례와 유지보수 비용으로 판단한다.

## 구조와 API 선택

core 계약·sync/async pipeline·플랫폼 adapter·난독화·streams의 책임을 분리한다.
평문 경로에 adapter·streams를 연결하지 않도록 root/browser는 필요한 구현을 지연 로드한다.
core에는 구체 adapter·한글 난독화 구현을 넣지 않고, `/secure`의 기존 정적 export는 호환성을 위해 유지한다.
추가 계층·monorepo·빌드 도구 교체의 근거는 없으며 결함은 기존 책임 경계 안에서 해결한다.

`createDdu`는 기존 `Ddu64.encode(): string`을 바꾸는 대신 root/browser에 named export로 추가했다.
생성 시 text/bytes와 처리 정책을 고정해 호출별 설정을 기억하지 않으며 기존 async pipeline을 바로 호출한다.
wrapper 앞에 await·입력 복사를 추가하지 않아 snapshot 시점을 유지한다. Promise 반환을 별도 스레드 실행으로 설명하지 않는다.

작은 동기 로직은 호출 함수 안에 두고 재사용·플랫폼·오류 경계가 있을 때만 분리한다.
단일 후처리 중계와 native Base64 변환 중계는 기존 함수에 통합했다.
반면 BitPack과 융합 매핑의 독립 동치 오라클, sync/async gateway·공유 검증은 유지한다.
구버전 decoder·공개 deprecated API·방어 검증은 참조 수나 coverage만으로 삭제하지 않는다.

## Wire와 오류 경계

V1 profile·V2/V3/V4 순서·AAD·CHK/CK·DDS1을 고정 벡터와 인증 경계로 유지한다.
숫자/반복 padding과 payload에 충돌한 선택 마커는 실제 경계를 검사하고 이미 확인한 암호화·버전 정보를 보존한다.
KDF 기본값·salt 의미를 바꾸거나 암호화 실패를 평문 fallback으로 숨기지 않는다.

progress는 기존 동기 callback 계약을 유지하며 Promise/thenable은 InvalidInput으로 거부하고 rejection을 관측한다.
codec 오류는 원인을 보존해 정규화하며 비열거 Symbol.for 표식으로 ESM/CJS 식별을 연결한다.
이 표식은 호환성 장치이며 인증 수단이 아니다. 사용자·플랫폼 예외는 기존 공개 오류 계층으로 전달한다.

byte 입력은 intrinsic 종류·detached 여부·실제 length 일치를 검증한다. Node Base64는 intrinsic buffer·offset과
검증된 길이로 복사 없는 view를 구성해 재정의된 메타데이터를 읽지 않는다.
stream은 write 이후 재사용할 입력을 보존하고 실패 시 축적 상태를 정리한다.
DDS1 본문에는 청크 구분자가 없으므로 생성자 구분자로 본문을 제거하지 않는다.

## 최적화 채택 근거

융합 비트 매핑·native Base64·preset lookup 재사용·bounded 문자열 버퍼를 사용한다.
통계는 UTF-8 변환과 originalSize 기록을 한 번 수행하고, Node AES의 중간 concat과 stream 결합 후 청크 참조를 줄였다.
입력 snapshot·인증 후 결과 반환·독립 decode 결과·public override는 비용만을 이유로 제거하지 않는다.

측정 환경은 Node 24.21.0 / Apple M1 Pro / Darwin 27.0.0이다. 아래는 서로 다른 시점·대상의
채택 근거이며 수치를 합쳐 전체 성능 개선율로 해석하지 않는다. 실행 방법은 CONTRIBUTING에서 관리한다.

### 호출 지연 기준

- 측정: 2026-09-22, 기존 API와 간편 API의 14개 workload를 API별 20회 교대 실행.
- 대상: 최적화 전 간편 API의 8MiB 평문 encode 호출 반환 시간. 중앙값/p95는 59.43/66.70ms.
- 별도 초기 비용: cold import 5회 3.39~7.72ms, 기본 PBKDF2 첫 encode 28.09~79.04ms,
  재사용 0.068~0.119ms. cold import는 프로세스 시작을 포함하지 않는다.

Promise의 CPU 점유와 KDF 초기 비용을 구분하는 기준이며 운영 SLO나 현재 구현의 개선율은 아니다.

### 역난독화 버퍼

- 측정: 2026-09-22, 공개 6.2.0과 후보를 9회 교대 실행한 호출당 중앙값(ms).
- 입력: 65문자 alphabet의 `A` 반복 문자열을 난독화한 고정 입력.
- lockfile SHA256: `760597726f1eae241c336c6560b31107c7e5da703208bca3c1f15e1d611be941`.

| 입력 code units | 6.2.0  | 변경 후 |
| --------------- | ------ | ------- |
| 32              | 0.0005 | 0.0005  |
| 1Ki             | 0.0142 | 0.0129  |
| 16Ki            | 0.2828 | 0.2144  |
| 1Mi             | 14.97  | 12.38   |
| 8Mi             | 137.99 | 92.34   |

8Mi 입력 직후 관측 heap 증가 중앙값은 72.13MiB → 35.65MiB였다. 최대 8,192개 문자열 버퍼로
큰 입력 비용을 줄이고 다중 코드 유닛 alphabet·배치 경계·오류 위치를 보존해 채택했다.
출력 조각·최종 문자열은 여전히 O(n)이며 이 관측값은 peak RSS나 전체 codec 메모리 감소량이 아니다.

### Native Base64 view

- 측정: 2026-10-13, `be15062`의 native 모듈과 view 수정·중계 통합 후 모듈을 `tsx`로 로드.
- 입력·절차: `(i*31+17)&255` bytes, 9표본 교대 중앙값. 64B·16KiB·1MiB를 표본당
  50,000·500·10회 실행하고 결과를 signature로 소비. 빈 입력·padding·대형 입력의 출력 동치 확인.

| 원시 입력 | encode 전→후 µs/호출 | decode 전→후 µs/호출  |
| --------- | -------------------- | --------------------- |
| 64B       | 0.123 → 0.127        | 0.348 → 0.352         |
| 16KiB     | 1.817 → 1.792        | 47.952 → 48.382       |
| 1MiB      | 58.633 → 58.142      | 4,106.687 → 3,687.546 |

모듈 전/후 SHA256은 `f03e1f28db60c6d99b68d4a76da7b6b51b5238a9ed74f4f46b2d69245fc0f8f7`,
`5c82741e4842710b6f4ced9312f1d08ea193c3f7202ad27d06d69b5b34357dd8`이다.
재정의된 메타데이터로 다른 바이트를 출력하던 결함을 수정하고 복사 없는 경로·성능 하한·크기 예산을
유지해 채택했다. 공개 wrapper 전체나 peak RSS 측정이 아니며 일반적인 속도 개선으로 주장하지 않는다.

### 난독화·fallback·청크 비용

- 측정: 2026-10-13, 작업 시작 전 미커밋 소스와 최종 수정을 `benchmarks/compare-codec.ts`로 비교.
- codec 입력: `(i*31+17)&255` bytes, 64B·16KiB·1MiB·8MiB. 아래 표는 선택한 큰 입력 결과다.
- 절차: 같은 lockfile, 출력 동치 확인, 경로별 5회 warm-up, 배치 전 GC, 9표본 전후 교대 실행.
  codec 반복 횟수는 각각 10,000·64·1·1이며 시간은 재사용 인스턴스의 호출당 중앙값(ms).
- fallback: `Uint8Array.fromBase64`와 global `Buffer`를 비활성화해 JS decoder를 강제한다.
- 청크 입력: 표준 Base64 alphabet을 반복한 ASCII 1,048,576문자, 크기 76·구분자 CRLF,
  표본당 2회 실행. 원문 바이트 codec 시간과 분모가 다르다.
- 첫 호출 비교: 83·1,024·11,172문자 alphabet에서 첫 문자를 64회 반복해 매번 새 레이어의
  생성자＋첫 난독화를 측정한다. 위 codec의 재사용 시간과 구분한다.

| 경로                             | 수정 전 → 후 (ms) | 시간 감소 |
| -------------------------------- | ----------------- | --------- |
| 1MiB 난독화 포함 encode          | 61.016 → 26.299   | 56.9%     |
| 8MiB 난독화 포함 encode          | 489.407 → 191.947 | 60.8%     |
| 1MiB native 없는 Base64 decode   | 11.115 → 3.979    | 64.2%     |
| ASCII 1,048,576문자·청크 크기 76 | 0.789 → 0.476     | 39.6%     |

난독화는 유효한 코드 유닛이 실제 등장할 때만 숫자 Map에 저장한다. 전체 alphabet 사전 복사안은
짧은 첫 호출 회귀로 철회했다. 추가 캐시는 등장 고유 문자 수에 비례하며 생성자·역난독화·빈 입력에는
만들지 않는다. native 부재 시 중복 순회를 없애고 기존 fallback 검증을 유지한다. 청크 배열은
`2K-1`에서 `K` 슬롯으로 줄인다. 출력·오류·입력 보존·인증·한도는 유지하며 환경별 속도 보장은 아니다.

식별 대상은 `ObfuscationLayer.ts`·`NativeBase64FastPath.ts`·`codecUtils.ts`다. 이 세 파일의 이름과
내용을 결합한 SHA256은 전 `75e734c4d2c341b1c2269529c624b2866b80ef06010185d1eab638e33b1b849f`,
후 `4589c105c818c5bb668aa2f19df1bbed264dbddd0bf4229645421aa4fed51bd1`이며 전체 커밋 해시가 아니다.

별도 지연 진단에서는 같은 byte 패턴의 8MiB 입력과 `obfuscate:true`로 `encodeAsync`를 호출했다.
배치 전 GC·`setImmediate` 후 0ms 타이머를 호출 직전에 예약하고, 타이머 실행까지의 경과 시간을
9표본 전후 교대 측정했다. 중앙값은 약 541→197ms였다. 이는 위 benchmark의 출력 항목이 아니며
async API도 CPU 작업은 동기여서 메인 스레드 점유가 남음을 보여준다.

## 최적화 보류와 재검토 조건

2026-09-22 Chromium 153.0.8010.12·Firefox 155.0·WebKit 26.6의 primitive 비용을 9표본 중앙값으로 비교했다.
짧은 입력의 0ms 표본은 비용 0의 증거가 아니다.

- `setFromBase64`: 1MiB의 from/set 시간은 Chromium 0.4125/0.225ms, Firefox 1.25/1.25ms,
  WebKit 0.25/0.25ms였다. 목적지 할당·read/written 확인을 포함하면 전 경로의 이득이 입증되지 않아 보류했다.
- `encodeInto`: 목적지 상한 할당·최종 독립 복사를 포함한 1MiB ASCII WebKit의 encode/후보는
  0.125/1.5ms로 회귀했다. 이미 확보한 목적지로 총 할당을 줄일 때 재검토한다.
- CryptoKey cache: 1KiB AES의 import/재사용은 Chromium 0.011/0.006ms, Firefox 0.23/0.28ms,
  WebKit 0.12/0.09ms였다. 엔진별 이득과 가변 키·보관 수명 계약을 함께 입증하기 전 도입하지 않는다.
- stream 복사: combined와 await 전 snapshot은 각각 독립 입력을 보존한다. public override 우회나
  외부 입력 snapshot 삭제 없이 메모리 절감을 입증해야 한다.
- Worker·작업 분할: 큰 입력의 CPU 점유는 확인했지만 실제 운영 SLO가 없어 도입을 보류했다.
  pool·직렬화·취소·callback·adapter 전달 비용과 실제 지연 목표가 정해졌을 때 재검토한다.
- decode 사전 검증 제거와 stats 산술 치환: override·오류 순서·custom 난독화·callback 계약을
  보존한 전체 경로의 이득이 필요하다.

## 제외한 확장과 다음 major

신규 KDF envelope(`encryptionVersion:5`)와 DDS2 실험은 철회했다. salt 인증·다운그레이드·KDF 노후화,
nonce/AAD·절단·재정렬·교차 stream 방어와 영구 호환 책임이 codec 범위를 넘기 때문이다.
현행 V4·외부 KDF 설정·DDS1을 유지한다. scoped checksum CK는 이 제외 기능과 별개다.
새 wire·WASM·Worker 병렬화는 사용 사례와 유지보수 예산을 입증하기 전 도입하지 않는다.

다음 major에서만 deprecated `PlatformAdapter.randomBytes`, `/secure` 명칭·별칭,
파생 키 직접 입력, Node secure의 browser 클래스·adapter export, 최소 Node 버전을 재검토한다.
CI 런타임 전환은 공개 API·wire 변경과 분리한다. 실행 환경과 패키징 계약은 REFERENCE·CONTRIBUTING을 따른다.
