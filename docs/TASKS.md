# 6.3.0 출시 전 남은 작업

상태 재확인: 2026-10-15. 아래 로컬·원격 검증을 확인했으며 출시 완료는 아직 확인하지 않았다.
로컬 검증과 외부 계정·원격 CI·실제 배포 확인을 구분한다. 아래 완료 증거를 확인하기 전
출시 완료로 처리하지 않는다.

사용 계약은 [REFERENCE](REFERENCE.md), 설계·최적화 근거는 [DECISIONS](DECISIONS.md),
검증·배포 절차는 [CONTRIBUTING](../CONTRIBUTING.md#호환성릴리스)에서 관리한다.
이 파일에는 현재 미완료 항목만 두며 완료된 작업 상세와 중복 사용 예제는 남기지 않는다.

| ID  | 작업                                 | 상태                            |
| --- | ------------------------------------ | ------------------------------- |
| T03 | 외부 배포 계정·저장소 설정 확인      | 외부 확인 대기                  |
| T12 | 최종 커밋 검증·태그·릴리스·배포 확인 | 진행; T03과 최종 커밋 검증 선행 |

## T03 외부 배포 설정

- GitHub API에서 canonical 저장소는 `parkjh2568/ddunigma-node`로 확인했다. origin의
  `keyConvert/ddunigma-node`는 같은 저장소로 redirect하며 package metadata의 주소와 일치한다.
- [ ] npm Trusted Publisher의 owner/repository/workflow/environment를 실제 GitHub 저장소와
      `.github/workflows/publish.yml`에 대조한다. 현재 workflow는 `publish.yml`, environment는 `npm`이다.
- [ ] GitHub environment `npm`의 권한·보호 설정을 확인한다. URL redirect나 공개 metadata만으로
      외부 publisher 설정이 갱신됐다고 판단하지 않는다.
      공개 environment 조회는 404였으며 미설정과 조회 권한 부족을 구분하지 못했다.

## T12 최종 검증과 출시

다음 순서로 진행한다. T03 확인은 준비·검증과 병행할 수 있지만 Release 게시 전에 완료해야 한다.

- [ ] 출시 준비 시 CHANGELOG의 Unreleased를 실제 버전·날짜로 옮기고 README·REFERENCE의
      6.3.0 안내를 맞춘다. 문서 갱신만으로 배포 완료로 처리하지 않는다.
- [ ] 구현·테스트·문서·신규 benchmark를 포함한 최종 변경을 커밋하고 출시 대상 SHA를 확정한다.
- [ ] 해당 커밋의 `pnpm verify`, `pnpm bench:guard`, `pnpm smoke:browser` 결과를 확인한다.
      이전 코드의 로컬 통과를 최종 커밋의 완료 근거로 대신하지 않는다.
- [ ] 같은 SHA의 원격 CI에서 Node 24 전체 검사, Node 22·26, Bun·Deno와 세 브라우저 job을 확인한다.
- [ ] T03과 검증 완료 후 `package.json`의 `6.3.0`에 맞는 `v6.3.0` tag를 해당 커밋에 연결한다.
- [ ] 정식 GitHub Release를 게시하고 npm 배포 workflow의 성공을 확인한다.
- [ ] 실제 게시된 버전을 설치해 ESM/CJS·타입·browser·공개 진입점을 확인한다.

[배포 workflow](../.github/workflows/publish.yml)는 정식 Release 게시 시 npm 배포를 실행한다.
버전·문서·태그 대상과 검증 결과를 게시 전에 확정한다.

## 최근 검증 기록

2026-10-15, `9b5eab7`의 production 코드에 문서·호환성 검사 스크립트를 정리한 작업 트리에서
Node 24.21.0의 `pnpm verify`(30개 파일·1,244개 테스트)와 성능 가드 6개를 통과했다.
실제 Chromium 153.0.8010.12·Firefox 155.0·WebKit 26.6 검사와 공식 npm 6.2.0의
양방향 호환성 75개 사례를 확인했고, 지원 외 버전·잘못된 metadata 등 11개 입력을 import 전에 거부했다.

Apple M1 Pro에서 기존 지연 benchmark를 API별 20표본으로 실행했다. `createDdu`의 8MiB 평문
encode p95는 50.98ms, 왕복 p95는 91.15ms였다. 별도 5표본에서 첫 PBKDF2 포함 encode 중앙값은
29.16ms, 같은 인스턴스 재사용은 0.087ms였다. 이는 현재 두 API의 합성 부하 측정이며 전후 개선율이나 운영 SLO가 아니다.
관측 메모리는 같은 프로세스의 누적·GC 영향을 포함하므로 요청별 최대 메모리로 해석하지 않는다.

`9b5eab7`의 [원격 CI](https://github.com/parkjh2568/ddunigma-node/actions/runs/38697841880)는
Node 24 전체 검사, Node 22·26, Bun·Deno와 세 브라우저를 포함한 8개 job이 성공했다.
이번 정리를 포함한 출시 SHA의 커밋·원격 재검증, T03, tag·실제 배포 확인은 남아 있다.
