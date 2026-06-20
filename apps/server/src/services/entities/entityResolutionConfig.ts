export type EntityResolutionCoreMode = 'off' | 'shadow' | 'on';

/**
 * ENTITY_RESOLUTION_CORE controls how resolveMention is applied:
 *  - on (default): EntityResolutionCore decisions are authoritative
 *  - shadow: legacy resolver stays authoritative; log disagreements
 *  - off: legacy only (instant rollback)
 */
export function getEntityResolutionCoreMode(): EntityResolutionCoreMode {
  const raw = (process.env.ENTITY_RESOLUTION_CORE ?? 'on').trim().toLowerCase();
  if (raw === 'on' || raw === 'true' || raw === '1') return 'on';
  if (raw === 'off' || raw === 'false' || raw === '0') return 'off';
  return 'shadow';
}

export function isEntityResolutionCoreActive(): boolean {
  return getEntityResolutionCoreMode() === 'on';
}

export function isEntityResolutionShadowEnabled(): boolean {
  return getEntityResolutionCoreMode() === 'shadow';
}
