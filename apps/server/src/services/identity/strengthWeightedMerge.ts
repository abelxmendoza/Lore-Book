/**
 * Strength-weighted merge direction guard.
 *
 * A merge folds a SOURCE entity into a TARGET survivor and deletes the source.
 * Direction is chosen by the caller, which means a weak identity can end up
 * absorbing a meaningfully stronger one — the survivor would keep the weak row's
 * id and lose the stronger entity's accumulated identity strength.
 *
 * This module enforces the invariant "low-strength never absorbs high-strength":
 *   - `shouldSwapForStrength` — pure decision to flip the merge direction so the
 *     stronger identity survives.
 *   - `readStrengthScore` / `preserveSurvivorStrength` — best-effort persistence
 *     helpers that DEGRADE GRACEFULLY (return null / no-op) when the
 *     identity_strength_score column is unavailable or the row is missing, so a
 *     merge never fails on account of this guard.
 *
 * Strength scores come from the IdentityStrengthEngine (0..100). See
 * migration 20260623100000 for the columns.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

/** Tables that carry the identity_strength_score column. */
export type StrengthTable = 'characters' | 'locations' | 'organizations';

/**
 * Minimum score gap (on the 0..100 scale) before the merge direction is flipped.
 * Set wide enough that only a clear band difference triggers a swap — small,
 * noisy differences keep the caller's chosen direction.
 */
export const STRENGTH_SWAP_MARGIN = 15;

/**
 * Pure decision: should the merge direction be swapped so the stronger identity
 * survives? Returns true only when BOTH scores are known and the source (the row
 * that would be deleted) outscores the target by at least `margin`. Unknown
 * scores or an identity-preserving merge (protagonist/self) → no swap.
 */
export function shouldSwapForStrength(
  sourceScore: number | null,
  targetScore: number | null,
  opts: { identityPreserved?: boolean; margin?: number } = {}
): boolean {
  if (opts.identityPreserved) return false;
  if (sourceScore == null || targetScore == null) return false;
  const margin = opts.margin ?? STRENGTH_SWAP_MARGIN;
  return sourceScore - targetScore >= margin;
}

/**
 * Best-effort read of a persisted identity_strength_score (0..100). Returns null
 * when unavailable (column not migrated, row missing, or query error) so callers
 * degrade to the caller-chosen direction rather than failing the merge.
 */
export async function readStrengthScore(
  table: StrengthTable,
  userId: string,
  id: string
): Promise<number | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('identity_strength_score')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      logger.debug({ err: error, table, id }, '[strengthMerge] score read failed');
      return null;
    }
    const s = (data as { identity_strength_score?: number | null } | null)?.identity_strength_score;
    return typeof s === 'number' && Number.isFinite(s) ? s : null;
  } catch (err) {
    logger.debug({ err, table, id }, '[strengthMerge] score read threw');
    return null;
  }
}

/**
 * Best-effort: the merge survivor inherits the higher of the two strength scores.
 * The survivor strictly gained the union of both entities' evidence, so its
 * identity strength must not drop below the stronger input. No-op when neither
 * score is known or the column is unavailable.
 */
export async function preserveSurvivorStrength(
  table: StrengthTable,
  userId: string,
  survivorId: string,
  scoreA: number | null,
  scoreB: number | null
): Promise<void> {
  const best = Math.max(scoreA ?? -1, scoreB ?? -1);
  if (best < 0) return; // both unknown — nothing to preserve
  try {
    const { error } = await supabaseAdmin
      .from(table)
      .update({ identity_strength_score: best })
      .eq('id', survivorId)
      .eq('user_id', userId);
    if (error) {
      logger.debug({ err: error, table, survivorId }, '[strengthMerge] survivor strength update failed');
    }
  } catch (err) {
    logger.debug({ err, table, survivorId }, '[strengthMerge] survivor strength update threw');
  }
}
