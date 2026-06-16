/**
 * Browser-optimized Ddu64 wrapper.
 *
 * Injects BrowserAdapter by default so async compression/encryption works
 * without importing Node.js built-ins into browser bundles.
 *
 * @module Ddu64Browser
 */

import { Ddu64Core } from "./core/Ddu64Core.js";
import { BrowserAdapter } from "./adapters/BrowserAdapter.js";
import { HangulObfuscationLayer } from "./obfuscation/ObfuscationLayer.js";
import type { DduConstructorOptions } from "./core/types.js";
import { resolveConstructorArgs } from "./core/internal/constructorOptions.js";

export class Ddu64Browser extends Ddu64Core {
  constructor(
    dduChar?: string[] | string | DduConstructorOptions,
    paddingChar?: string,
    dduOptions?: DduConstructorOptions,
  ) {
    const resolved = resolveConstructorArgs(dduChar, paddingChar, dduOptions);

    const options: DduConstructorOptions = {
      ...resolved.dduOptions,
      ...(resolved.dduChar !== undefined ? { dduChar: resolved.dduChar } : {}),
      ...(resolved.paddingChar !== undefined ? { paddingChar: resolved.paddingChar } : {}),
      adapter: resolved.dduOptions?.adapter,
      adapterFactory: resolved.dduOptions?.adapterFactory ?? (() => new BrowserAdapter()),
      obfuscationLayerFactory:
        resolved.dduOptions?.obfuscationLayerFactory ??
        ((alphabet) => new HangulObfuscationLayer(alphabet)),
    };
    super(options);
  }
}
