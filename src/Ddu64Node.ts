/**
 * Node.js 전용 기본 Ddu64 래퍼.
 *
 * Ddu64Core를 확장하여 인코딩 + 한글 난독화(라이브러리 주목적: 재미 + 시각적 난독화)와
 * Node.js Buffer 디코드를 제공합니다:
 * - HangulObfuscationLayer 자동 주입 → 키 없는 한글 난독화 사용 가능
 * - Node.js Buffer를 반환하는 `decodeToBuffer` 및 `decodeToBufferAsync` 제공
 * - encode()에 Buffer 입력 허용 (Buffer는 Uint8Array를 확장)
 *
 * 기본 경로는 어댑터(zlib/crypto)를 정적 import하지 않습니다. 비동기 압축/암복호화가
 * 실제로 실행될 때 NodeAdapter만 동적 import해 현재 core 인스턴스에 주입합니다.
 * 동기 secure 작업이 필요하면 `@ddunigma/node/secure`를 사용하세요.
 *
 * @module Ddu64Node
 */

import { Ddu64Core } from "./core/Ddu64Core.js";
import { HangulObfuscationLayer } from "./obfuscation/ObfuscationLayer.js";
import { Ddu64AdapterError, type Ddu64Operation } from "./core/errors.js";
import type { DduEncodeStats, DduOptions, DduSecureConstructorOptions } from "./core/types.js";
import { resolveConstructorArgs } from "./core/internal/constructorOptions.js";

/**
 * Node.js 전용 기본 Ddu64 인코더/디코더.
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
  readonly #defaultCompress: boolean;
  readonly #hasEncryptionKey: boolean;
  readonly #hasExplicitAdapter: boolean;

  constructor(
    dduChar?: string[] | string | DduSecureConstructorOptions,
    paddingChar?: string,
    dduOptions?: DduSecureConstructorOptions,
  ) {
    const resolved = resolveConstructorArgs(dduChar, paddingChar, dduOptions);
    const hasExplicitAdapter =
      resolved.dduOptions?.adapter !== undefined ||
      resolved.dduOptions?.adapterFactory !== undefined;

    const options: DduSecureConstructorOptions = {
      ...resolved.dduOptions,
      ...(resolved.dduChar !== undefined ? { dduChar: resolved.dduChar } : {}),
      ...(resolved.paddingChar !== undefined ? { paddingChar: resolved.paddingChar } : {}),
      asyncAdapterFactory:
        resolved.dduOptions?.asyncAdapterFactory ??
        (hasExplicitAdapter
          ? undefined
          : () => import("./adapters/NodeAdapter.js").then(({ NodeAdapter }) => new NodeAdapter())),
      obfuscationLayerFactory:
        resolved.dduOptions?.obfuscationLayerFactory ??
        ((alphabet) => new HangulObfuscationLayer(alphabet)),
    };
    super(options);
    this.#defaultCompress = options.compress === true;
    this.#hasEncryptionKey = options.encryptionKey !== undefined;
    this.#hasExplicitAdapter = hasExplicitAdapter;
  }

  // ─── 공개 표면: adapter가 필요한 기본 진입점 호출은 비동기로 제한 ─────────────

  /** @group Sync */
  override encode(input: Uint8Array | string, options?: DduOptions): string {
    this.#assertSync("encode", options);
    return super.encode(input, options);
  }

  /**
   * @group Sync
   * `decode`/`decodeToBuffer`는 코어에서 `this.decodeToUint8Array`를 경유하므로 이 가드 하나가
   * sync 디코드 3종을 모두 덮습니다(중복 override 불필요).
   */
  override decodeToUint8Array(input: string, options?: DduOptions): Uint8Array {
    this.#assertSync("decode", options);
    return super.decodeToUint8Array(input, options);
  }

  /** @group Introspection */
  override getStats(input: Uint8Array | string, options?: DduOptions): DduEncodeStats {
    this.#assertSync("encode", options, false);
    return super.getStats(input, options);
  }

  /**
   * 인코딩된 문자열을 Node.js Buffer로 디코딩합니다.
   *
   * @param input - 디코딩할 인코딩된 문자열
   * @param options - 디코딩 옵션
   * @returns 디코딩된 Buffer
   * @group Sync
   */
  decodeToBuffer(input: string, options?: DduOptions): Buffer {
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
  async decodeToBufferAsync(input: string, options?: DduOptions): Promise<Buffer> {
    const uint8 = await this.decodeToUint8ArrayAsync(input, options);
    return Buffer.from(uint8.buffer, uint8.byteOffset, uint8.byteLength);
  }

  #assertSync(operation: Ddu64Operation, options?: DduOptions, includeEncryption = true): void {
    if (this.#hasExplicitAdapter) return;
    if (
      (options?.compress ?? this.#defaultCompress) === true ||
      (includeEncryption && this.#hasEncryptionKey)
    ) {
      throw new Ddu64AdapterError(
        "@ddunigma/node: use encodeAsync/decodeAsync/getStatsAsync, or @ddunigma/node/secure for sync secure options.",
        operation,
      );
    }
  }
}
