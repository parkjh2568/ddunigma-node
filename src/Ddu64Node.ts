/**
 * Node.js 전용 기본 Ddu64 래퍼.
 *
 * Ddu64Core를 확장하여 인코딩 + 한글 난독화(라이브러리 주목적: 재미 + 시각적 난독화)와
 * Node.js Buffer 디코드를 제공합니다:
 * - HangulObfuscationLayer 자동 주입 → 키 없는 한글 난독화 사용 가능
 * - Node.js Buffer를 반환하는 `decodeToBuffer` 및 `decodeToBufferAsync` 제공
 * - encode()에 Buffer 입력 허용 (Buffer는 Uint8Array를 확장)
 *
 * 기본 경로는 어댑터(zlib/crypto)를 주입하지 않습니다. 압축/암호화가 명시된 비동기 호출만
 * secure 래퍼를 동적 import하여 NodeAdapter를 지연 주입합니다. 동기 secure 작업이 필요하면
 * secure 진입점(`@ddunigma/node/secure`)의 `Ddu64Secure`를 사용하세요.
 *
 * @module Ddu64Node
 */

import { Ddu64Core } from "./core/Ddu64Core.js";
import { HangulObfuscationLayer } from "./obfuscation/ObfuscationLayer.js";
import { Ddu64AdapterError, type Ddu64Operation } from "./core/errors.js";
import type { Ddu64Secure } from "./Ddu64Secure.js";
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
  #lazyOptions: DduSecureConstructorOptions;
  #lazyPromise: Promise<Ddu64Secure> | undefined;
  // adapter-backed 옵션 판정용 플래그. getCharSetInfo()는 호출마다 charset 배열을 복사하고
  // 큰 정보 객체를 할당하므로, hot-path에서 매번 부르지 않도록 생성 시점에 한 번만 캐시합니다.
  readonly #defaultCompress: boolean;
  readonly #hasEncryptionKey: boolean;
  readonly #hasInjectedAdapter: boolean;

  constructor(
    dduChar?: string[] | string | DduSecureConstructorOptions,
    paddingChar?: string,
    dduOptions?: DduSecureConstructorOptions,
  ) {
    const resolved = resolveConstructorArgs(dduChar, paddingChar, dduOptions);

    const options: DduSecureConstructorOptions = {
      ...resolved.dduOptions,
      ...(resolved.dduChar !== undefined ? { dduChar: resolved.dduChar } : {}),
      ...(resolved.paddingChar !== undefined ? { paddingChar: resolved.paddingChar } : {}),
      obfuscationLayerFactory:
        resolved.dduOptions?.obfuscationLayerFactory ??
        ((alphabet) => new HangulObfuscationLayer(alphabet)),
    };
    super(options);
    this.#lazyOptions = options;
    this.#defaultCompress = options.compress === true;
    this.#hasEncryptionKey = options.encryptionKey !== undefined;
    // 명시 adapter를 주입하면 base 코어가 sync/async secure를 직접 처리하므로 가드/lazy를 건너뜁니다.
    this.#hasInjectedAdapter = options.adapter !== undefined;
  }

  // ─── 공개 표면: 기본 sync는 lean, adapter-backed 옵션은 async에서 lazy secure 사용 ──

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

  /** @group Async */
  override async encodeAsync(input: Uint8Array | string, options?: DduOptions): Promise<string> {
    if (this.#needsAdapter(options)) {
      return (await this.#secure()).encodeAsync(input, options);
    }
    return super.encodeAsync(input, options);
  }

  /** @group Async */
  override async decodeToUint8ArrayAsync(input: string, options?: DduOptions): Promise<Uint8Array> {
    if (this.#needsAdapter(options)) {
      return (await this.#secure()).decodeToUint8ArrayAsync(input, options);
    }
    return super.decodeToUint8ArrayAsync(input, options);
  }

  /** @group Introspection */
  override getStats(input: Uint8Array | string, options?: DduOptions): DduEncodeStats {
    this.#assertSync("encode", options, false);
    return super.getStats(input, options);
  }

  /** @group Introspection */
  override getStatsAsync(
    input: Uint8Array | string,
    options?: DduOptions,
  ): Promise<DduEncodeStats> {
    // 통계는 압축만 어댑터가 필요합니다(암호화는 더미로 길이만 산출). 주입 adapter가 있으면 base 코어가 처리.
    if (!this.#hasInjectedAdapter && this.#needsCompression(options)) {
      return this.#secure().then((secure) => secure.getStatsAsync(input, options));
    }
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

  #secure(): Promise<Ddu64Secure> {
    // ponytail: secure 발동 시 charset lookup 테이블(Int32Array/Uint16Array)과 난독화 알파벳이
    // base + secure 두 코어에 중복 생성됩니다(메모리 ~2배, 발동 1회 한정). lean 정적 import 그래프를
    // 오염시키지 않으려 secure 클래스를 동적 import로 통째 재사용하는 대가입니다.
    // 업그레이드 경로: 코어에 lazy adapter setter를 추가해 동일 인스턴스에 어댑터만 주입.
    // Promise를 캐시해 동시 첫 호출에서 인스턴스가 중복 생성되지 않게 dedupe합니다.
    if (!this.#lazyPromise) {
      this.#lazyPromise = import("./Ddu64Secure.js").then(
        ({ Ddu64Secure }) => new Ddu64Secure(this.#lazyOptions),
      );
    }
    return this.#lazyPromise;
  }

  #needsAdapter(options?: DduOptions): boolean {
    if (this.#hasInjectedAdapter) return false;
    return this.#needsCompression(options) || this.#hasEncryptionKey;
  }

  #needsCompression(options?: DduOptions): boolean {
    return (options?.compress ?? this.#defaultCompress) === true;
  }

  #assertSync(operation: Ddu64Operation, options?: DduOptions, includeEncryption = true): void {
    if (this.#hasInjectedAdapter) return;
    if (this.#needsCompression(options) || (includeEncryption && this.#hasEncryptionKey)) {
      throw new Ddu64AdapterError(
        "@ddunigma/node: use encodeAsync/decodeAsync/getStatsAsync, or @ddunigma/node/secure for sync secure options.",
        operation,
      );
    }
  }
}
