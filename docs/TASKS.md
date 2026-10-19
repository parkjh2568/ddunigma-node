# 6.3.0 출시 전 남은 작업

상태 기준: 2026-10-15. 6.3.0 출시 완료는 아직 확인하지 않았다.

사용 계약은 [REFERENCE](REFERENCE.md), 설계·최적화 근거는 [DECISIONS](DECISIONS.md),
검증·배포 절차는 [CONTRIBUTING](../CONTRIBUTING.md#호환성릴리스)에서 관리한다.
현재 미완료 상태만 기록하며 공통 출시 절차와 완료된 작업 상세는 반복하지 않는다.

| ID  | 작업                                 | 상태                    |
| --- | ------------------------------------ | ----------------------- |
| T03 | 외부 배포 계정·저장소 설정 확인      | 외부 확인 대기          |
| T12 | 최종 커밋 검증·태그·릴리스·배포 확인 | 출시 SHA 확정·검증 필요 |

## T03 외부 배포 설정

- [ ] npm Trusted Publisher의 owner/repository/workflow/environment를 실제 GitHub 저장소와
      대조한다. 확인된 canonical은 `parkjh2568/ddunigma-node`, workflow는 `publish.yml`, environment는 `npm`이다.
- [ ] GitHub environment `npm`의 권한·보호 설정을 확인한다. 공개 조회의 404로는 미설정과
      권한 부족을 구분하지 못했으며 origin redirect도 Publisher 설정 확인을 대신하지 않는다.

## T12 최종 검증과 출시

- [ ] [릴리스 절차](../CONTRIBUTING.md#호환성릴리스)에 따라 6.3.0 출시 문서·최종 SHA를 확정하고
      해당 SHA의 로컬·원격 검증을 확인한다. 아래 과거 결과를 대신 사용하지 않는다.
- [ ] T03과 검증 완료 후 `v6.3.0` 태그·정식 Release·npm 배포·설치한 패키지 확인을 마친다.

## 검증 기준점

2026-10-15, `9b5eab7` 기반 문서·호환성 스크립트 수정 작업 트리에서 Node 24.21.0의
`pnpm verify`(1,244개 테스트), 성능 가드 6개·세 브라우저·공식 6.2.0 양방향 호환 검사를 통과했다.
별도로 `9b5eab7`의 [원격 CI 8개 job](https://github.com/parkjh2568/ddunigma-node/actions/runs/38697841880)이 성공했다.
이 기록은 현재 또는 이후 출시 SHA의 검증·T03·실제 배포 완료를 뜻하지 않는다.
