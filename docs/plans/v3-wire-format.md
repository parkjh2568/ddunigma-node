# ddunigma-node v3 Wire Format RFC

## Status

- Phase: RFC Draft
- Depends on:
  - `docs/plans/v3-charter.md`
  - `docs/plans/v3-api-rfc.md`
- Date: 2026-04-09

## Goal

Define an explicit and versioned wire format for v3 so that:

- existing `Ddu64` payload users are not broken
- new-format payload behavior is deterministic
- new-format stream behavior is deterministic
- legacy compatibility is policy-driven on the new path

## Class Ownership

### `Ddu64`

- keeps existing v2-compatible payload behavior
- continues to decode historical payloads by default
- should not be forced onto the new wire format if that risks breaking compatibility

### `DduCodec`

- owns the new v3-native wire format
- owns explicit version tags and structured metadata
- is the preferred place for new format evolution

## Why This RFC Exists

The current v2 implementation uses two metadata styles:

### Block Payloads

- encoded body is followed by `paddingChar`
- footer metadata is inferred from marker strings such as:
  - `ELYSIA` for deflate
  - `GRISEO` for brotli
  - `ENC` for encryption
  - digits for padding bits
- checksum is appended separately using `CHK<crc32>`

### Stream Payloads

- default stream mode prepends a header like `paddingChar + DDS1 + flags + paddingChar`
- legacy stream mode omits the stream header and relies on footer-only restoration
- decode auto-detect may switch between header-driven pipeline mode and legacy buffered mode

This works for compatibility, but it is not the best long-term contract for new development.

## v3 Design Principles

1. Every new-format payload should be identifiable as v3
2. Stream and non-stream formats should each have one primary contract
3. `Ddu64` compatibility must remain intact for existing payloads
4. `DduCodec` should use explicit metadata instead of inferred marker combinations
5. Decode failures should identify whether the problem is format, compatibility, or corruption

## Format Families

v3 defines two new-format families for `DduCodec`:

1. `block` payloads
2. `stream` payloads

## Proposed `DduCodec` Block Payload Format

### Shape

```text
<encoded-body><paddingChar>DDU3;<compression>;<encrypted>;<paddingBits>[;<checksum>]
```

### Fields

- `DDU3`
  - fixed version tag for block payloads
- `compression`
  - `N` = none
  - `D` = deflate
  - `B` = brotli
- `encrypted`
  - `0` = not encrypted
  - `1` = encrypted
- `paddingBits`
  - decimal integer
- `checksum`
  - optional
  - recommended form: `crc32:<8-hex>`

### Example

```text
SGVsbG8=DDU3;N;0;2
SGVsbG8=DDU3;D;1;2;crc32:1a2b3c4d
```

## Block Payload Rules

- new-format block metadata is always explicit
- the `DDU3` footer is present even when compression and encryption are off
- metadata field order is fixed

### Validation

- reject unknown version tags
- reject unknown compression codes
- reject invalid encrypted flags
- reject invalid `paddingBits`
- reject malformed checksum fields

### Checksum Policy

Recommendation:

- move checksum into the structured metadata footer on the new path
- do not keep `CHK` as the primary `DduCodec` checksum contract
- support old `CHK` only through compatibility behavior

## Proposed `DduCodec` Stream Payload Format

### Shape

```text
<paddingChar>DDS3<compression><encrypted><paddingChar><encoded-stream-chunks>
```

### Fields

- `DDS3`
  - fixed version tag for stream payloads
- `compression`
  - `N` = none
  - `D` = deflate
  - `B` = brotli
- `encrypted`
  - `0` = not encrypted
  - `1` = encrypted

### Example

```text
=DDS3D0=<encoded-chunks...>
=DDS3B1=<encoded-chunks...>
```

## Stream Payload Rules

- new-format stream payloads always carry the `DDS3` header
- header-driven decoding is the canonical path
- footer-only stream mode is legacy-only

### Behavior

- decoder reads the header first
- header determines decompression and decryption pipeline
- payload body is restored without legacy footer inference

## `Ddu64` Compatibility Policy

- `Ddu64` continues to support legacy payloads by default
- `Ddu64` is not the place to enforce the stricter v3-native contract
- any optional v3 decode support inside `Ddu64` must not disrupt v2 decode expectations

## `DduCodec` Compatibility Policy

### `legacyDecode = "off"`

- accept only `DDU3` and `DDS3` payloads
- reject v2 footer markers and v2 footer-only streams

### `legacyDecode = "explicit"`

- attempt v3 parse first
- if v3 parse fails with a format-mismatch outcome, attempt v2 decode once

### `legacyDecode = "on"`

- allow legacy v2 payloads and footer-only streams as regular input
- exists for migration, not as the preferred long-term default

## URL-Safe Policy

URL-safe remains a transport-layer transformation, not a separate wire-format family.

That means:

- version tags remain ASCII protocol markers
- URL-safe conversion happens after final block payload assembly
- decode reverses URL-safe conversion before format parsing

## Decoder Outcomes

New decoder behavior should distinguish:

- invalid new-format payload
- unsupported legacy payload
- corrupted payload
- checksum mismatch
- encryption key missing
- decompression limit exceeded

## Migration From v2

### v2 Block Example

```text
<encoded><padding>ELYSIAENC2CHKdeadbeef
```

### v3 Block Example

```text
<encoded><padding>DDU3;D;1;2;crc32:deadbeef
```

### v2 Stream Example

- default: header `DDS1`
- legacy: footer-only stream body with no leading stream header

### v3 Stream Example

- always `DDS3`
- no canonical footer-only stream mode

## Recommended Implementation Strategy

### Phase 1

- add new parser/serializer behind an internal feature flag
- preserve `Ddu64` behavior during implementation

### Phase 2

- switch `DduCodec` encode paths to emit `DDU3` and `DDS3`
- gate v2 decoding behind `DduCodec` compatibility mode

### Phase 3

- add golden fixtures for:
  - new block no compression
  - new block deflate
  - new block brotli + encryption
  - new stream deflate
  - new stream brotli + encryption
  - legacy v2 block
  - legacy v2 footer-only stream

## Resolved Decisions

1. Checksum remains block metadata on the initial v3 path. Stream integrity metadata can be added later if a concrete use case appears.
2. `DduCodec` defaults `legacyDecode` to `"explicit"` for v3.x.
3. All `DduCodec` block payloads always carry structured metadata.
4. Reserved stream flags are deferred until there is a real expansion need.

## Recommendation

Adopt:

- `Ddu64` as the stable legacy-compatible encoder/decoder
- `DduCodec` as the owner of `DDU3` and `DDS3`
- `DDU3` as the mandatory block payload version tag on the new path
- `DDS3` as the mandatory stream payload version tag on the new path
- structured metadata fields instead of marker inference
- explicit compatibility policy on the new path
- no extra reserved stream flags in the initial v3 contract

## Exit Criteria

This RFC is ready to implement when:

- `Ddu64` compatibility behavior is frozen
- `DduCodec` block footer fields are finalized
- `DduCodec` stream header fields are finalized
- fixture matrix is approved
