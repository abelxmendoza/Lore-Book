/**
 * IdentityStrengthService — the live caller for the IdentityStrengthEngine.
 *
 * The engine itself is pure scoring + a best-effort persist. This service is the
 * thin runtime layer that decides WHEN to recompute and persist a 0..100
 * identity-strength score for an entity, using signals the caller already has in
 * hand (so it adds no extra DB reads).
 *
 * It is throttled and best-effort:
 *   - skips work when a fresh score already exists (TTL window), so it is safe to
 *     fire on read paths without writing on every request;
 *   - never throws — strength is an additive signal and must not break the caller.
 *
 * Populating these scores is what makes the strength-weighted merge guard
 * (strengthWeightedMerge.ts) operate on real data instead of always-null.
 */
import { logger } from '../../logger';
import {
  identityStrengthEngine,
  type IdentityStrengthInput,
  type IdentityStrength,
} from './identityStrengthEngine';

export type StrengthEntityType = 'character' | 'location' | 'organization';

/** Recompute a persisted score at most once per this window on read paths. */
export const STRENGTH_RECOMPUTE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

export interface CurrentStrength {
  identity_strength_score?: number | null;
  identity_strength?: { computed_at?: string } | null;
}

/**
 * Pure: should the score be recomputed? True when there is no score yet, or the
 * existing score is older than the TTL (or has no/invalid timestamp).
 */
export function strengthIsStale(
  current: CurrentStrength | null | undefined,
  now: number = Date.now()
): boolean {
  if (!current) return true;
  if (current.identity_strength_score == null) return true;
  const computedAt = current.identity_strength?.computed_at;
  if (!computedAt) return true;
  const ts = new Date(computedAt).getTime();
  if (!Number.isFinite(ts)) return true;
  return now - ts >= STRENGTH_RECOMPUTE_TTL_MS;
}

class IdentityStrengthService {
  /**
   * Compute + persist an entity's identity strength from already-gathered
   * signals. No-op when a fresh score already exists (unless `force`). Best-effort
   * — failures are logged, never thrown. Returns the computed strength, or null
   * when skipped/failed.
   */
  async recompute(
    userId: string,
    entityType: StrengthEntityType,
    entityId: string,
    input: IdentityStrengthInput,
    current?: CurrentStrength | null,
    opts: { force?: boolean } = {}
  ): Promise<IdentityStrength | null> {
    try {
      if (!opts.force && !strengthIsStale(current)) return null;
      return await identityStrengthEngine.computeAndPersist(userId, entityType, entityId, input);
    } catch (err) {
      logger.debug({ err, entityType, entityId }, '[identityStrength] recompute failed');
      return null;
    }
  }
}

export const identityStrengthService = new IdentityStrengthService();
export type { IdentityStrengthService };
