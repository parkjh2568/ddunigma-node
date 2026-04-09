# Ddu64 v3 Compatibility Scope

## Purpose

This document freezes what `Ddu64` must preserve in v3.

The rule is simple:

- existing users should be able to upgrade the package
- keep using `Ddu64`
- avoid runtime breakage caused by API redesign for the new path

## Compatibility Level

`Ddu64` is a **compatibility-first API** in v3.

It is not the primary surface for major redesign.
It is the stable surface for existing integrations.

## Must Preserve

### Export

- `Ddu64` remains exported from the package root

### Construction

The following construction patterns must keep working:

```ts
new Ddu64()
new Ddu64(dduChar, paddingChar)
new Ddu64(dduChar, paddingChar, options)
new Ddu64(undefined, undefined, { dduSetSymbol: DduSetSymbol.ONECHARSET })
```

### Option Compatibility

These option families must remain supported on `Ddu64`:

- `dduSetSymbol`
- `encoding`
- `usePowerOfTwo`
- `useBuildErrorReturn`
- `throwOnError`
- `compress`
- `compressionAlgorithm`
- `compressionLevel`
- `maxDecodedBytes`
- `maxDecompressedBytes`
- `urlSafe`
- `encryptionKey`
- `checksum`
- `chunkSize`
- `chunkSeparator`
- `streamAutoDetect`

### Core Methods

These methods must remain supported:

- `encode`
- `decode`
- `decodeToBuffer`
- `encodeAsync`
- `decodeAsync`
- `decodeToBufferAsync`
- `getStats`
- `getCharSetInfo`

### Stream Compatibility

These must continue working:

- existing top-level stream helpers used with `Ddu64`
- legacy footer-only stream decode behavior
- current header-based stream decode behavior

### Payload Compatibility

`Ddu64` must continue to decode:

- current legacy block payloads
- current checksum payloads
- current encrypted payloads
- current compressed payloads
- current stream payloads with `DDS1`
- current footer-only legacy stream payloads

## Can Change Carefully

The following are allowed only if they do not violate the preserve rules above:

- internal refactors
- new warnings in docs
- new tests and fixtures
- additive helper methods
- additive support for reading new-format payloads, if it does not disrupt old-format behavior

## Should Not Change Inside Ddu64

These changes should move to the new class instead:

- object-first config as the primary shape
- removal of flat legacy option names
- mandatory new wire-format emission
- stricter defaults that would reject existing valid usage
- changes that alter existing decode heuristics in a breaking way

## New-Class Boundary

If a feature requires any of the following, it should live in `DduCodec` instead of `Ddu64`:

- incompatible configuration model
- explicit versioned wire format as the default output
- new validation rules that reject previously valid `Ddu64` inputs
- significantly different stream contract

## Compatibility Test Requirements

Before v3 release, add or preserve tests for:

- constructor shape compatibility
- legacy encode/decode round trip
- legacy stream decode
- checksum compatibility
- encryption compatibility
- compression compatibility
- URL-safe compatibility
- benchmark smoke coverage for common `Ddu64` usage

## Success Condition

This compatibility scope is satisfied when:

- an existing `Ddu64` consumer can upgrade without changing code
- their existing encoded data still decodes
- docs clearly explain that new work should prefer `DduCodec`, while `Ddu64` remains supported
