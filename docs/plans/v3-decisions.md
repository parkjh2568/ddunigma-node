# ddunigma-node v3 Decision Record

## Status

- Phase: Decision Lock
- Date: 2026-04-09
- Scope: Major-version planning baseline

## Locked Decisions

### 1. Compatibility Model

- `Ddu64` remains exported and backward compatible
- existing users should be able to upgrade without runtime breakage
- incompatible cleanup and new wire-format work move to a separate class

### 2. New Class Name

- final name: `DduCodec`

Why:

- it matches encode and decode responsibilities
- it is clearer than generator-oriented naming for future readers

### 3. Runtime Baseline

- v3 minimum supported runtime: Node `>=20`
- recommended development and documentation runtime: Node `24.x LTS`
- planned v3 CI matrix: Node `20`, `22`, `24`

Transition rule:

- keep the current v2 package line on Node `>=18` until v3 implementation and release cutover

### 4. Legacy Decode Defaults

- `Ddu64` stays legacy-compatible by default
- `DduCodec` defaults to `compatibility.legacyDecode = "explicit"`

Meaning:

- `DduCodec` tries v3-native parsing first
- if the input is not v3-shaped, it may attempt one controlled legacy decode path

### 5. Stream API Policy

- `DduCodec` owns the new instance-bound stream API
- top-level stream helper exports remain public as compatibility wrappers in v3

### 6. Wire-Format Ownership

- `Ddu64` owns legacy-compatible payload behavior
- `DduCodec` owns `DDU3` and `DDS3`

## Immediate Next Steps

1. make these decisions the source of truth across RFC and migration docs
2. scaffold `DduCodec` public types and export plan
3. prepare the v3 runtime and packaging cutover checklist
