/**
 * Browser 전용 기본 Ddu64 래퍼.
 *
 * Ddu64Core를 확장하여 인코딩 + 한글 난독화(라이브러리 주목적)를 제공합니다:
 * - HangulObfuscationLayer 자동 주입 → 키 없는 한글 난독화 사용 가능
 *
 * 기본 경로는 BrowserAdapter를 정적 import하지 않습니다. 비동기 압축/암복호화가 실제로
 * 실행될 때 어댑터만 동적 import해 현재 core 인스턴스에 주입합니다.
 * Node.js 내장 모듈도, WebCrypto/CompressionStream 어댑터도 정적 import하지 않습니다.
 * Web Streams 구현도 해당 인스턴스 메서드가 호출될 때만 불러옵니다.
 *
 * @module Ddu64Browser
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

export class Ddu64Browser extends Ddu64Core {
  readonly #defaultCompress: boolean;
  readonly #hasEncryptionKey: boolean;
  readonly #hasExplicitAdapter: boolean;

  /**
   * BrowserAdapter를 먼저 준비한 인스턴스를 생성합니다.
   * 브라우저 압축·암호화는 adapter 준비 후에도 비동기 메서드로 실행합니다.
   */
  static async create(options: DduSecureConstructorOptions = {}): Promise<Ddu64Browser> {
    try {
      validateRuntimeOptions(options);
      if (options.adapter !== undefined) return new Ddu64Browser(options);

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
        const { BrowserAdapter } = await import("./adapters/BrowserAdapter.js");
        adapter = new BrowserAdapter();
      }
      return new Ddu64Browser({ ...constructorOptions, adapter });
    } catch (error) {
      if (isDdu64Error(error)) throw error;
      throw new Ddu64AdapterError(
        "[Ddu64 create] Failed to initialize the browser runtime adapter.",
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
          : () =>
              import("./adapters/BrowserAdapter.js").then(
                ({ BrowserAdapter }) => new BrowserAdapter(),
              )),
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

  /** @group Sync */
  override decodeToUint8Array(input: string, options?: DduOptions): Uint8Array {
    this.#assertSync("decode", options);
    return super.decodeToUint8Array(input, options);
  }

  /** @group Introspection */
  override getStats(input: Uint8Array | string, options?: DduOptions): DduEncodeStats {
    this.#assertSync("encode", options, false);
    return super.getStats(input, options);
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
        "@ddunigma/node/browser: use encodeAsync/decodeAsync/getStatsAsync, or @ddunigma/node/secure for secure options.",
        operation,
      );
    }
  }
}
