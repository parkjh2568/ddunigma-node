/**
 * Shared adapter gateway context.
 *
 * Sync and async crypto gateways share one context shape. The single Ddu64Core
 * instance builds one object and passes it to both gateways; `encryptionKeyHash`
 * is derived lazily and cached, and `encryptionKeyHashPromise` dedupes concurrent
 * async derivations (used by the async gateway only — harmless for the sync path).
 *
 * @module core/internal/AdapterGatewayContext
 */

import type { KeyDerivationOptions, PlatformAdapter } from "../types.js";

export interface AdapterGatewayContext {
  adapter: PlatformAdapter | undefined;
  encryptionKey: string | undefined;
  keyDerivation: KeyDerivationOptions | undefined;
  encryptionKeyHash: Uint8Array | undefined;
  /** 진행 중인 비동기 키 파생 Promise(동시 중복 파생 방지). 비동기 게이트웨이 전용. */
  encryptionKeyHashPromise?: Promise<Uint8Array>;
  setEncryptionKeyHash(hash: Uint8Array): void;
}
