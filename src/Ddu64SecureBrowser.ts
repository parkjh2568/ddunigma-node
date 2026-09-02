/**
 * Browser 전용 secure Ddu64 래퍼.
 *
 * Ddu64Core를 확장하여 압축/암호화/체크섬(배터리 포함)을 지원합니다:
 * - BrowserAdapter 자동 주입 (WebCrypto/CompressionStream) → 비동기 압축/암호화
 * - HangulObfuscationLayer 자동 주입 → 한글 난독화 사용 가능
 *
 * Node.js 내장 모듈을 정적으로 import하지 않으므로 브라우저 번들에 crypto/zlib가
 * 끌려오지 않습니다.
 *
 * @module Ddu64SecureBrowser
 */

import { Ddu64Core } from "./core/Ddu64Core.js";
import { BrowserAdapter } from "./adapters/BrowserAdapter.js";
import { HangulObfuscationLayer } from "./obfuscation/ObfuscationLayer.js";
import type { DduSecureConstructorOptions } from "./core/types.js";
import { resolveConstructorArgs } from "./core/internal/constructorOptions.js";

/**
 * Browser 전용 secure Ddu64 인코더/디코더.
 *
 * Ddu64Core를 래핑하여 자동 BrowserAdapter 주입(WebCrypto/CompressionStream 기반
 * 압축/암호화)을 제공합니다. 체크섬은 코어의 순수 JavaScript CRC32 경로를 사용합니다.
 * 동기 압축/암호화 메서드는 지원하지 않으며
 * `encodeAsync`/`decodeAsync` 계열을 사용해야 합니다.
 *
 * @example
 * ```ts
 * import { Ddu64SecureBrowser } from '@ddunigma/node/secure';
 *
 * const encoder = new Ddu64SecureBrowser(undefined, undefined, { encryptionKey: 'key' });
 * const encoded = await encoder.encodeAsync('Hello', { compress: true });
 * const decoded = await encoder.decodeAsync(encoded);
 * ```
 */
export class Ddu64SecureBrowser extends Ddu64Core {
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
      adapterFactory: resolved.dduOptions?.adapterFactory ?? (() => new BrowserAdapter()),
      obfuscationLayerFactory:
        resolved.dduOptions?.obfuscationLayerFactory ??
        ((alphabet) => new HangulObfuscationLayer(alphabet)),
    };
    super(options);
  }
}
