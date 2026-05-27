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
import type { DduConstructorOptions } from "./core/types.js";

export class Ddu64Browser extends Ddu64Core {
  constructor(
    dduChar?: string[] | string | DduConstructorOptions,
    paddingChar?: string,
    dduOptions?: DduConstructorOptions,
  ) {
    if (
      dduChar !== null &&
      dduChar !== undefined &&
      typeof dduChar === "object" &&
      !Array.isArray(dduChar)
    ) {
      dduOptions = dduChar as DduConstructorOptions;
      dduChar = undefined;
      paddingChar = undefined;
    }

    const options: DduConstructorOptions = {
      ...dduOptions,
      adapter: dduOptions?.adapter ?? new BrowserAdapter(),
    };
    super(dduChar, paddingChar, options);
  }
}
