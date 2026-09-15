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
 * `Ddu64.create()`를 사용하면 같은 root 진입점에서 adapter를 미리 준비해 동기
 * 압축·암호화를 사용할 수 있습니다. Web Streams 구현은 해당 인스턴스 메서드 호출 시
 * 동적으로 불러옵니다.
 *
 * @module Ddu64Node
 */

import { Ddu64Core } from "./core/Ddu64Core.js";
import { HangulObfuscationLayer } from "./obfuscation/ObfuscationLayer.js";
import {
  Ddu64AdapterError,
  isDdu64Error,
  wrapDdu64Error,
  type Ddu64Operation,
} from "./core/errors.js";
import type {
  DduEncodeStats,
  DduOptions,
  DduSecureConstructorOptions,
  DduStreamOptions,
  PlatformAdapter,
} from "./core/types.js";
import { resolveConstructorArgs } from "./core/internal/constructorOptions.js";
import { validateRuntimeOptions } from "./core/internal/OptionValidation.js";

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
 * const decoded = encoder.decodeToBuffer(encoded, { obfuscate: true }); // Buffer 반환
 * ```
 */
export class Ddu64Node extends Ddu64Core {
  readonly #defaultCompress: boolean;
  readonly #hasEncryptionKey: boolean;
  readonly #hasExplicitAdapter: boolean;

  /**
   * 런타임 adapter를 먼저 준비한 Node.js 인스턴스를 생성합니다.
   * `new Ddu64()`는 adapter를 첫 비동기 연산까지 지연하고, 이 팩토리는 동기
   * 압축·암호화를 바로 사용할 수 있도록 생성 전에 adapter를 불러옵니다.
   */
  static async create(options: DduSecureConstructorOptions = {}): Promise<Ddu64Node> {
    try {
      validateRuntimeOptions(options);
      if (options.adapter !== undefined) return new Ddu64Node(options);

      const { adapterFactory, asyncAdapterFactory, ...constructorOptions } = options;
      // adapter 초기화를 기다리는 동안 호출자가 변경할 수 있는 설정을 보존합니다.
      if (Array.isArray(constructorOptions.dduChar)) {
        constructorOptions.dduChar = [...constructorOptions.dduChar];
      }
      if (constructorOptions.codaChar)
        constructorOptions.codaChar = [...constructorOptions.codaChar];
      if (constructorOptions.keyDerivation) {
        const { salt } = constructorOptions.keyDerivation;
        constructorOptions.keyDerivation = { ...constructorOptions.keyDerivation };
        if (salt !== undefined && typeof salt !== "string") {
          constructorOptions.keyDerivation.salt = new Uint8Array(salt);
        }
      }
      let adapter: PlatformAdapter;
      if (adapterFactory !== undefined) {
        adapter = adapterFactory();
      } else if (asyncAdapterFactory !== undefined) {
        adapter = await asyncAdapterFactory();
      } else {
        const { NodeAdapter } = await import("./adapters/NodeAdapter.js");
        adapter = new NodeAdapter();
      }
      return new Ddu64Node({ ...constructorOptions, adapter });
    } catch (error) {
      if (isDdu64Error(error)) throw error;
      throw new Ddu64AdapterError(
        "[Ddu64 create] Failed to initialize the Node.js runtime adapter.",
        "adapter",
        error,
      );
    }
  }

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

  /** Web Streams 인코딩 변환기를 필요한 시점에 불러와 생성합니다. */
  async createEncodeStream(
    options?: DduStreamOptions,
  ): Promise<TransformStream<Uint8Array, string>> {
    try {
      validateRuntimeOptions(options, "stream");
      if (options) options = { ...options };
      const { createReadableEncodeStream } = await import("./streams/WebStreams.js");
      return createReadableEncodeStream(this, options);
    } catch (error) {
      throw wrapDdu64Error(error, "stream");
    }
  }

  /** Web Streams 디코딩 변환기를 필요한 시점에 불러와 생성합니다. */
  async createDecodeStream(
    options?: DduStreamOptions,
  ): Promise<TransformStream<string, Uint8Array>> {
    try {
      validateRuntimeOptions(options, "stream");
      if (options) options = { ...options };
      const { createReadableDecodeStream } = await import("./streams/WebStreams.js");
      return createReadableDecodeStream(this, options);
    } catch (error) {
      throw wrapDdu64Error(error, "stream");
    }
  }

  #assertSync(operation: Ddu64Operation, options?: DduOptions, includeEncryption = true): void {
    if (this.#hasExplicitAdapter) return;
    if (
      (options?.compress ?? this.#defaultCompress) === true ||
      (includeEncryption && this.#hasEncryptionKey)
    ) {
      throw new Ddu64AdapterError(
        "@ddunigma/node: use encodeAsync/decodeAsync/getStatsAsync, await Ddu64.create() before sync secure calls, or use @ddunigma/node/secure.",
        operation,
      );
    }
  }
}
