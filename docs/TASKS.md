# 남은 작업

데이터·인증·한도·호환성 → 공개 계약 → 측정된 성능 순서로 판단한다.
구현·측정 결과는 [설계 결정](DECISIONS.md), 공개 배포물과 원격 CI의 읽기 검증 증거는
[릴리스 감사](RELEASE_AUDIT.json), 실행·검증 방법은 [CONTRIBUTING](../CONTRIBUTING.md)을 따른다.
완료된 계측·소비자 검사 도구 구현은 이 목록에서 제거했다.

## P1 · 기존 릴리스의 남은 증거

- [ ] **R1 · 6.3.0의 과거 실행 확인:** 공개 tarball 무결성과 ESM/CJS·NodeNext·browser
      bundle 소비자는 통과했다. 현재 API에는 npm gitHead와 같은 SHA의 CI·Release/tag가
      보이지 않는다. 보존된 과거 실행/게시 기록이 있으면 실제 SHA·attempt·job 결과를 대조한다.
      기록 부재만으로 과거 게시 실패나 미수행을 단정하지 않으며 새 과거 태그로 증거를 만들지 않는다.
- [ ] **R2 · 관리자 설정 확인:** 실제 npm Trusted Publisher owner/repository
      `parkjh2568/ddunigma-node`·workflow `publish.yml`·environment `npm`·직접 게시 허용,
      GitHub environment reviewer·branch/tag 정책·보호/우회 설정을 확인한다.
      현재 `npm trust list`는 E401, GitHub 설정 조회는 연결 허용 범위/권한 제한으로 미확인이다.
      사용 가능한 브라우저에서도 npm/GitHub가 로그아웃 상태여서 관리자 설정을 읽지 못했다.
      유효한 관리자 읽기 접근 후 값을 대조하고 변경이 필요하면 먼저 구체적 변경안을 검토한다.

## P2 · 운영 목표와 조건부 확장

- [ ] **M2 · 실제 workload/SLO:** 초당 원문 바이트·입력 크기 분포·동시 작업/스트림 수·
      encode/decode p95·event-loop 지연·queue 대기·RSS·취소 목표와 대상 runtime을 확정한다.
      현재 결과는 synthetic workload다. 고정 동시성 Promise.all은 실서비스 도착률 모델이 아니다.
- [ ] **M5 · 목표 미달 시 CPU/Worker 대조:** M2에서 미달한 workload가 있을 때 CPU profile과
      비동기 단계 시간/queue 관측으로 CPU와 대기를 구분한다. 직접 실행과 bounded worker pool의
      cold/warm·copy/transfer·대기·취소·종료·포화 거부·재시도·RSS를 포함해 대조한다.
      목표가 없거나 총비용이 더 크면 도입하지 않는다. 앱 계층 적용을 우선하며 API·wire·입력
      보존·인증·한도·KDF 강도를 유지한다. 실제 목표 없이 임의 Worker API를 추가하지 않는다.

## P2 · 원격 성능 관측

- [ ] **C1 · 같은 SHA의 수동 workflow 실행:** 구현된 [측정 workflow](../.github/workflows/benchmarks.yml)를
      원격 반영 후 실행해 실제 artifact 업로드·실패 보존·timeout을 확인한다. 원격 실행 전에는
      로컬 YAML/Bash/실패 모의 검증만 완료한 상태다. 취소·runner 중단 시 업로드는 보장되지 않는다.
- [ ] **C1 · gate 판단:** 같은 runner·같은 SHA의 독립 반복으로 분산과 거짓 실패 가능성을
      관측하고 latency gate의 실익·판정/재실행 규칙을 정한다. 성공/실패 원시 결과를 함께
      보존하고 기존 guard 하한을 낮추지 않는다. 하드웨어가 다른 로컬 수치를 그대로 적용하지 않는다.

## P1 · 다음 릴리스

- [ ] **R3 · 버전과 최종 SHA:** 출시할 변경·다음 버전·CHANGELOG·README/REFERENCE를 맞추고
      commit SHA를 확정한다. 현재 6.3.0 번호나 과거 태그에 수정 내용을 덮어쓰지 않는다.
- [ ] **R3 · 검증:** 해당 SHA의 verify·guard·세 브라우저, 원격 Node 24 전체 검사·Node22/26
      테스트/smoke·Bun/Deno web smoke·세 브라우저 smoke의 실제 버전/OS·attempt·결과를 확인한다.
      다른 SHA의 성공으로 대체하지 않고 취소·생략·미실행을 성공과 구분한다.
- [ ] **R3 · 게시와 설치 확인:** R1/R2 및 출시 증거 검토 후 tag·정식 Release·게시를 진행하고,
      공개된 정확한 버전의 integrity와 별도 소비자를 검사한다. 게시 후 결함은 후속 릴리스로 처리한다.
      조건부 성능 실험 전체를 출시 선행조건으로 만들지는 않는다.

새 코드 변경은 Architect → Implementation Engineer → 독립 Reviewer/SRE 검토 → 수정 →
변경별 최종 검증을 거친다. 단순 조건·변환은 기존 함수 안에서 동기적으로 작성하고,
공유 metadata·프로세스/오류 경계처럼 실제 재사용·독립 책임이 있을 때만 분리한다.
