# 범위·설계 결정 기록

공개 계약은 [REFERENCE](REFERENCE.md), 구현·검증 절차는
[CONTRIBUTING](https://github.com/parkjh2568/ddunigma-node/blob/master/CONTRIBUTING.md)을 따른다.
회귀 기준은 `f4eef3d`의 npm 6.2.0이며, 2.x 이행은 [호환성 범위](REFERENCE.md#호환성-범위)를 확인한다.

## 제품 범위

인코더·디코더를 함께 통제하며 한글·커스텀 charset으로 데이터를 가역 표현하는 codec이다.
charset·외부 KDF 설정과 UTF-8 출력 증가를 수용하고 runtime dependency 0개를 유지한다.
표준 교환·인증 토큰·키 envelope·무제한 스트리밍은 전용 도구에 맡긴다.
키 관리·인증 프로토콜·위협 모델은 애플리케이션이 소유한다.

## 구조와 API 선택

| 선택                                                | 이유                                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| core·pipeline·adapter·난독화·streams 분리           | 플랫폼 구현을 core에 넣지 않고 기존 책임 안에서 결함을 수정한다. 추가 계층·monorepo·도구 교체 근거는 없다.                                |
| root·browser의 lazy import, `/secure`의 정적 export | 평문 초기 로딩 비용을 줄이고 고급·기존 API를 유지한다.                                                                                    |
| `createDdu` 추가, 기존 `Ddu64` 유지                 | Promise 반환과 생성 시 고정 정책을 제공하면서 동기 API·wire를 보존한다. wrapper 앞에 await·복사를 추가하지 않아 snapshot 시점도 유지한다. |
| 작은 동기 처리는 인라인, 공유 검증·gateway는 유지   | 단일 중계 계층을 줄이되 실제 재사용·플랫폼·오류 경계를 보존한다.                                                                          |
| 독립 BitPack 오라클 유지                            | 최적화된 매핑과 독립 구현의 출력 동치성을 검증한다. 참조 수·coverage만으로 legacy decoder나 공개 API를 삭제하지 않는다.                   |

## Wire와 오류 경계

V1 profile·V2/V3/V4·AAD·CHK/CK·DDS1과 KDF 기본값을 유지한다. 새로운 압축·암호화 기능만을
이유로 영구 포맷을 늘리지 않는다. marker가 본문과 충돌할 수 있어 실제 경계·바이트 정렬을
검사하며, 실패를 평문 fallback으로 숨기지 않는다.

입력 snapshot·실제 byte view 검증·인증 후 반환·할당 전 한도 검사는 최적화보다 우선한다.
progress는 동기 callback이고 Promise 반환은 거부한다. 오류는 cause를 보존하며 ESM/CJS는
`Symbol.for` 표식으로 식별한다. 이 표식은 인증 수단이 아니다.
상세 구현 조건은 CONTRIBUTING, 사용자 계약은 REFERENCE에서 관리한다.

## 최적화 채택 근거

융합 비트 매핑·native Base64·preset lookup 재사용·bounded 문자열 버퍼를 사용한다.
UTF-8 통계 변환·AES 중간 concat·stream 결합 후 참조를 줄이되 입력 소유권·독립 결과·
public override는 유지했다.

아래는 Node 24.21.0 / Apple M1 Pro / Darwin 27.0.0의 과거 채택 근거다.
각 9표본 교대 중앙값이며 전체 codec의 현재 성능이나 서로 합칠 수 있는 개선율이 아니다.

| 날짜·비교 대상                                | 입력·측정 범위                                  | 수정 전 → 후                                                |
| --------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| 2026-09-22, npm 6.2.0 대비 역난독화           | 65문자 alphabet의 반복 `A`, 8Mi 코드 유닛       | 137.99 → 92.34ms; 입력 직후 관측 heap 증가 72.13 → 35.65MiB |
| 2026-10-13, `be15062` native 모듈 대비        | `(i*31+17)&255` 원시 1MiB, decode primitive     | 4.107 → 3.688ms                                             |
| 2026-10-13, 작업 전 소스 대비 전체 DDU 난독화 | 같은 byte 패턴 8MiB, 재사용 인스턴스 encode     | 489.407 → 191.947ms                                         |
| 같은 소스 비교, native 없는 Base64 decode     | 같은 byte 패턴 1MiB, Buffer·fromBase64 비활성화 | 11.115 → 3.979ms                                            |
| 같은 소스 비교, 청크 분할                     | ASCII 1,048,576문자, 크기 76·CRLF               | 0.789 → 0.476ms                                             |

역난독화는 최대 8,192개 문자열 버퍼를 사용한다. 난독화 lookup은 실제 등장 문자만 숫자 Map에
저장하며, 전체 alphabet 선복사는 짧은 첫 호출 회귀로 철회했다. native 부재 시 중복 순회를
줄이고 청크 배열은 `2K-1`에서 `K` 슬롯으로 줄였다. 관측 heap은 peak RSS가 아니다.
측정별 warm-up·반복 횟수·비교 해시와 전체 표는
[당시 기록](https://github.com/parkjh2568/ddunigma-node/blob/9b5eab77246f60132f46d8a02e30112d0bf525cb/docs/DECISIONS.md#최적화-채택-근거)에 보존한다.
재현 명령과 측정 단위는 CONTRIBUTING의 성능 절을 따른다.

## 최적화 보류와 재검토 조건

| 보류한 변경                           | 재검토 조건                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `setFromBase64`·`encodeInto`          | 목적지 할당·검증·독립 복사까지 포함해 대상 엔진에서 이득을 입증할 때. 기존 비교는 엔진별 무이득·회귀가 있었다. |
| CryptoKey cache                       | import 비용 절감과 가변 키·보관 수명 계약을 함께 입증할 때. 기존 3엔진 비교의 이득은 일관되지 않았다.          |
| stream 복사 제거                      | 외부 입력 snapshot·독립 결과·public override를 보존하며 실제 메모리 절감을 입증할 때.                          |
| Worker·작업 분할                      | 운영 지연 목표가 정해지고 pool·직렬화·취소·callback·adapter 전달 비용을 포함해 개선될 때.                      |
| decode 사전 검증 제거·stats 산술 치환 | 오류 순서·override·custom 난독화·callback 계약과 전체 경로의 이득을 함께 보장할 때.                            |

Promise API도 CPU 작업은 동기다. 과거 별도 8MiB 난독화 진단에서 타이머 지연 중앙값이
약 541→197ms로 줄었지만 메인 스레드 점유는 남았다. 운영 SLO나 일반적인 속도 보장이 아니다.

## 제외한 확장과 다음 major

V5 KDF envelope와 DDS2 실험은 철회했다. salt 인증·다운그레이드·KDF 노후화·nonce/AAD·
절단·재정렬·교차 stream 방어와 영구 호환 책임이 범위를 넘는다. V4·외부 KDF 설정·DDS1을
유지하며 scoped checksum CK는 이 결정과 별개다. 새 wire·WASM·Worker는 사용 사례와 유지 비용을
입증하기 전 도입하지 않는다.

다음 major에서 deprecated `PlatformAdapter.randomBytes`, `/secure` 명칭·별칭, 파생 키 직접 입력,
Node secure의 browser export와 최소 Node 버전을 재검토한다. CI 런타임 전환은 API·wire 변경과 분리한다.
