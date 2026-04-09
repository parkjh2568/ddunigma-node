# Release Guide

이 문서는 `@ddunigma/node` 배포 전 확인용 체크리스트입니다.

## Versioning

- 사용자 영향이 없는 내부 정리만 있으면 patch
- 공개 API 추가나 기본 동작 확장은 minor
- 기존 동작 호환성을 깨면 major

## Before Release

1. `package.json` 버전을 결정합니다.
2. `CHANGELOG.md`의 `Unreleased` 내용을 새 버전 섹션으로 이동합니다.
3. 아래 검증을 모두 통과시킵니다.

```bash
pnpm lint
pnpm build
pnpm test
pnpm pack:check
pnpm bench
```

4. `README.md`와 `CHANGELOG.md`가 현재 동작과 맞는지 확인합니다.
5. 배포 산출물 확인을 위해 `pnpm pack:check` 또는 `npm pack` 결과를 점검합니다.

현재 CI 기본 검증도 같은 순서로 `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm pack:check`를 실행합니다.

## Recommended Pack Check

```bash
pnpm pack:check
npm pack --dry-run
```

확인할 항목:

- `dist/`만 publish 대상에 포함되는지
- 불필요한 테스트/로컬 스크립트/숨김 디렉터리가 포함되지 않는지
- 타입 파일(`index.d.ts`, `index.d.cts`)이 함께 포함되는지
- source map(`.map`) 파일이 publish 대상에서 제외되는지

## Publish

```bash
npm publish
```

배포 후 확인:

- npm package page에서 버전/README 반영 확인
- install smoke test 확인

## Git Tag

권장 태그 형식:

```bash
git tag v<version>
git push origin v<version>
```

## Notes

- benchmark는 성능 비교 참고용이며 배포 차단 기준은 아닙니다.
- 릴리즈 노트의 원본은 항상 `CHANGELOG.md`를 기준으로 유지합니다.
