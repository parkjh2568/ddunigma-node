# Changelog

이 프로젝트의 공개 변경 이력은 이 문서에서 관리합니다.

이전 버전 전체 이력은 완전하게 복원되지 않았기 때문에, 아래 기록은 현재 유지보수 기준이 정리된 시점부터 신뢰 가능한 항목만 포함합니다.

형식은 Keep a Changelog 스타일을 따르며, 버전은 SemVer를 기준으로 기록합니다.

## [Unreleased]

### Policy

- 사용자에게 보이는 변경만 기록합니다.
- 내부 리팩토링만 있고 동작 변화가 없으면 필요할 때만 요약합니다.
- 배포 전에 `Unreleased` 항목을 정리하고 버전 섹션으로 승격합니다.

### Changed

- 문서 역할을 `README`, `PROJECT_STATUS`, `RELEASE`, `CHANGELOG` 기준으로 다시 정리하고 검증 명령 표기를 현재 상태에 맞게 동기화

## [2.1.1] - 2026-04-09

### Added

- 공개 `createEncodeStream` / `createDecodeStream` API에 압축과 암호화 조합 지원 추가
- decode stream footer auto-detect 지원 추가
- DDU/Korean text, TWOCHARSET mixed text, incompressible binary를 포함한 benchmark 시나리오 추가
- GitHub Actions CI(`lint`, `build`, `test`, `pack:check`) 추가
- `PROJECT_STATUS.md` 기반의 내부 상태 문서 체계 정리

### Changed

- Node.js 지원 기준을 `>=18.0.0`으로 명확화
- async encode/decode 문서 설명을 실제 fallback 동작과 일치하도록 정리
- benchmark 메모리 표시를 샘플링 기반 peak heap 기준으로 정리
- lint 범위를 유지보수 대상 경로(`src`, `benchmarks`, config files`) 중심으로 정리

### Fixed

- `chunkSeparator` 디코드 경로가 `options.chunkSeparator`를 반영하지 않던 문제 수정
- 공백 문자를 포함한 custom charset에서 stream decode가 데이터를 훼손하던 문제 수정
- `DduPipeline`의 brotli compress/decompress 지원 정리
- stream crypto/footer 처리 순서와 공개 stream API 회귀 케이스 보강
