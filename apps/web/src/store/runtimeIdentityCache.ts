import type { RuntimeIdentityType } from '../lib/runtimeIdentity';

let cachedRuntimeIdentity: RuntimeIdentityType = 'GUEST_USER';

export function getCachedRuntimeIdentity(): RuntimeIdentityType {
  return cachedRuntimeIdentity;
}

export function setCachedRuntimeIdentity(identity: RuntimeIdentityType): void {
  cachedRuntimeIdentity = identity;
}
