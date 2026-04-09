# MIGRATION-v3

## Summary

v3 is designed so that existing `Ddu64` users do **not** need to rewrite working code just to upgrade the package.

There are two supported paths:

1. stay on `Ddu64`
2. adopt `DduCodec` for new work

## If You Already Use `Ddu64`

You can continue using it.

Compatibility goals for v3:

- `Ddu64` stays exported
- existing constructor usage stays valid
- existing core methods stay valid
- existing payloads continue to decode

If your current code works on v2, the default migration recommendation is:

```ts
import { Ddu64 } from "@ddunigma/node";
```

## If You Are Starting New Work

Prefer `DduCodec`.

Why:

- object-first configuration
- clearer separation of defaults, limits, and compatibility
- explicit new-format evolution

Example direction:

```ts
import { DduCodec, DduSetSymbol } from "@ddunigma/node";

const codec = new DduCodec({
  preset: DduSetSymbol.ONECHARSET,
  defaults: {
    compression: {
      enabled: true,
      algorithm: "brotli",
      level: 6
    }
  },
  compatibility: {
    legacyDecode: "explicit"
  }
});
```

## Recommended Migration Strategy

### Strategy A: No Rewrite

Best for:

- stable existing services
- low-risk upgrades

Action:

- upgrade package version
- keep `Ddu64`
- run compatibility tests

### Strategy B: Hybrid

Best for:

- teams adding new features while preserving old flows

Action:

- keep legacy integrations on `Ddu64`
- build new integrations on `DduCodec`

### Strategy C: Full Internal Migration

Best for:

- teams standardizing on the new API

Action:

- map `Ddu64` config to `DduCodec`
- verify payload assumptions
- update tests and fixtures

## Mapping Overview

See:

- [v3-type-map.md](/Users/jhpark/code/ddunigma-node/docs/plans/v3-type-map.md)
- [v3-ddu64-compatibility.md](/Users/jhpark/code/ddunigma-node/docs/plans/v3-ddu64-compatibility.md)

## Common Before/After

### Existing Compatible Usage

```ts
import { Ddu64, DduSetSymbol } from "@ddunigma/node";

const codec = new Ddu64(undefined, undefined, {
  dduSetSymbol: DduSetSymbol.ONECHARSET,
  compress: true,
  compressionAlgorithm: "brotli",
  compressionLevel: 6,
  encryptionKey: "secret"
});
```

### New Recommended Usage

```ts
import { DduCodec, DduSetSymbol } from "@ddunigma/node";

const codec = new DduCodec({
  preset: DduSetSymbol.ONECHARSET,
  defaults: {
    compression: {
      enabled: true,
      algorithm: "brotli",
      level: 6
    },
    encryptionKey: "secret"
  },
  compatibility: {
    legacyDecode: "explicit"
  }
});
```

## Stream Guidance

If you already depend on current stream helpers with `Ddu64`, you can continue using that path.

For new work, prefer the instance-bound stream API on `DduCodec`.

## Wire Format Guidance

- `Ddu64` remains the compatibility path for legacy payload behavior
- `DduCodec` is the owner of the new versioned wire format

If you do not need the new wire format yet, stay on `Ddu64`.

## Release Checklist For Existing Users

1. Upgrade package version.
2. Run existing encode/decode tests.
3. Run stream compatibility tests if applicable.
4. Confirm old payload fixtures still decode.
5. Only adopt `DduCodec` where the new API is actually needed.
