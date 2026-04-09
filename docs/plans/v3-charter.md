# ddunigma-node v3 Charter

## Status

- Phase: Charter
- Owner: Maintainer team
- Date: 2026-04-09
- Scope: Next major release of `@ddunigma/node`

## Release Theme

v3 is a **compatibility-first expansion release**.

The goal is to move the package forward without breaking existing `Ddu64` users. New design work should be enabled, but it should not be forced into the legacy surface if that creates compatibility risk.

## Product Statement

`@ddunigma/node` v3 is a Node-first encoding transport library that preserves `Ddu64` as a stable compatibility surface while introducing a cleaner next-generation API for new work.

## Why v3 Exists

The current library already delivers meaningful capability:

- custom charset encoding and decoding
- compression
- encryption
- URL-safe transport
- async encode/decode APIs
- stream helpers
- multi-step pipeline composition

The main pressure is now not missing features, but feature interaction complexity:

- constructor ergonomics are flexible but ambiguous
- stream and payload metadata rules are powerful but subtle
- some fallback and compatibility behavior is difficult to reason about
- docs, types, tests, and packaging are still catching up to the feature surface

That makes v3 the right time to split responsibilities:

- `Ddu64` remains stable for existing consumers
- larger API and format changes move into a new class if they cannot safely coexist

## Target Users

### Primary

- existing `Ddu64` users who need package upgrades without runtime breakage
- Node.js developers who need custom charset-based transport encoding
- maintainers who need a clearer place to evolve the API without destabilizing the legacy class

### Secondary

- teams starting new integrations who prefer a cleaner object-first API
- users embedding the library in CLI tools, services, data pipelines, and integration adapters

## Non-Goals

v3 does **not** aim to:

- remove `Ddu64`
- force existing users to rewrite their current `Ddu64` usage
- ship browser-first or cross-runtime support in the same release
- become a general-purpose cryptography framework
- add many new transform types before the new API boundary is stable

## Strategic Decisions

### 1. Preserve `Ddu64`

`Ddu64` must remain exported and usable.

Compatibility expectations:

- existing constructor usage continues to work
- existing core methods continue to work
- existing payloads continue to decode
- package upgrade alone must not force consumer rewrites

### 2. Introduce A New Primary Class For New Work

If the new API shape cannot coexist cleanly inside `Ddu64`, v3 should introduce a new class.

Recommended name:

- `DduCodec`

Alternative names:

- `DduGenerator`
- `DduTransport`

Recommendation:

- `Ddu64`: compatibility-first
- `DduCodec`: recommended for new integrations

### 3. Stricter Defaults On The New Path

The new class should prefer explicit validation over silent coercion or fallback.

That includes:

- rejecting unsupported option combinations earlier
- reducing hidden normalization when it changes semantics
- making compatibility mode explicit

### 4. Explicit Wire Format On The New Path

New-format payloads and stream payloads should have explicit version contracts.

v3 must define:

- how version metadata is encoded
- how stream metadata is detected
- how the new class handles legacy payloads
- how `Ddu64` keeps its existing compatibility expectations

### 5. Release Confidence As A Product Feature

v3 should ship with stronger operational confidence:

- golden fixtures for legacy and new-format compatibility checks
- README examples that run as smoke tests
- benchmark baselines for release comparison
- clearer publish and release verification rules

## Compatibility Rules

### `Ddu64`

- stable compatibility surface
- backward-compatible constructor and method behavior
- backward-compatible payload decode behavior
- legacy docs remain available

### `DduCodec`

- new primary API for new work
- object-first configuration
- explicit compatibility policy
- owner of new wire-format evolution

## Success Metrics

- an existing `Ddu64` user can upgrade package version without runtime breakage
- a new user understands the recommended modern API from the README in under 5 minutes
- the migration guide covers the dominant existing usage patterns
- stream metadata behavior is deterministic on the new path
- no benchmark regression greater than 10% on baseline scenarios
- publish and release verification can be run end-to-end from documented commands

## Risks

### Risk: Breaking Existing `Ddu64` Users

Treatment:

- treat `Ddu64` as compatibility surface
- move incompatible design into a new class

### Risk: Two APIs Become Confusing

Treatment:

- clearly define `Ddu64` as compatibility-first
- clearly define `DduCodec` as the recommended new path
- document the decision tree in README and migration docs

### Risk: Unclear Migration Story

Treatment:

- ship `MIGRATION-v3.md`
- provide before/after examples for top user journeys

### Risk: Scope Creep

Treatment:

- keep browser/runtime expansion outside v3 core scope
- reject unrelated feature additions during charter and RFC phases

## Locked Decisions

### Node Baseline

Decision:

- v3 package minimum: Node `>=20`
- recommended local and documentation runtime: Node `24.x LTS`
- planned v3 verification matrix: Node `20`, `22`, `24`

Implementation note:

- keep the current v2 package line at Node `>=18` until v3 implementation and release cutover begin

Reason:

- a new major should not anchor itself to an aging runtime baseline
- Node `>=20` is the best balance between modern runtime guarantees and upgrade friction
- Node `24.x LTS` is the clearest single recommended version for docs and local development

### New Class Name

Decision:

- choose `DduCodec`

Reason:

- clearer than “generator” for encode/decode responsibilities
- aligns with the actual responsibilities of the class

### Legacy Decode Policy

- keep `Ddu64` fully compatible by default
- default `DduCodec.compatibility.legacyDecode` to `"explicit"`
- keep top-level stream helper wrappers as compatibility wrappers during v3

Reason:

- existing users should upgrade without runtime surprises
- new work should opt into legacy behavior consciously instead of inheriting it silently
- wrapper retention reduces migration friction while the new class becomes established

## Deliverables Unlocked By This Charter

After this charter, the next artifacts should be:

1. `docs/plans/v3-api-rfc.md`
2. `docs/plans/v3-wire-format.md`
3. `MIGRATION-v3.md`

## Exit Criteria For Charter Phase

The charter phase is complete when:

- release theme is stable
- target users and non-goals are explicit
- `Ddu64` compatibility rules are frozen
- new-class direction is accepted
- Node baseline direction is decided
- compatibility defaults on the new path are decided
- next RFC documents can be written without reopening the product theme
