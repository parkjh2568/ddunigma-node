# Roadmap: 암호화 envelope v5 / 진짜 스트리밍

외부 리뷰에서 제기된 두 대형 항목의 설계. 둘 다 **와이어 포맷 변경**이라 전용 작업
(설계 확정 → 테스트 벡터 생성 → 구현 → 리뷰)으로 진행한다. 기존 V4 포맷과 하위호환을
반드시 유지한다(기존 데이터 디코딩 보장).

---

## ④ 암호화 KDF envelope v5 (self-describing KDF)

### 문제

- 현재 PBKDF2 기본 210,000회 + 고정 salt. OWASP 현 권고는 PBKDF2-HMAC-SHA256 600k,
  Argon2id 우선.
- 암호문에 KDF 알고리즘/salt/iterations가 **자기기술되지 않음** → 4.x↔현재 마이그레이션
  시 사용자가 파라미터를 직접 맞춰야 하고, 기본값 변경이 곧 호환성 파괴.

### 설계 (신규 파이프라인 마커 `V5`)

- 암호화 footer 파이프라인 버전에 `V5` 추가(현 `V4` 유지·읽기 호환).
- V5 암호문 레이아웃:
  ```
  KDF_META(가변) │ IV(12) │ authTag(16) │ ciphertext(N)
  KDF_META = algId(1) │ saltLen(1) │ salt(≥16, 랜덤) │ iterations(4, BE) │ hashId(1)
  ```
- **salt는 인스턴스 고정이 아니라 메시지마다 랜덤**(≥16바이트), 암호문에 동봉.
- KDF_META 전체를 AES-GCM **AAD에 포함**해 인증(변조 시 복호화 실패). 현 `buildEncryptionAAD`
  확장: `ddunigma:wire:v5;enc=1;compress=...;kdf=<algId,iter,hash,saltHash>`.
- algId: `0=sha256(레거시)`, `1=pbkdf2`, `2=argon2id(선택)`. Argon2id는 무종속/브라우저
  공통 경로에 순수 JS 구현이 없으므로 **선택적 어댑터 capability**로 두고, 미지원 시
  pbkdf2로 폴백(또는 throw, 정책 결정 필요).
- 기본 iterations를 v5에서 600,000으로 상향(자기기술되므로 디코드는 메타를 따름 → 호환 OK).

### 디코드

- footer가 `V5`면 KDF_META를 파싱해 그 파라미터로 키 파생 → 복호화. `V4`/`V3`는 기존 경로.

### 작업 항목

1. wireFormat: `PIPELINE_V5_MARKER`, KDF_META 직렬화/파싱, AAD v5.
2. adapters: `deriveKey`가 salt/iter/hash/alg를 받도록(이미 KeyDerivationOptions 존재) +
   메시지별 랜덤 salt 생성(adapter.randomBytes).
3. EncodePipeline/DecodePrelude: V5 분기.
4. 새 옵션: `encryptionVersion?: 4 | 5`(기본 5? 또는 opt-in) — 기본값 결정 필요.
5. **테스트 벡터**: V5 인코딩 고정 벡터 + V4 역호환 디코딩 벡터.
6. 보안 리뷰: salt 인증 여부, nonce(IV) 유일성, 다운그레이드(공격자가 V5→V4 강등) 방어.

### 리스크

- 크립토 포맷 결함은 테스트로 못 잡을 수 있음 → 설계 리뷰 필수.
- 기본값 정책(v5 기본 여부, Argon2id 미지원 런타임 처리)은 제품 결정.

---

## ⑤ 진짜 스트리밍 (프레임드 와이어 포맷)

### 문제

- 현재 압축/암호화/체크섬 스트림은 사실상 **전체 버퍼링**(footer가 최종 메타라 전량 축적
  후 처리). 대용량 스트리밍에서 메모리 상한이 곧 전체 크기.

### 설계 (신규 스트림 포맷 `DDS2`)

- 프레임 단위 처리: 각 프레임이 독립적으로 압축/암호화/검증.
  ```
  [헤더 DDS2 ...] [frame]* [trailer]
  frame = len(4,BE) │ flags(1) │ [nonce(12) if enc] │ payload │ [authTag(16) if enc] │ [crc(4) if chk]
  ```
- 프레임마다 **고유 nonce**(카운터+랜덤 또는 단조 증가) — GCM nonce 재사용 절대 금지.
- 프레임별 압축(독립 deflate/brotli 블록) → 스트리밍 가능하지만 압축률 약간 저하.
- trailer에 총 프레임 수/전체 체크섬(선택)으로 truncation 공격 방어.

### 작업 항목

1. wireFormat: DDS2 헤더/프레임/trailer 직렬화·파싱.
2. WebStreams: 프레임 경계로 TransformStream 재작성(현 축적 모드 대체 또는 신규 함수).
3. nonce 관리 전략 확정(재사용 방지) + truncation/reorder 방어.
4. 테스트 벡터 + property(프레임 분할 무관 라운드트립) + 대용량 메모리 상한 테스트.

### 리스크

- 새 영구 포맷 표면 → 한 번 릴리스하면 호환 부담 영구.
- nonce/truncation 처리 오류 = 보안 결함. 설계 리뷰 필수.

---

## 권고

- ④와 ⑤는 각각 별도 PR로, **테스트 벡터 우선 작성(스펙 락) → 구현 → 보안 리뷰** 순서로.
- 둘 다 기존 V4/DDS1 포맷 디코딩을 깨지 않는 것을 회귀 테스트로 고정.
