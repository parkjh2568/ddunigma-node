# ddunigma-node Refactor Task Notes

Temporary working task document for V1/V2-compatible structural refactoring.

Current date: 2026-05-28

## Current Status

Current non-breaking refactor scope is complete and validated.

- V1 `DDU_V1` and V2 default compatibility are guarded by sync, async, WebStreams, and fixture tests.
- `Ddu64Core` remains the public facade while low-risk internals have been split into helper modules.
- Custom typed errors are exported from root, browser, and core entry points.
- No runtime dependency has been added.
- Remaining work is limited to release/merge checklist items and major-version-only decisions.

## Compatibility Contract

- V2 default constructor behavior must remain stable: `new Ddu64()`.
- V1 legacy constructor behavior must remain stable:
  `new Ddu64({ dduSetSymbol: DduSetSymbol.DDU_V1 })`.
- Existing V1/V2 encoded payloads must continue to decode.
- Existing encode output fixtures must not change unless a test fixture explicitly documents a new format.
- No runtime dependency may be added.
- Public API signatures should remain source-compatible during this refactor.

## Priority Order

1. Add/extend V1 and V2 compatibility safety tests. [done]
2. Add custom error types and expose encode/decode failures as typed `Ddu64Error` subclasses. [done]
3. Split low-risk `Ddu64Core` responsibilities into internal modules. [done]
4. Split encode/decode pipeline boundaries while preserving V1/V2 output. [done]
5. Keep V1/V2 WebStreams, sync, async, checksum, compression, encryption, and WASM fallback behavior stable. [done]
6. Extend benchmarks and error coverage after pipeline boundaries are stable. [done]
7. Leave breaking changes for a future major version only.

## Work Items

### P0. Compatibility Tests

- Add tests for V2 default sync/async/WebStreams round-trip.
- Add tests for V1 `DDU_V1` sync/async/WebStreams round-trip.
- Add tests that existing V1/V2 fixture outputs remain fixed.
- Add tests that custom errors preserve V1/V2 decode behavior.

Status:

- V1/V2 WebStreams guard exists in `src/test/WebStreams.test.ts`.
- V1/V2 fixture sync guards exist in `src/test/backward-compat.test.ts`.
- V1/V2 async fixture guards added for representative compatibility vectors.

### P1. Custom Errors

- Add `Ddu64Error` base class with stable `code`, `operation`, and optional `cause`.
- Add specialized errors for encode, decode, compression, decompression, encryption, decryption, checksum, charset, limit, adapter, obfuscation, and stream failures.
- Wrap public encode/decode boundaries so raw internal/runtime exceptions are not exposed directly.
- Preserve useful original messages through `cause` and message text.

Status:

- Added `src/core/errors.ts`.
- Exported errors from root, browser, and core entries.
- Wrapped public sync/async encode/decode boundaries.
- Wrapped WebStreams flush/transform errors.
- Added tests for adapter, checksum, and charset error typing.

### P2. Ddu64Core Low-Risk Splits

- Move native Base64 fast path into an internal module.
- Move sync adapter crypto/compression gateway into an internal module.
- Extract constructor overload helper shared by Node and Browser wrappers.
- Keep wire format and output bytes unchanged.

Status:

- Native Base64 fast path moved to `src/core/internal/NativeBase64FastPath.ts`.
- Sync adapter gateway moved to `src/core/internal/SyncAdapterGateway.ts`.
- Constructor overload helper moved to `src/core/internal/constructorOptions.ts`.
- Index-to-string hot path moved to `src/core/internal/IndexStringMapper.ts`.

### P3. Ddu64Core Pipeline Preparation

- Prepare encode/decode prelude/finalize boundaries.
- Avoid a large behavioral rewrite until compatibility tests are stable.
- Keep `Ddu64Core` as facade over extracted helpers.

Status:

- Decode validation helpers extracted to `src/core/internal/DecodeValidation.ts`.
- Decode prelude extracted to `src/core/internal/DecodePrelude.ts`.
- Encode footer/final post-processing extracted to `src/core/internal/EncodeFinalize.ts`.
- Sync/async decode pipeline shell extracted to `src/core/pipeline/DecodePipeline.ts`.
- Sync/async encode pipeline shell extracted to `src/core/pipeline/EncodePipeline.ts`.
- `Ddu64Core.ts` is down from about 1370 LOC to 799 LOC while still preserving the public facade and subclass-facing protected fields.

Completed tasks:

1. Extract decode validation helpers.
   - Candidate file: `src/core/internal/DecodeValidation.ts`
   - Move `normalizeLimit`, `estimateDecodedBytes`, `assertEncodedInputAligned`, and `assertCanonicalPadding`.
   - Preserve error messages and typed error wrapping.
   - Acceptance: V1/V2 fixture tests unchanged, targeted tests green.

2. Extract decode prelude.
   - Candidate file: `src/core/internal/DecodePrelude.ts`
   - Move chunk removal, URL-safe reversal, checksum extraction, deobfuscation, footer parsing, input validation, and BitPack decode orchestration.
   - Keep `decodeChars` callback or context small so lookup tables remain private.
   - Acceptance: no encoded output changes, corrupted input tests still throw typed `Ddu64Error`.

3. Extract encode finalize/post-processing.
   - Candidate file: `src/core/internal/EncodeFinalize.ts`
   - Move footer building, obfuscation ordering, checksum suffix, URL-safe conversion, and chunking.
   - Preserve the current order: obfuscation -> checksum -> URL-safe -> chunking.
   - Acceptance: V1/V2 known vectors and checksum fixtures unchanged.

4. Extract sync/async pipeline shell.
   - Candidate files: `src/core/pipeline/EncodePipeline.ts`, `src/core/pipeline/DecodePipeline.ts`
   - Share stage structure between sync and async paths while injecting sync/async compression/encryption functions.
   - Acceptance: `Ddu64Core` remains facade, progress callback stages/percentages unchanged.

5. Add custom error tests for async and streams.
   - Current typed error tests cover adapter, checksum, and invalid charset.
   - Add async decrypt failure and WebStreams failure classification.
   - Acceptance: callers can branch on `Ddu64ErrorCode` without parsing strings.

### P4. Low-Risk Cleanup

- Normalize ESM import extensions.
- Align `detectRuntime` with `RuntimeId`.
- Remove stale WASM empty section or debug-only script only if safe.
- Avoid removing deprecated fields while V1/V2 compatibility is the priority.

Status:

- `src/presets.ts` import extension normalized.
- `detectRuntime` now returns `unknown`; `getAdapter` remains responsible for throwing.
- Empty WASM panic handler section removed.
- Unreferenced debug script `scripts/test-decode.ts` removed.
- Deprecated constructor options intentionally preserved.

### P5. Docs / CI / Bench

- Add `typecheck` script.
- Add `prepublishOnly` safety gate.
- Clarify Node/browser/Deno/Workers/Bun entry usage.
- Extend benchmarks after functional refactors are green.

Status:

- Added `typecheck` script.
- Added `prepublishOnly` gate.
- README entry point table clarified.
- README custom error handling section added.
- Error export smoke test added for root, browser, and core entries.
- Benchmarks expanded with V1, 8MB JS/WASM, and WebStreams cases.

Completed tasks:

1. Extend `benchmarks/encoding-benchmark.ts`.
   - Add V1 DDU_V1 case.
   - Add WebStreams V2 streaming case.
   - Add 8MB JS vs WASM case with lower iteration count.
   - Keep `pnpm bench` runtime reasonable.

2. Document custom errors in README.
   - Add `Ddu64Error`, `Ddu64ErrorCode`, and `isDdu64Error` example.
   - Show checksum/decode handling without string parsing.

3. Add one small export smoke test for errors.
   - Verify root, browser, and core entries expose `Ddu64ErrorCode`.

### P6. Follow-Up Internal Refinement

- Extract payload BitPack/WASM/native Base64 encode/decode into a codec helper.
- Extract async adapter crypto/compression gateway beside the sync gateway.
- Extract obfuscation alphabet construction.
- Add TypeDoc grouping for public sync, async, and introspection APIs.
- Apply NodeAdapter zero-copy Buffer view conversion for zlib/brotli inputs.
- Add constant-time checksum comparison helper.

Status:

- Payload codec extracted to `src/core/internal/PayloadCodec.ts`.
- Async adapter gateway extracted to `src/core/internal/AsyncAdapterGateway.ts`.
- Obfuscation alphabet factory extracted to `src/core/internal/ObfuscationAlphabet.ts`.
- Charset lookup table builder extracted to `src/core/internal/CharsetLookup.ts`.
- Public API comments now include `@group Sync`, `@group Async`, and `@group Introspection`.
- `NodeAdapter` now uses Buffer views for compression/decompression inputs instead of copying input bytes.
- Checksum verification now uses `constantTimeEquals`.
- `Ddu64Core.ts` is 799 LOC after this pass.

## Validation Snapshot

Last verified on 2026-05-28.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed |
| `pnpm test` | Passed, 18 files / 759 tests |
| `pnpm build` | Passed, ESM/CJS/DTS |
| `pnpm pack:check` | Passed, `entryCount=34`, `unpackedSize=249061` |
| `pnpm bench` | Passed |

Latest benchmark highlights:

| Case | Mode | Encode ms | Decode ms | MB/s |
| --- | --- | ---: | ---: | ---: |
| Base64 text 256KB | native-base64 | 16.5 | 16.8 | 225.2 |
| DDU text 256KB | js-bitpack | 58.1 | 40.7 | 38.0 |
| DDU text 256KB | wasm-bitpack | 47.9 | 33.1 | 46.3 |
| DDU_V1 text 256KB | legacy-v1 | 60.2 | 46.2 | 23.5 |
| 50-char binary 256KB | variable-charset | 60.8 | 49.3 | 22.7 |
| DDU binary 8MB | large-js | 169.5 | 151.9 | 49.8 |
| DDU binary 8MB | large-wasm | 149.1 | 145.2 | 54.4 |
| DDU WebStreams text 256KB | stream | 17.3 | 18.0 | 35.4 |

## Completed Queue

1. P3-1 Decode validation extraction.
2. P3-2 Decode prelude extraction.
3. P3-3 Encode finalize/post-processing extraction.
4. P3-4 Sync/async pipeline shell extraction.
5. P3-5 Async/stream custom error coverage.
6. P5-1 Benchmark expansion.
7. P5-2 README custom error docs.
8. P5-3 Error export smoke test.
9. Review `TYPED_INDICES_THRESHOLD` vs `wasmThreshold` naming/comment clarity.
10. Keep deprecated `useBuildErrorReturn` and `bitLength` untouched until a major release.
11. P6-1 Payload codec helper extraction.
12. P6-2 Async adapter gateway extraction.
13. P6-3 Obfuscation alphabet factory extraction.
14. P6-4 TypeDoc API grouping.
15. P6-5 NodeAdapter zero-copy Buffer view optimization.
16. P6-6 Constant-time checksum comparison helper.

## Remaining Work

### Current Scope

No non-breaking implementation task remains in this refactor scope.

### Release / Merge Checklist

1. Review the full refactor diff before merge.
2. Decide whether to keep this task document in the repository or convert it into release notes.
3. Re-run `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm pack:check` after final review changes.
4. Optionally validate runtime matrix beyond Node.js: browser bundle, Workers/Deno/Bun targets.
5. Confirm package version and changelog/release note wording before publishing.

## Deferred Major-Version Items

- Remove deprecated `useBuildErrorReturn`.
- Remove deprecated `bitLength` constructor option.
- Add a new authenticated wire format with AES-GCM AAD.
- Change root export behavior for runtime-specific conditions.
- Raise `engines` in a breaking way.
