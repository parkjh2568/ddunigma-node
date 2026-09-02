/**
 * Node.js 전용 secure Ddu64 래퍼.
 *
 * Ddu64Core를 확장하여 압축/암호화/체크섬(배터리 포함)과 Node.js Buffer를 지원합니다:
 * - NodeAdapter 자동 주입 (zlib/crypto) → 압축/암호화 사용 가능
 * - 코어 CRC32 체크섬 사용 가능
 * - HangulObfuscationLayer 자동 주입 → 한글 난독화 사용 가능
 * - Node.js Buffer를 반환하는 `decodeToBuffer` 및 `decodeToBufferAsync` 제공
 * - encode()에 Buffer 입력 허용 (Buffer는 Uint8Array를 확장)
 *
 * 기본 진입점도 비동기 secure 작업을 lazy adapter로 처리합니다. 이 진입점은 NodeAdapter를
 * 정적으로 포함해 동기 압축·암복호화와 Web Streams까지 명시적으로 사용하는 경로입니다.
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
 * Ddu64Core를 래핑하여 자동 NodeAdapter 주입(압축/암호화)과
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

    // secure 진입점은 NodeAdapter 모듈을 포함하되 인스턴스는 실제 사용 시 생성합니다.
    const options: DduSecureConstructorOptions = {
      ...resolved.dduOptions,
      ...(resolved.dduChar !== undefined ? { dduChar: resolved.dduChar } : {}),
      ...(resolved.paddingChar !== undefined ? { paddingChar: resolved.paddingChar } : {}),
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
