/**
 * Browser 전용 기본(lean) Ddu64 래퍼.
 *
 * Ddu64Core를 확장하여 인코딩 + 한글 난독화(라이브러리 주목적)를 제공합니다:
 * - HangulObfuscationLayer 자동 주입 → 키 없는 한글 난독화 사용 가능
 *
 * 6.0: 어댑터(BrowserAdapter)를 주입하지 않습니다. 압축/암호화/체크섬/스트림이 필요하면
 * secure 진입점(`@ddunigma/node/secure`)의 `Ddu64SecureBrowser`를 사용하세요.
 * Node.js 내장 모듈도, WebCrypto/CompressionStream 어댑터도 정적 import하지 않습니다.
 *
 * @module Ddu64Browser
 */

import { Ddu64Core } from "./core/Ddu64Core.js";
import { HangulObfuscationLayer } from "./obfuscation/ObfuscationLayer.js";
import type { DduBaseConstructorOptions, DduBaseOptions, DduEncodeStats } from "./core/types.js";
import { resolveConstructorArgs } from "./core/internal/constructorOptions.js";

export class Ddu64Browser extends Ddu64Core {
  constructor(
    dduChar?: string[] | string | DduBaseConstructorOptions,
    paddingChar?: string,
    dduOptions?: DduBaseConstructorOptions,
  ) {
    const resolved = resolveConstructorArgs(dduChar, paddingChar, dduOptions);

    const options: DduBaseConstructorOptions = {
      ...resolved.dduOptions,
      ...(resolved.dduChar !== undefined ? { dduChar: resolved.dduChar } : {}),
      ...(resolved.paddingChar !== undefined ? { paddingChar: resolved.paddingChar } : {}),
      obfuscationLayerFactory:
        resolved.dduOptions?.obfuscationLayerFactory ??
        ((alphabet) => new HangulObfuscationLayer(alphabet)),
    };
    super(options);
  }

  // ─── 공개 표면: Base 옵션으로 제한 (압축/암호화/체크섬 옵션은 secure 진입점에서만) ──

  /** @group Sync */
  override encode(input: Uint8Array | string, options?: DduBaseOptions): string {
    return super.encode(input, options);
  }

  /** @group Async */
  override encodeAsync(input: Uint8Array | string, options?: DduBaseOptions): Promise<string> {
    return super.encodeAsync(input, options);
  }

  /** @group Sync */
  override decode(input: string, options?: DduBaseOptions): string {
    return super.decode(input, options);
  }

  /** @group Async */
  override decodeAsync(input: string, options?: DduBaseOptions): Promise<string> {
    return super.decodeAsync(input, options);
  }

  /** @group Sync */
  override decodeToUint8Array(input: string, options?: DduBaseOptions): Uint8Array {
    return super.decodeToUint8Array(input, options);
  }

  /** @group Async */
  override decodeToUint8ArrayAsync(input: string, options?: DduBaseOptions): Promise<Uint8Array> {
    return super.decodeToUint8ArrayAsync(input, options);
  }

  /** @group Introspection */
  override getStats(input: Uint8Array | string, options?: DduBaseOptions): DduEncodeStats {
    return super.getStats(input, options);
  }

  /** @group Introspection */
  override getStatsAsync(
    input: Uint8Array | string,
    options?: DduBaseOptions,
  ): Promise<DduEncodeStats> {
    return super.getStatsAsync(input, options);
  }
}
