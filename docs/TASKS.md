# 6.3.0 출시 전 남은 작업

상태 재확인: 2026-10-14. 최근 코드 검증은 2026-10-13이며 출시 완료는 아직 확인하지 않았다.
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

- [ ] npm Trusted Publisher의 owner/repository/workflow/environment를 실제 GitHub 저장소와
      `.github/workflows/publish.yml`에 대조한다. 현재 workflow는 `publish.yml`, environment는 `npm`이다.
- [ ] GitHub environment `npm`의 권한·보호 설정을 확인한다. URL redirect나 공개 metadata만으로
      외부 publisher 설정이 갱신됐다고 판단하지 않는다.

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

## 최근 로컬 검증 기록

2026-10-13 성능 최적화 후 Node 24.21.0의 `pnpm verify`(30개 파일·1,244개 테스트),
Node 22.18.0의 같은 테스트와 Node/web smoke, Bun 1.3.10의 web smoke를 통과했다.
성능 가드 6개, 실제 Chromium 153.0.8010.12·Firefox 155.0·WebKit 26.6 검사도 통과했다.
이 후속 코드의 Node 26·Deno 추가 실행과 원격 CI·tag·실제 배포는 완료하지 않았다.
문서 정리의 format·링크·pack 검사는 코드·런타임 검증을 대신하지 않는다.
