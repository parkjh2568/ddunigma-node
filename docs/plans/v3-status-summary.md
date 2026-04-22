# ddunigma-node v3 Status Summary

## 목적

이 문서는 현재까지 진행한 유지보수 및 v3 기획 작업과, 앞으로 진행할 구현 작업을 한 번에 확인하기 위한 요약 문서다.

세부 설계는 각 RFC 문서를 따르고, 이 문서는 진행 현황과 우선순위 기준을 빠르게 공유하는 용도로 사용한다.

## 현재 상태 한 줄 요약

- 현재 패키지는 `v2` 라인을 유지 중이다.
- v3 방향은 **compatibility-first** 로 확정되었다.
- 기존 사용자는 `Ddu64`를 계속 사용할 수 있어야 한다.
- 새 설계와 새 wire format은 `DduCodec`에 격리한다.

## 지금까지 완료한 작업

### 1. 유지보수 및 안정화 작업

최근 유지보수 작업으로 다음 항목들이 정리되었다.

- 릴리즈 문서와 패키지 설정에 scoped public 배포 기준을 반영
- `lint`와 `lint:fix`를 분리해 CI 검증 의미를 명확화
- `getCharSetInfo()` 반환 타입 `CharSetInfo`를 공개 타입으로 export
- 암호화 payload를 키 없이 decode할 때 즉시 에러를 반환하도록 보강
- 공개 stream encode 경로에서 `compressionLevel` 기본값과 `0` 레벨 처리를 수정
- `DduPipeline.compress(0)`이 deflate level `0`을 `1`로 강제하던 문제를 수정
- 위 회귀를 막는 테스트를 추가
- `DduCodec` 타입, 에러, 클래스 스캐폴딩을 추가하고 루트 export 및 최소 smoke test 경로를 정리
- `DduCodec` instance stream API가 native `DDS3` header emit/parse 경로를 갖도록 정리

관련 변경 이력은 [CHANGELOG.md](/Users/jhpark/code/ddunigma-node/CHANGELOG.md)에서 확인할 수 있다.

### 2. v3 방향성 및 제약 조건 확정

사용자 요구사항을 기준으로 다음 제약을 반영했다.

- 버전은 앞으로 나아가야 한다
- 과거 사용자는 `Ddu64`를 그대로 써도 런타임 에러가 없어야 한다
- 새로운 설계가 `Ddu64`와 공존하기 어렵다면 별도 클래스로 분리해야 한다

이 기준에 따라 v3는 breaking rewrite가 아니라 compatibility-first major release로 정의되었다.

### 3. 핵심 의사결정 잠금

현재 잠긴 결정은 다음과 같다.

- `Ddu64`는 호환성 경로로 유지
- 새 클래스 이름은 `DduCodec`
- 새 wire format 소유권은 `DduCodec`
- `DduCodec.compatibility.legacyDecode` 기본값은 `"explicit"`
- v3 최소 Node 지원 버전은 `>=20`
- 권장 개발 버전은 `24.x LTS`
- v3 검증 매트릭스는 `20 / 22 / 24`
- top-level stream helper는 v3에서도 호환성 wrapper로 유지

결정 원문은 [docs/plans/v3-decisions.md](/Users/jhpark/code/ddunigma-node/docs/plans/v3-decisions.md)를 따른다.

### 4. 작성된 기획 문서

현재까지 정리된 핵심 문서는 다음과 같다.

- [docs/plans/v3-charter.md](/Users/jhpark/code/ddunigma-node/docs/plans/v3-charter.md)
- [docs/plans/v3-decisions.md](/Users/jhpark/code/ddunigma-node/docs/plans/v3-decisions.md)
- [docs/plans/v3-api-rfc.md](/Users/jhpark/code/ddunigma-node/docs/plans/v3-api-rfc.md)
- [docs/plans/v3-wire-format.md](/Users/jhpark/code/ddunigma-node/docs/plans/v3-wire-format.md)
- [docs/plans/v3-ddu64-compatibility.md](/Users/jhpark/code/ddunigma-node/docs/plans/v3-ddu64-compatibility.md)
- [docs/plans/v3-type-map.md](/Users/jhpark/code/ddunigma-node/docs/plans/v3-type-map.md)
- [MIGRATION-v3.md](/Users/jhpark/code/ddunigma-node/MIGRATION-v3.md)
- [.agents/results/current-plan.md](/Users/jhpark/code/ddunigma-node/.agents/results/current-plan.md)
- [.agents/plan.json](/Users/jhpark/code/ddunigma-node/.agents/plan.json)

## 아직 바꾸지 않은 것

다음 항목은 의도적으로 아직 적용하지 않았다.

- [package.json](/Users/jhpark/code/ddunigma-node/package.json)의 실제 `engines.node`는 아직 `>=18`
- 현재 README의 설치 기준도 현행 v2 라인 기준을 유지
- `DduCodec`는 block encode/decode와 native `DDS3` stream 기본 경로까지 구현됐지만, 전체 fixture coverage와 고도화된 streaming 최적화는 아직 남아 있음

이유는 간단하다.

- 현재 배포선은 아직 v2이기 때문에, 지금 바로 Node baseline을 `>=20`으로 올리면 실제 사용자에게 조기 breaking change가 된다
- 따라서 Node `>=20` 정책은 **v3 cutover 시점에 적용**하는 것이 맞다

## 앞으로 작업할 내용

### P0. 호환성 보존

가장 먼저 지켜야 하는 목표는 기존 `Ddu64` 사용자가 업그레이드 시 깨지지 않는 것이다.

해야 할 일:

- `Ddu64` constructor, method, payload decode 호환 범위를 테스트로 고정
- legacy stream, checksum, compression, encryption, URL-safe 경로를 fixture로 보존
- README와 migration 문서에서 `Ddu64` 유지 경로를 명확히 설명

### P1. 새 경로 구현 준비

새 경로는 `DduCodec` 중심으로 구현한다.

해야 할 일:

- `DduCodec` public type과 export 구조 스캐폴딩
- object-first config shape를 실제 코드에 연결
- `DDU3`와 `DDS3` 포맷 parser/encoder 계약을 구현 단위로 분해
- instance-bound stream API 초안 구현

### P2. 런타임과 품질 체계 정리

새 major가 안정적으로 나가려면 구현과 함께 검증 체계를 묶어야 한다.

해야 할 일:

- v3 cutover 시 `package.json`, CI, release 문서에 Node `>=20` 기준 반영
- `20 / 22 / 24` 매트릭스로 검증 파이프라인 정리
- legacy/new-path golden fixture 추가
- README 예제 실행 검증과 benchmark 비교 기준 마련
- 새 경로의 strict validation과 error taxonomy 정의

### P3. 릴리즈 준비

구현이 끝나면 사용자 관점 문서를 마무리해야 한다.

해야 할 일:

- `MIGRATION-v3.md`를 실제 구현 기준으로 보강
- README 업그레이드 가이드 추가
- alpha -> beta -> rc 릴리즈 커뮤니케이션 초안 정리

## 가장 가까운 다음 작업

지금 기준으로 바로 이어서 진행할 우선순위는 다음 순서가 가장 적절하다.

1. `DduCodec` public types와 export shape 스캐폴딩
2. v3 runtime and packaging cutover checklist 작성
3. `Ddu64` / `DduCodec` compatibility fixture matrix 정의

## 진행 원칙

이 프로젝트의 v3는 기능 추가 경쟁보다 계약 정리가 더 중요하다.

따라서 구현 중에도 아래 원칙을 계속 유지해야 한다.

- `Ddu64`는 compatibility-first
- `DduCodec`는 new-path-first
- 현재 v2 사용자에게 조기 breaking change를 만들지 않기
- 문서와 테스트를 구현보다 뒤로 미루지 않기
