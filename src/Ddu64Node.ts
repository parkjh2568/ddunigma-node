/**
 * Node.js 전용 기본(lean) Ddu64 래퍼.
 *
 * Ddu64Core를 확장하여 인코딩 + 한글 난독화(라이브러리 주목적: 재미 + 시각적 난독화)와
 * Node.js Buffer 디코드를 제공합니다:
 * - HangulObfuscationLayer 자동 주입 → 키 없는 한글 난독화 사용 가능
 * - Node.js Buffer를 반환하는 `decodeToBuffer` 및 `decodeToBufferAsync` 제공
 * - encode()에 Buffer 입력 허용 (Buffer는 Uint8Array를 확장)
 *
 * 6.0: 어댑터(zlib/crypto)를 주입하지 않습니다. 압축/암호화/체크섬/스트림이 필요하면
 * secure 진입점(`@ddunigma/node/secure`)의 `Ddu64Secure`를 사용하세요. 어댑터 미주입으로
 * crypto/zlib/CRC32가 기본 번들에서 트리셰이킹됩니다.
 *
 * @module Ddu64Node
 */

import { Ddu64Core } from "./core/Ddu64Core.js";
import { HangulObfuscationLayer } from "./obfuscation/ObfuscationLayer.js";
import type { DduBaseConstructorOptions, DduBaseOptions, DduEncodeStats } from "./core/types.js";
import { resolveConstructorArgs } from "./core/internal/constructorOptions.js";

/**
 * Node.js 전용 기본 Ddu64 인코더/디코더 (lean).
 *
 * Ddu64Core를 래핑하여 한글 난독화 레이어를 자동 주입하고,
 * 하위 호환성을 위한 Buffer 반환 디코드 메서드를 제공합니다.
 *
 * @example
 * ```ts
 * import { Ddu64 } from '@ddunigma/node';
 *
 * const encoder = new Ddu64();
 * const encoded = encoder.encode(Buffer.from('Hello'), { obfuscate: true });
 * const decoded = encoder.decodeToBuffer(encoded); // Buffer 반환
 * ```
 */
export class Ddu64Node extends Ddu64Core {
  constructor(
    dduChar?: string[] | string | DduBaseConstructorOptions,
    paddingChar?: string,
    dduOptions?: DduBaseConstructorOptions,
  ) {
    const resolved = resolveConstructorArgs(dduChar, paddingChar, dduOptions);

    // 기본 래퍼는 어댑터를 주입하지 않습니다(압축/암호화 미지원 → 트리셰이킹).
    // 난독화 레이어 팩토리만 주입하여 키 없는 한글 난독화를 지원합니다.
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

  /**
   * 인코딩된 문자열을 Node.js Buffer로 디코딩합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 Buffer
   * @group Sync
   */
  decodeToBuffer(input: string, options?: DduBaseOptions): Buffer {
    const uint8 = this.decodeToUint8Array(input, options);
    return Buffer.from(uint8.buffer, uint8.byteOffset, uint8.byteLength);
  }

  /**
   * 비동기적으로 Node.js Buffer로 디코딩합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 Buffer로 resolve되는 Promise
   * @group Async
   */
  async decodeToBufferAsync(input: string, options?: DduBaseOptions): Promise<Buffer> {
    const uint8 = await this.decodeToUint8ArrayAsync(input, options);
    return Buffer.from(uint8.buffer, uint8.byteOffset, uint8.byteLength);
  }
}
