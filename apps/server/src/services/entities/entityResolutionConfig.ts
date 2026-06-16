export type EntityResolutionCoreMode = 'off' | 'shadow' | 'on';

/**
 * ENTITY_RESOLUTION_CORE controls how resolveMention is applied:
 *  - shadow (default): legacy resolver stays authoritative; log disagreements
 *  - on: EntityResolutionCore decisions are authoritative
 *  - off: legacy only (instant rollback)
 */
export function getEntityResolutionCoreMode(): EntityResolutionCoreMode {
  const raw = (process.env.ENTITY_RESOLUTION_CORE ?? 'shadow').trim().toLowerCase();
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
