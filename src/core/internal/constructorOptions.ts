/** Constructor overload argument normalization. @module core/internal/constructorOptions */

import type { DduConstructorOptions } from "../types.js";

export interface ResolvedConstructorArgs {
  dduChar: string[] | string | undefined;
  paddingChar: string | undefined;
  dduOptions: DduConstructorOptions | undefined;
}

export function resolveConstructorArgs(
  dduChar?: string[] | string | DduConstructorOptions,
  paddingChar?: string,
  dduOptions?: DduConstructorOptions,
): ResolvedConstructorArgs {
  if (
    dduChar !== null &&
    dduChar !== undefined &&
    typeof dduChar === "object" &&
    !Array.isArray(dduChar)
  ) {
    return {
      dduChar: undefined,
      paddingChar: undefined,
      dduOptions: dduChar as DduConstructorOptions,
    };
  }

  return { dduChar, paddingChar, dduOptions };
}
