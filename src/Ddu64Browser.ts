/**
 * Browser 전용 기본 Ddu64 래퍼.
 *
 * Ddu64Core를 확장하여 인코딩 + 한글 난독화(라이브러리 주목적)를 제공합니다:
 * - HangulObfuscationLayer 자동 주입 → 키 없는 한글 난독화 사용 가능
 *
 * 기본 경로는 BrowserAdapter를 주입하지 않습니다. 압축/암호화가 명시된 비동기 호출만
 * secure 브라우저 래퍼를 동적 import하여 BrowserAdapter를 지연 주입합니다.
 * Node.js 내장 모듈도, WebCrypto/CompressionStream 어댑터도 정적 import하지 않습니다.
 *
 * @module Ddu64Browser
 */

import { Ddu64Core } from "./core/Ddu64Core.js";
import { HangulObfuscationLayer } from "./obfuscation/ObfuscationLayer.js";
import type { Ddu64SecureBrowser } from "./Ddu64SecureBrowser.js";
import type { DduEncodeStats, DduOptions, DduSecureConstructorOptions } from "./core/types.js";
import { resolveConstructorArgs } from "./core/internal/constructorOptions.js";

export class Ddu64Browser extends Ddu64Core {
  #lazyOptions: DduSecureConstructorOptions;
  #lazyPromise: Promise<Ddu64SecureBrowser> | undefined;
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
    // 명시 adapter를 주입하면 base 코어가 async secure를 직접 처리하므로 lazy를 건너뜁니다.
    this.#hasInjectedAdapter = options.adapter !== undefined;
  }

  // ─── 공개 표면: 기본 sync는 lean, adapter-backed 옵션은 async에서 lazy secure 사용 ──

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
  override getStatsAsync(
    input: Uint8Array | string,
    options?: DduOptions,
  ): Promise<DduEncodeStats> {
    // 브라우저는 동기 압축이 없어 압축 통계도 async 어댑터가 필요합니다. Node 진입점과 대칭으로
    // 압축이 켜진 호출만 secure 브라우저 래퍼를 동적 import합니다. 주입 adapter가 있으면 base 코어가 처리.
    if (!this.#hasInjectedAdapter && this.#needsCompression(options)) {
      return this.#secure().then((secure) => secure.getStatsAsync(input, options));
    }
    return super.getStatsAsync(input, options);
  }

  #secure(): Promise<Ddu64SecureBrowser> {
    // ponytail: secure 발동 시 charset lookup 테이블과 난독화 알파벳이 base + secure 두 코어에
    // 중복 생성됩니다(메모리 ~2배, 발동 1회 한정). BrowserAdapter 정적 import로 lean 번들이
    // 오염되지 않도록 secure 브라우저 클래스를 동적 import로 통째 재사용하는 대가입니다.
    // 업그레이드 경로: 코어에 lazy adapter setter 추가. Promise 캐시로 동시 첫 호출 중복 생성 방지.
    if (!this.#lazyPromise) {
      this.#lazyPromise = import("./Ddu64SecureBrowser.js").then(
        ({ Ddu64SecureBrowser }) => new Ddu64SecureBrowser(this.#lazyOptions),
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
}
