/**
 * Node.js 전용 secure Ddu64 래퍼.
 *
 * Ddu64Core를 확장하여 압축/암호화/체크섬(배터리 포함)과 Node.js Buffer를 지원합니다:
 * - NodeAdapter 자동 주입 (zlib/crypto) → 압축/암호화/체크섬 사용 가능
 * - HangulObfuscationLayer 자동 주입 → 한글 난독화 사용 가능
 * - Node.js Buffer를 반환하는 `decodeToBuffer` 및 `decodeToBufferAsync` 제공
 * - encode()에 Buffer 입력 허용 (Buffer는 Uint8Array를 확장)
 *
 * 구 `Ddu64Node`의 배터리 동작을 계승합니다. 6.0부터 기본 진입점(`@ddunigma/node`)은
 * 인코딩 + 난독화만 제공하며, 압축/암호화/체크섬/스트림은 secure 진입점
 * (`@ddunigma/node/secure`)으로 이전되었습니다.
 *
 * @module Ddu64Secure
 */

import { Ddu64Core } from "./core/Ddu64Core.js";
import { NodeAdapter } from "./adapters/NodeAdapter.js";
import { HangulObfuscationLayer } from "./obfuscation/ObfuscationLayer.js";
import type { DduSecureConstructorOptions, DduSecureOptions } from "./core/types.js";
import { resolveConstructorArgs } from "./core/internal/constructorOptions.js";

/**
 * Node.js 전용 secure Ddu64 인코더/디코더.
 *
 * Ddu64Core를 래핑하여 자동 NodeAdapter 주입(압축/암호화/체크섬)과
 * 하위 호환성을 위한 Buffer 반환 디코드 메서드를 제공합니다.
 *
 * @example
 * ```ts
 * import { Ddu64Secure } from '@ddunigma/node/secure';
 *
 * const encoder = new Ddu64Secure(undefined, undefined, { encryptionKey: 'key' });
 * const encoded = encoder.encode(Buffer.from('Hello'), { compress: true });
 * const decoded = encoder.decodeToBuffer(encoded); // Buffer 반환
 * ```
 */
export class Ddu64Secure extends Ddu64Core {
  constructor(
    dduChar?: string[] | string | DduSecureConstructorOptions,
    paddingChar?: string,
    dduOptions?: DduSecureConstructorOptions,
  ) {
    const resolved = resolveConstructorArgs(dduChar, paddingChar, dduOptions);

    // 명시적으로 제공된 어댑터가 없으면 NodeAdapter를 지연 생성하도록 팩토리를 주입.
    // 순수 인코딩/디코딩만 하면 어댑터는 생성되지 않습니다(불필요한 zlib/crypto 배선 회피).
    const options: DduSecureConstructorOptions = {
      ...resolved.dduOptions,
      ...(resolved.dduChar !== undefined ? { dduChar: resolved.dduChar } : {}),
      ...(resolved.paddingChar !== undefined ? { paddingChar: resolved.paddingChar } : {}),
      adapter: resolved.dduOptions?.adapter,
      adapterFactory: resolved.dduOptions?.adapterFactory ?? (() => new NodeAdapter()),
      obfuscationLayerFactory:
        resolved.dduOptions?.obfuscationLayerFactory ??
        ((alphabet) => new HangulObfuscationLayer(alphabet)),
    };
    super(options);
  }

  /**
   * 인코딩된 문자열을 Node.js Buffer로 디코딩합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 Buffer
   * @group Sync
   */
  decodeToBuffer(input: string, options?: DduSecureOptions): Buffer {
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
  async decodeToBufferAsync(input: string, options?: DduSecureOptions): Promise<Buffer> {
    const uint8 = await this.decodeToUint8ArrayAsync(input, options);
    return Buffer.from(uint8.buffer, uint8.byteOffset, uint8.byteLength);
  }
}
