# ddunigma-node v3 API RFC

## Status

- Phase: RFC Draft
- Depends on: `docs/plans/v3-charter.md`
- Date: 2026-04-09

## Goal

Define a clearer public API for v3 that:

- preserves `Ddu64` for existing users
- introduces a cleaner primary API for new work
- aligns sync, async, stream, and pipeline entrypoints
- makes defaults and compatibility behavior explicit
- improves type-level discoverability

## Public Surface Strategy

### Compatibility Class

`Ddu64` remains exported and remains backward compatible.

It should preserve:

- positional constructor support
- legacy option names
- existing sync/async behavior
- existing stream helper compatibility

### New Primary Class

If new behavior cannot live cleanly inside `Ddu64`, introduce a separate class.

Recommended name:

- `DduCodec`

Alternative names:

- `DduGenerator`
- `DduTransport`

Recommendation:

- use `Ddu64` for compatibility usage
- use `DduCodec` as the recommended class for new development

## Current Problems

The existing public surface is powerful, but it is also easy to misread:

- constructor parameters are flexible but ambiguous
- some behavior is split across constructor defaults and per-call options
- stream metadata behavior is capable but subtle
- compatibility options and legacy fallbacks are not obvious from first use
- large cleanup inside `Ddu64` would create unnecessary compatibility risk

## Design Principles

1. Preserve stable legacy paths when users depend on them
2. Object-first configuration for new work
3. Explicit over implicit
4. One concept, one place
5. Public types must fully describe public behavior

## Proposed Top-Level API

### Legacy-Compatible Path

```ts
import { Ddu64 } from "@ddunigma/node";

const codec = new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.ONECHARSET,
  compress: true,
  compressionAlgorithm: "brotli",
  encryptionKey: "secret"
});
```

### New Primary Construction

```ts
import { DduCodec } from "@ddunigma/node";

const codec = new DduCodec({
  charset,
  padding: "=",
  defaults: {
    compression: {
      enabled: true,
      algorithm: "brotli",
      level: 6
    },
    checksum: false,
    chunking: {
      size: 76,
      separator: "\n"
    },
    encryptionKey: "secret-key"
  },
  limits: {
    maxDecodedBytes: 64 * 1024 * 1024,
    maxDecompressedBytes: 64 * 1024 * 1024
  },
  compatibility: {
    legacyDecode: "explicit"
  }
});
```

### Alternative Factory

```ts
import { createCodec, DduSetSymbol } from "@ddunigma/node";

const codec = createCodec({
  preset: DduSetSymbol.ONECHARSET
});
```

Recommendation:

- keep `Ddu64` as the compatibility API
- keep `new DduCodec(config)` as the canonical new API
- add `createCodec(config)` as a friendlier factory

## Proposed Public Types

```ts
interface DduCodecConfig {
  charset?: string[] | string;
  padding?: string;
  preset?: DduSetSymbol;
  defaults?: DduDefaults;
  limits?: DduLimits;
  compatibility?: DduCompatibility;
  validation?: {
    strict?: boolean;
  };
}

interface DduDefaults {
  compression?: {
    enabled?: boolean;
    algorithm?: "deflate" | "brotli";
    level?: number;
  };
  checksum?: boolean;
  chunking?: {
    size?: number;
    separator?: string;
  };
  encryptionKey?: string;
}

interface DduLimits {
  maxDecodedBytes?: number;
  maxDecompressedBytes?: number;
}

interface DduCompatibility {
  legacyDecode?: "off" | "explicit" | "on";
}
```

## Proposed Operation API

### Sync

```ts
codec.encode(input, options?)
codec.decode(input, options?)
codec.decodeToBuffer(input, options?)
codec.inspect(input, options?)
```

### Async

```ts
codec.encodeAsync(input, options?)
codec.decodeAsync(input, options?)
codec.decodeToBufferAsync(input, options?)
```

### Streams

```ts
codec.createEncodeStream(options?)
codec.createDecodeStream(options?)
```

Recommendation:

- put instance-bound stream creation on `DduCodec`
- retain top-level wrappers and `Ddu64` support for compatibility

### Pipeline

```ts
import { createPipeline } from "@ddunigma/node";

const pipeline = createPipeline()
  .compress({ algorithm: "brotli", level: 6 })
  .encrypt({ key: "secret" })
  .encode(codec);
```

Recommendation:

- keep pipeline as an advanced utility
- normalize option object shape with the `DduCodec` vocabulary

## Proposed Per-Call Options

```ts
interface EncodeOptions {
  compression?: false | {
    algorithm?: "deflate" | "brotli";
    level?: number;
  };
  checksum?: boolean;
  chunking?: false | {
    size: number;
    separator?: string;
  };
  onProgress?: (info: DduProgressInfo) => void;
}

interface DecodeOptions {
  compatibility?: {
    legacyDecode?: "off" | "explicit" | "on";
  };
  limits?: DduLimits;
}
```

Direction:

- preserve flat options in `Ddu64`
- use nested option objects in `DduCodec`

## Deprecated Or Preserved v2 Shapes

### Positional Constructor In `Ddu64`

Current pattern:

```ts
new Ddu64(dduChar, paddingChar, options)
```

v3 stance:

- keep supported in `Ddu64`
- do not use as the recommended API for new work
- document it in a compatibility section

### `useBuildErrorReturn`

v3 stance:

- keep working in `Ddu64` if compatibility requires it
- do not carry it into `DduCodec`
- replace it there with explicit validation mode

### Mixed Flat Options

Examples:

- `compress`
- `compressionAlgorithm`
- `compressionLevel`
- `chunkSize`
- `chunkSeparator`

v3 stance:

- preserve them in `Ddu64`
- regroup them under structured option objects in `DduCodec`

## Error Model

Recommendation:

- define stable error classes or stable error codes
- separate validation errors from data-format errors
- ensure docs describe the main error families

Example direction:

```ts
class DduConfigError extends Error {}
class DduDecodeError extends Error {}
class DduCompatibilityError extends Error {}
```

## Migration Shape

### Existing Compatible Path

```ts
const codec = new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.ONECHARSET,
  compress: true,
  compressionAlgorithm: "brotli",
  compressionLevel: 6,
  encryptionKey: "secret"
});
```

### New Recommended Path

```ts
const codec = new DduCodec({
  preset: DduSetSymbol.ONECHARSET,
  defaults: {
    compression: {
      enabled: true,
      algorithm: "brotli",
      level: 6
    },
    encryptionKey: "secret"
  }
});
```

## Resolved Decisions

1. `DduCodec` is the final new class name.
2. Top-level stream helper exports remain public wrappers for compatibility in v3.
3. `DduCodec` defaults `compatibility.legacyDecode` to `"explicit"`.
4. `Ddu64` keeps compatibility-first naming such as `getStats()`, while `DduCodec` uses `inspect()` on the new path.

## Recommendation

Adopt:

- `Ddu64` as the compatibility API
- `DduCodec` as the canonical new API
- `createCodec(config)` as the ergonomic helper
- nested config objects on the new path
- instance-bound stream creation on `DduCodec`
- explicit compatibility flags on the new path

## Runtime Baseline

For the v3 line:

- package minimum runtime: Node `>=20`
- recommended development runtime: Node `24.x LTS`
- verification matrix: Node `20`, `22`, `24`

## Exit Criteria

This RFC is ready to implement when:

- compatibility split between `Ddu64` and `DduCodec` is accepted
- config object shape is accepted
- stream API placement is locked
- error taxonomy direction is accepted
- migration examples cover dominant `Ddu64` patterns
