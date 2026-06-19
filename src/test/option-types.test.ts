/**
 * 옵션 타입 2계층 분리 타입 테스트 (Task 2.1 / Requirements 6.1, 6.2, 6.4, 6.5).
 *
 * `DduBaseOptions`/`DduSecureOptions`가 별개의 명명 타입으로 존재하고 포함 관계가
 * 맞는지, 하위호환 별칭(`DduOptions`/`DduConstructorOptions`)이 secure 표면 전체와
 * 동일한지 컴파일 타임(tsc)으로 단언합니다. 런타임 단언은 vitest 보고용 스모크입니다.
 */

import { describe, it, expect } from "vitest";
import { DduSetSymbol } from "../core/types.js";
import type {
  DduBaseOptions,
  DduSecureOptions,
  DduOptions,
  DduBaseConstructorOptions,
  DduSecureConstructorOptions,
  DduConstructorOptions,
} from "../core/types.js";

// ─── 타입 단언 헬퍼 ──────────────────────────────────────────────────────────

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Extends<A, B> = A extends B ? true : false;

// ─── Base/Secure 포함 관계 (Req 6.2, 6.4) ────────────────────────────────────

// DduSecureOptions는 DduBaseOptions를 확장한다(Base 표면을 모두 포함).
type _SecureExtendsBase = Expect<Extends<DduSecureOptions, DduBaseOptions>>;

// 별개의 명명 타입이다 — Base와 Secure는 동일하지 않다 (Req 6.5).
type _DistinctOptions = Expect<Equal<Equal<DduBaseOptions, DduSecureOptions>, false>>;

// ─── Base는 secure 옵션을 포함하지 않는다 (Req 6.1) ───────────────────────────

// compress/encryptionKey/checksum 등 secure 키는 Base 표면에 없다.
type _NoCompressInBase = Expect<Equal<Extract<keyof DduBaseOptions, "compress">, never>>;
type _NoChecksumInBase = Expect<Equal<Extract<keyof DduBaseOptions, "checksum">, never>>;

// secure 표면에는 존재한다.
type _CompressInSecure = Expect<Equal<Extract<keyof DduSecureOptions, "compress">, "compress">>;
type _ChecksumInSecure = Expect<Equal<Extract<keyof DduSecureOptions, "checksum">, "checksum">>;

// Base 공통 키(obfuscate/chunkSize)는 양쪽 모두에 존재한다.
type _ObfuscateInBase = Expect<Equal<Extract<keyof DduBaseOptions, "obfuscate">, "obfuscate">>;
type _ObfuscateInSecure = Expect<Equal<Extract<keyof DduSecureOptions, "obfuscate">, "obfuscate">>;

// ─── 생성자 옵션 포함 관계 ────────────────────────────────────────────────────

type _SecureCtorExtendsBaseCtor = Expect<
  Extends<DduSecureConstructorOptions, DduBaseConstructorOptions>
>;

// ─── 하위호환 별칭 (DduOptions = DduSecureOptions 등) ─────────────────────────

type _OptionsAlias = Expect<Equal<DduOptions, DduSecureOptions>>;
type _CtorAlias = Expect<Equal<DduConstructorOptions, DduSecureConstructorOptions>>;

// 타입 별칭이 사용되었음을 명시(컴파일 타임 단언 보존).
export type __OptionTypeAssertions = [
  _SecureExtendsBase,
  _DistinctOptions,
  _NoCompressInBase,
  _NoChecksumInBase,
  _CompressInSecure,
  _ChecksumInSecure,
  _ObfuscateInBase,
  _ObfuscateInSecure,
  _SecureCtorExtendsBaseCtor,
  _OptionsAlias,
  _CtorAlias,
];

describe("옵션 타입 2계층 분리", () => {
  it("Base/Secure/별칭 타입 단언이 컴파일된다", () => {
    // 위 타입 단언이 컴파일되면 통과. 런타임 스모크.
    const base: DduBaseOptions = { obfuscate: true, chunkSize: 16 };
    const secure: DduSecureOptions = { ...base, compress: true, checksum: true };
    expect(secure.compress).toBe(true);
    expect(secure.obfuscate).toBe(true);
  });

  it("dduSetSymbol은 enum 멤버와 문자열 리터럴을 모두 받는다 (캐스트 불필요)", () => {
    // 2-b: string-literal union 덕분에 enum import 없이 문자열로 지정 가능.
    const fromLiteral: DduBaseConstructorOptions = { dduSetSymbol: "ddu" };
    const fromEnum: DduBaseConstructorOptions = { dduSetSymbol: DduSetSymbol.DDU };
    const v1Literal: DduSecureConstructorOptions = { dduSetSymbol: "ddu_v1" };
    expect(fromLiteral.dduSetSymbol).toBe(fromEnum.dduSetSymbol);
    expect(v1Literal.dduSetSymbol).toBe(DduSetSymbol.DDU_V1);
  });
});
