/**
 * Repair first-person interests that were wrongly linked to co-mentioned people
 * (the Mom-got-Duolingo bug). Keeps the global interest; unlinks non-self characters
 * when evidence is clearly about the user alone.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { interestTracker } from './interestTracker';
import { isFirstPersonInterestText } from './interestSubjectResolver';

export type CoMentionCleanupResult = {
  scanned: number;
  repairedInterests: number;
  unlinkedPairs: number;
  details: Array<{ interestId: string; interestName: string; removedCharacterIds: string[] }>;
};

async function findSelfCharacterId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('characters')
    .select('id')
    .eq('user_id', userId)
    .contains('metadata', { is_self: true })
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

function looksLikeUserOnlyInterest(quotes: string[], description?: string | null): boolean {
  const blobs = [...(quotes ?? []), description ?? ''].filter(Boolean) as string[];
  if (!blobs.length) return false;
  // Any first-person evidence and no third-person ownership cue in the same blob.
  const thirdPersonOwner =
    /\b([A-Z][a-z]+|mom|dad|mother|father|sister|brother)\b.{0,40}\b(loves?|likes?|enjoys?|hobby|into)\b/i;
  let sawFirst = false;
  for (const blob of blobs) {
    if (isFirstPersonInterestText(blob)) {
      sawFirst = true;
      if (thirdPersonOwner.test(blob) && !/\b(i|i'm|i’m|i am)\b/i.test(blob.slice(0, 80))) {
        return false;
      }
    }
  }
  return sawFirst;
}

/**
 * Unlink co-mentioned characters from first-person interests.
 * Optionally scope to one character (e.g. Mom's card cleanup).
 */
export async function repairFirstPersonCoMentionPollution(
  userId: string,
  opts?: { characterId?: string; dryRun?: boolean },
): Promise<CoMentionCleanupResult> {
  const selfId = await findSelfCharacterId(userId);
  const result: CoMentionCleanupResult = {
    scanned: 0,
    repairedInterests: 0,
    unlinkedPairs: 0,
    details: [],
  };

  let query = supabaseAdmin
    .from('interests')
    .select('id, interest_name, related_character_ids, evidence_quotes, description, metadata')
    .eq('user_id', userId)
    .not('related_character_ids', 'eq', '{}');

  if (opts?.characterId) {
    query = query.contains('related_character_ids', [opts.characterId]);
  }

  const { data: rows, error } = await query.limit(500);
  if (error) {
    logger.warn({ error, userId }, 'interest co-mention cleanup query failed');
    return result;
  }

  for (const row of rows ?? []) {
    result.scanned += 1;
    const related = (row.related_character_ids as string[] | null) ?? [];
    if (related.length === 0) continue;
    if (!looksLikeUserOnlyInterest(row.evidence_quotes ?? [], row.description)) continue;

    const removeIds = related.filter((id) => id !== selfId);
    const scoped = opts?.characterId
      ? removeIds.filter((id) => id === opts.characterId)
      : removeIds;
    if (scoped.length === 0) continue;

    if (!opts?.dryRun) {
      for (const characterId of scoped) {
        await interestTracker.unlinkCharacterFromInterest(userId, row.id, characterId, {
          reason: 'co_mention_pollution_repair',
        });
      }
    }

    result.repairedInterests += 1;
    result.unlinkedPairs += scoped.length;
    result.details.push({
      interestId: row.id,
      interestName: row.interest_name,
      removedCharacterIds: scoped,
    });
  }

  logger.info(
    {
      userId,
      characterId: opts?.characterId,
      dryRun: Boolean(opts?.dryRun),
      ...result,
      details: result.details.slice(0, 20),
    },
    'interest co-mention pollution repair finished',
  );

  return result;
}
