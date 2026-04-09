# v3 Type Map

## Purpose

This document maps the current `Ddu64` surface to the planned `DduCodec` surface.

It is not a statement that existing `Ddu64` code must migrate.
It is a reference for:

- new implementations
- migration documentation
- implementation planning

## Class Role Map

| Existing | v3 Role | Notes |
| --- | --- | --- |
| `Ddu64` | Compatibility API | Existing users can stay here |
| `DduCodec` | New primary API | Recommended for new work |
| `createEncodeStream(encoder, options)` | Compatibility helper | Can remain as wrapper |
| `createDecodeStream(encoder, options)` | Compatibility helper | Can remain as wrapper |
| `codec.createEncodeStream(options)` | New primary stream API | Preferred on `DduCodec` |
| `codec.createDecodeStream(options)` | New primary stream API | Preferred on `DduCodec` |

## Constructor Map

### Existing `Ddu64`

```ts
new Ddu64(dduChar?, paddingChar?, options?)
```

### New `DduCodec`

```ts
new DduCodec(config)
```

## Config Field Map

| `Ddu64` option | `DduCodec` location | Notes |
| --- | --- | --- |
| `dduSetSymbol` | `preset` | Direct mapping |
| positional charset or `dduChar` | `charset` | New path prefers object config |
| positional padding or `paddingChar` | `padding` | New path prefers object config |
| `compress` | `defaults.compression.enabled` | Flat to nested |
| `compressionAlgorithm` | `defaults.compression.algorithm` | Flat to nested |
| `compressionLevel` | `defaults.compression.level` | Flat to nested |
| `checksum` | `defaults.checksum` | Direct concept map |
| `chunkSize` | `defaults.chunking.size` | Flat to nested |
| `chunkSeparator` | `defaults.chunking.separator` | Flat to nested |
| `encryptionKey` | `defaults.encryptionKey` | Direct concept map |
| `maxDecodedBytes` | `limits.maxDecodedBytes` | Moved under limits |
| `maxDecompressedBytes` | `limits.maxDecompressedBytes` | Moved under limits |
| `throwOnError` | `validation.strict` | New path uses explicit validation mode |
| `useBuildErrorReturn` | removed from new path | Stays only for `Ddu64` compatibility |
| `streamAutoDetect` | stream compatibility policy | New path should not use it as the primary model |

## Method Map

| `Ddu64` method | `DduCodec` equivalent | Notes |
| --- | --- | --- |
| `encode(input, options?)` | `encode(input, options?)` | Kept |
| `decode(input, options?)` | `decode(input, options?)` | Kept |
| `decodeToBuffer(input, options?)` | `decodeToBuffer(input, options?)` | Kept |
| `encodeAsync(input, options?)` | `encodeAsync(input, options?)` | Kept |
| `decodeAsync(input, options?)` | `decodeAsync(input, options?)` | Kept |
| `decodeToBufferAsync(input, options?)` | `decodeToBufferAsync(input, options?)` | Kept |
| `getStats(input, options?)` | `inspect(input, options?)` or `getStats(input, options?)` | Final naming decision pending |
| `getCharSetInfo()` | `getCodecInfo()` or equivalent | New path should use a more explicit type name |

## Stream Behavior Map

| Existing behavior | New behavior |
| --- | --- |
| top-level helper usage with encoder instance | instance-bound stream creation on `DduCodec` |
| footer-only legacy stream compatibility | compatibility-only behavior |
| header auto-detect plus legacy fallback | explicit header contract plus explicit compatibility mode |

## Wire Format Ownership

| Surface | Ownership |
| --- | --- |
| legacy block/footer markers | `Ddu64` compatibility |
| legacy `DDS1` and footer-only streams | `Ddu64` compatibility |
| `DDU3` block format | `DduCodec` |
| `DDS3` stream format | `DduCodec` |

## Migration Modes

### Mode 1: Stay On `Ddu64`

Use when:

- existing application code already works
- no need for the new contract yet

Action:

- upgrade package version
- keep current code

### Mode 2: New Work On `DduCodec`

Use when:

- building new features
- willing to adopt object-first config
- prefer explicit compatibility and new wire-format behavior

Action:

- keep legacy flows on `Ddu64`
- write new integrations on `DduCodec`

### Mode 3: Full Internal Migration

Use when:

- you want one modern API internally
- you can validate format compatibility boundaries

Action:

- map config from `Ddu64` to `DduCodec`
- verify payload compatibility assumptions
- update tests and fixtures
