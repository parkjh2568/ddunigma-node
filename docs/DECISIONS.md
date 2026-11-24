# 설계 결정

사용법은 [REFERENCE](REFERENCE.md), 구현·검증 규칙은 [CONTRIBUTING](../CONTRIBUTING.md)을 따른다.

## 제품 범위

한글·커스텀 문자셋의 가역 codec에 집중하고 runtime dependency 0개를 유지한다.
키 관리·인증 프로토콜과 대용량 프레임 설계는 애플리케이션이 담당한다.

### 요구사항과 실행 경계

| 요구사항                           | 구현 경계와 검증                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| UTF-8 문자열·바이너리의 가역 변환  | preset/custom charset → bitpack/footer. 고정 벡터·독립 BitPack·property test로 출력 동치를 검증한다.                    |
| 선택적 압축·암호화·checksum·난독화 | pipeline이 순서를 소유하고 adapter가 플랫폼 연산을 수행한다. CRC·난독화는 인증/기밀성을 제공하지 않는다.                |
| Node·browser·ESM·CJS 지원          | 조건부 exports와 lazy 주입을 유지하며 packed consumer·NodeNext·실제 브라우저로 검증한다.                                |
| 동시 호출과 가변 입력 보존         | 설정/lookup은 인스턴스가 보관하고 작업 데이터는 호출 local이다. adapter/KDF의 첫 Promise만 공유하고 실패 시 재시도한다. |
| 공격자 입력의 자원 제어            | 원시 문자·decoded bytes·압축 해제·stream 축적 한도를 할당 전에 적용한다. 인증이 끝난 뒤 결과를 반환한다.                |
| 최소 프로덕션 배포물               | TypeScript/ES2022 소스를 ESM/CJS와 선언 파일로 빌드하고 runtime dependency 없이 npm 패키지로 배포한다.                  |

도메인 모델은 charset/padding/encoding profile, codec 설정, 호출 옵션, wire metadata,
adapter capability, 공개 오류다. 영속 데이터 모델·DB schema·HTTP API·사용자 권한은
현재 실행 경로에 없으며, 소비 애플리케이션의 요구가 확정될 때 별도로 설계한다.
AES-GCM의 데이터 인증은 사용자 로그인·권한 관리와 구분한다.

인코딩은 바이트 변환 → 선택적 원문 CRC → 유익한 압축 → V4 AES-GCM/AAD → 선택적 출력 CRC
→ bitpack/footer → 난독화 → checksum suffix → URL-safe → 청크 순서다.
디코딩은 원시 입력 한도 → 청크/URL-safe 역변환 → checksum 추출 → 역난독화 → footer 검증
→ 정렬/padding/할당 한도 → unpack → 버전별 checksum/인증/압축 해제 순서를 따른다.
V2/V3/V4의 기존 처리 차이는 호환성 계약이므로 단일 순서로 치환하지 않는다.

## 구조와 API 선택

| 선택                       | 이유                                                                  |
| -------------------------- | --------------------------------------------------------------------- |
| core·pipeline·adapter 분리 | 플랫폼 코드를 core에서 분리하고 sync/async 처리 순서·검증을 공유한다. |
| root·browser의 lazy import | 압축·암호화·stream을 쓰지 않는 초기 경로의 로딩 비용을 줄인다.        |
| `createDdu`와 `Ddu64` 병행 | 간단한 Promise API와 기존 동기·통계·스트림 API를 함께 제공한다.       |
| 독립 BitPack 오라클 유지   | 최적화된 매핑과 독립 구현의 출력 동치성을 검증한다.                   |

## Wire와 오류 경계

기존 wire·KDF 기본값·공개 override를 보존한다. 입력 소유권·인증 후 반환·할당 전 한도 검사는
최적화의 전제이며, 새 wire는 장기 호환 책임까지 검토한 뒤 도입한다.

### DDS1 헤더와 본문 한도

`maxBufferedChars`는 헤더를 제외한 본문(footer·checksum 포함)을 제한한다.
헤더는 `getStreamHeaderLength()`만큼만 수집·검증하고, 본문은 slice/결합 전에 길이를 검사한다.
이 기준은 기존에 헤더를 먼저 받은 성공 경로를 보존하면서, 같은 wire가 전송 청크 경계에
따라 실패하는 문제를 없앤다. 헤더를 body buffer에 섞어 한도를 검사하면 파싱 전에는
header+body, 파싱 후에는 body로 분모가 바뀌므로 다시 같은 문제가 생긴다.
예를 들어 16바이트를 인코딩한 헤더 8·본문 24 코드 유닛의 입력은 한도 24에서
단일 청크·헤더/본문 분할 모두 성공하고, 한도 23에서는 모두 실패해야 한다.
고정 헤더의 작은 추가 공간은 허용하되, 본문·decoded·압축 해제 한도를 늘려 대응하지 않는다.
모든 2분할과 1문자 분할의 exact/초과 한도·빈 본문·손상/미완성 헤더를 회귀로 검증한다.

## 최적화 채택 근거

융합 비트 매핑·native Base64·preset lookup 재사용·최대 8,192개 문자열 버퍼로 중간 할당을 줄인다.
전체 alphabet 선계산은 짧은 첫 호출 회귀가 있어 실제 사용 문자만 캐시한다.
[과거 측정 기록](https://github.com/parkjh2568/ddunigma-node/blob/9b5eab77246f60132f46d8a02e30112d0bf525cb/docs/DECISIONS.md#최적화-채택-근거)은 당시 환경의 채택 근거이며 현재 성능 보장이 아니다.

## 최적화 보류와 재검토 조건

| 보류한 변경                      | 재검토 조건                                                           |
| -------------------------------- | --------------------------------------------------------------------- |
| `setFromBase64`·`encodeInto`     | 검증·목적지 할당·독립 복사까지 포함해 대상 엔진에서 이득을 입증할 때. |
| CryptoKey cache                  | import 비용 절감과 가변 키·보관 수명 계약을 함께 입증할 때.           |
| stream 복사 제거·stats 산술 치환 | 입력 소유권·공개 override·실제 출력과의 일관성을 보존할 때.           |
| Worker·작업 분할                 | 지연 목표가 정해지고 pool·전달·취소 비용까지 포함해 개선될 때.        |

V5 KDF envelope·DDS2 실험은 호환·인증 책임이 제품 범위를 넘어 철회했다.

## 부하 확장과 관측성

주요 비용은 CPU(bit mapping·CRC·암호화), 메모리(복사·문자열·축적/결합), native 작업
대기(압축·PBKDF2)다. DB·네트워크·렌더링은 codec 내부 비용에 포함되지 않는다.
Promise API도 순수 매핑 작업을 호출 중 동기 실행하므로 이벤트 루프 분리를 보장하지 않는다.

2026-10-27 로컬 기준 측정은 Node 24.22.1/Apple M1 Pro, 소스 `636aed7`, clean tree,
20표본의 `pnpm bench:latency`다. benchmark SHA-256은
`cc23e45dabf350c197e0812bdae13429dcecdabef59bfd5099cbf9a46adc1e33`, lockfile은
`760597726f1eae241c336c6560b31107c7e5da703208bca3c1f15e1d611be941`다.

| legacy API workload            | 왕복 batch p50/p95 | 원문 기준 왕복 처리량 |
| ------------------------------ | ------------------ | --------------------- |
| plain 1MiB·동시성 1            | 10.706/12.185ms    | 92.35MiB/s            |
| plain 8MiB·동시성 1            | 84.145/119.556ms   | 88.13MiB/s            |
| random 1MiB·압축 요청·동시성 1 | 28.886/30.806ms    | 34.41MiB/s            |
| secure 1,408 bytes·동시성 4    | 0.361/0.634ms      | 12.98MiB/s            |
| secure 1,408 bytes·동시성 16   | 1.250/2.216ms      | 15.07MiB/s            |

plain 8MiB의 두 API를 교대 측정한 event-loop p95는 124.91ms, utilization은 0.995였다.
최초 키 호출 중앙값 26.036ms와 재사용 0.067ms는 별도 5표본이다.
이는 한 환경의 경험적 기준이며 지연 보장·개선율·100배 부하 수용 근거가 아니다.
관측 RSS는 앞선 workload와 GC 영향을 포함하므로 요청별 peak로 환산하지 않는다.

DDS1 수정 전후의 별도 대조는 같은 Node에서 결정론적 1MiB bytes를 사용해,
3회 warmup 후 순서를 교대한 20표본(표본당 3회 평균)의 중앙값으로 확인했다.
디코딩·stream 생성·출력 수집을 포함하며 인코딩은 측정 밖이다.
단일 청크는 5.238→5.213ms, 4Ki 코드 유닛 청크는 5.553→5.612ms였다.
작은 변동으로 성능 개선을 주장하지 않으며 이번 변경은 한도 일관성의 수정이다.

100배 부하 설계에는 소비 앱의 초당 입력 바이트·동시 작업 수·p95 목표·허용 RSS가 먼저
필요하다. 그 뒤 대형 매핑의 Worker 전달/취소 비용, 같은 random bytes의 압축 on/off,
청크 크기별 DDS1 첫 출력/전체 지연·축적 모드 동시 스트림 peak를 각각 대조한다.
목표를 넘으면 앱에서 bounded queue·admission control·worker 격리를 적용한다.
무제한 큐는 메모리 고갈로 이어지고, worker는 복사/전달 비용과 종료 시 재시도 정책이 필요하다.
프로세스 메모리와 이벤트 루프는 공유 장애 지점이며 개별 stream의 64MiB 한도는 프로세스
전체 상한이 아니다. 키 강도·입력 복사·인증·한도를 줄여 처리량을 확보하지 않는다.

운영 앱은 `Ddu64Error.code/operation/cause`, `onProgress`를 이용해 작업량·실패율·지연·한도
초과를 집계한다. payload·키를 기록하지 않고 오류 종류/입력 크기를 제한된 차원으로 기록한다.
알림은 앱의 SLO에 맞춘 오류율·p95·queue 대기·RSS/이벤트 루프 지연의 지속 초과로 정한다.
잘못된 입력은 재시도하지 않으며, 일시적인 adapter 초기화 실패만 제한적으로 재시도한다.
logger·telemetry·cache·queue의 runtime dependency를 라이브러리에 추가하지 않는다.

## 측정과 배포 검증의 도구 경계

내용 식별은 benchmark·build receipt가 공유하는 `benchmarkMetadata`에 둔다. 소스·설정·lockfile과
dist를 각각 해시하고, Git이 없는 archive에서도 내용 식별을 유지한다. 상위 폴더의 Git 저장소를
해당 소스의 commit으로 기록하지 않는다. 빌드 기록은 로컬 내용 일치 검사이며 서명된 provenance가 아니다.
빌드 전에 이전 기록을 무효화하고 입력 해시를 저장하며, 완료 뒤 입력이 달라지면 새 기록을 거부한다.
공개 runtime 경로에는 계측·파일 시스템·자식 프로세스 의존성을 추가하지 않는다.

latency는 legacy/factory와 압축 off/on의 순서를 회전시켜 비교한다. 실제 footer의 압축 마커와
독립 native 압축 크기를 대조하고, 표본 완료마다 원시 값을 남긴다. guard의 세 원시 표본도
즉시 남겨 중간 예외가 앞선 결과를 지우지 않게 한다. process CPU는 프로세스 전체 비용이며
wall time에서 빼서 queue 대기를 추론하지 않는다. 공통 event-loop 관측에는 계측·로그도 포함된다.

새 동일-input 대조(Node 24.22.1/M1 Pro, 20표본)에서 random 1MiB의 deflate 원시 출력은
1,048,901 bytes로 원문 1,048,576 bytes보다 컸고 footer에서도 미채택을 확인했다.
최종 `latency-03`의 legacy 왕복 중앙값은 off 10.766ms/on 29.592ms였으며 최종 wire는 양쪽 모두 4,194,312 UTF-8
bytes로 같았다. 압축이 미채택돼도 시도 비용이 발생하므로 이미 비압축성임을 아는 입력은
기존 호출 옵션으로 조정한다. 자동 휴리스틱·기본값·wire 정책을 바꾸는 근거로 확대하지 않는다.

DDS1은 시나리오별 child를 분리하고 await-write/느린 소비자를 사용해 입력 제어를 측정한다.
header와 payload 첫 출력을 구분하며 암호화 decode의 조기 평문 반환을 허용하지 않는다.
child deadline·관측 RSS 초과는 실패와 완료된 부분 표본을 남기고 종료한다.
최종 IPC 결과와 오류는 전송 callback 완료 뒤 연결을 닫아 큰 메시지를 보존한다.
관측 cutoff는 동기 구간의 엄격한 할당 상한이 아니며 lifecycle maxRSS는 준비·검증·warmup도 포함한다.
기본 18개 경계/대표 시나리오와 별도 1MiB 동시성 4/16을 측정했다. 운영 SLO·도착률 목표가
미정이므로 Worker 채택을 보류하며, 측정치를 서비스 지연 보장으로 사용하지 않는다.

[측정 감사](PERFORMANCE_AUDIT.json)는 내용 식별자·수집 범위·로컬 결과 위치를 기록한다.
원시 로그는 Git/npm 배포물에 넣지 않고 로컬 `benchmark-results`와 수동 CI artifact로 보존한다.
성공/실패 실행을 함께 남기며 runner 변동이 확인되기 전에는 새 latency gate를 만들지 않는다.

공개 패키지는 무결성을 확인한 뒤 기존 packed consumer 검사에 임시 복사하여 실행한다.
복사 과정에서 symlink·비정규 파일·외부 entrypoint를 거부해 원본을 보존한다.
현재 소스의 pack allowlist를 과거 버전에 소급 적용하지 않는다.
[릴리스 감사](RELEASE_AUDIT.json)의 공개 6.3.0 소비자 성공은 해당 SHA의 과거 CI나 실제
게시 권한 설정을 대신 입증하지 않는다. 기록/권한이 없으면 미확인으로 남긴다.
