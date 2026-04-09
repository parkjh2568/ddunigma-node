# ddunigma-node Project Status

Last verified: 2026-04-09

## Summary

`ddunigma-node` is a Node.js custom encoding library that supports:

- Custom and predefined charsets
- Compression (`deflate`, `brotli`)
- AES-256-GCM encryption
- CRC32 checksum
- Chunked encoding
- Async encode/decode paths
- Public stream encode/decode APIs
- Benchmark and test tooling

This document is the current internal source of truth for project progress and release readiness.

## Current State

The project is functionally stable and the main verification flow passed on 2026-04-09.

- Build: passing
- Tests: passing
- Lint (`src`, `benchmarks`, config files): passing
- Pack verification: passing
- Benchmark script: passing
- CI workflow: added (`lint`, `build`, `test`, `pack:check`)

## Verification Snapshot

Verified commands:

```bash
pnpm lint
pnpm build
pnpm test
pnpm pack:check
pnpm bench
```

Observed results:

- `pnpm test`: `5` test files passed, `389` tests passed
- `pnpm pack:check`: npm pack dry-run passed, `9` published entries verified
- `pnpm bench`: benchmark scenarios completed for plain, chunked, compressed, encrypted, and stream flows

## Completed Work

### Public API and Core Features

- `Ddu64` supports sync and async encode/decode
- `decodeToBuffer` and `decodeToBufferAsync` are available
- URL-safe mode, chunk splitting, checksum, and decode limits are implemented
- Compression markers, footer parsing, and whole-payload fallback behavior are stabilized

### Crypto, Compression, and Streams

- AES-256-GCM encode/decode flows are implemented
- Public `createEncodeStream` / `createDecodeStream` support compression and encryption chains
- Default stream auto-detect uses a small header so decode can begin before EOF
- Legacy footer-only stream payloads remain decodable through the default path
- `DduPipeline` supports both `deflate` and `brotli`

### Compatibility and Regression Coverage

- `chunkSeparator` decode respects `options.chunkSeparator`
- Stream decode no longer strips whitespace that belongs to a custom charset
- Custom charset and padding reject reserved `\r` / `\n` transport characters
- URL-safe transport conversion works independently from payload `encoding`
- Preset charset ordering and stream wire headers have fixed compatibility assertions
- Regression tests cover chunk separators, whitespace charsets, URL-safe non-UTF payloads, early stream decode, legacy footer compatibility, preset fingerprints, and brotli pipeline round-trips

### Tooling, Packaging, and Documentation

- Lint, build, test, pack verification, and benchmark scripts are aligned with current package layout
- `pack:check` validates required publish files and rejects source maps from npm payloads
- GitHub Actions CI verifies `lint`, `build`, `test`, and `pack:check`
- Project documents are split by responsibility: public guide, internal status, release checklist, and public changelog

## Documentation Status

- `README.md`
  - Current public usage guide and API overview
- `PROJECT_STATUS.md`
  - Current internal status, verified commands, and completed-work summary
- `CHANGELOG.md`
  - Public release history from the current maintained baseline onward
- `RELEASE.md`
  - Release checklist and publish verification steps

## Authoritative Documents

These are the documents that should remain authoritative:

- `README.md`
  - Public usage, API overview, installation, stream examples, benchmark usage
- `PROJECT_STATUS.md`
  - Internal current state, progress summary, verification status, cleanup guidance
- `CHANGELOG.md`
  - Public release notes and user-facing change history
- `RELEASE.md`
  - Release checklist and packaging/publish workflow
- `package.json`
  - Runtime requirements, scripts, package entrypoints
- `LICENCE`
  - License terms

## Runtime / Tooling Baseline

- Required Node.js version: `>=18.0.0`
- Build target: `ES2022`
- Package format: ESM + CJS exports
- Test runner: `vitest`
- Bundler: `tsup`

## Known Notes

- Lint intentionally targets maintained source/config paths rather than hidden tool directories or build artifacts
- Stream decode auto-detects footer metadata by default; `streamAutoDetect: false` can be used to opt back into explicit streaming pipelines
- Benchmark peak heap is sampled rather than profiler-grade true peak memory, and synchronous CPU-heavy paths may still under-report true peaks
- Repository worktree contains unrelated historical file changes outside this documentation cleanup

## Recommended Next Work

These are no longer blockers, but are reasonable follow-ups:

- Add install smoke-test automation to CI or release automation if desired
- Consider filling `package.json` description and other npm metadata before the next publish

## Cleanup Rule

Going forward:

- Keep `README.md` as the user-facing manual
- Keep `PROJECT_STATUS.md` as the internal status snapshot
- Do not recreate ad hoc plan/result markdown files unless they are temporary and scheduled for deletion
