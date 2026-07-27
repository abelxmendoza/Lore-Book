/**
 * Soft-write characters.metadata.sex from kinship titles / edge kinship strings.
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { KinshipRole } from './kinshipGlossary';
import { kinshipSexMetadataPatch, nameSexMetadataPatch, sexFromKinship, sexFromKinshipString } from './sexFromKinship';
import { sexFromFirstName } from './sexFromName';

export async function applyKinshipSexInference(
  userId: string,
  characterId: string,
  opts: { role?: KinshipRole | null; phrase?: string; kinship?: string | null },
): Promise<boolean> {
  try {
    const sex =
      sexFromKinship(opts.role ?? null, opts.phrase) ?? sexFromKinshipString(opts.kinship);
    if (!sex) return false;

    const { data: row } = await supabaseAdmin
      .from('characters')
      .select('id, metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!row) return false;

    const patch = kinshipSexMetadataPatch(
      (row.metadata as Record<string, unknown> | null) ?? {},
      sex,
    );
    if (!patch) return false;

    const { error } = await supabaseAdmin
      .from('characters')
      .update({ metadata: patch, updated_at: new Date().toISOString() })
      .eq('id', characterId)
      .eq('user_id', userId);
    if (error) {
      logger.debug({ error, userId, characterId }, 'applyKinshipSexInference update failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.debug({ err, userId, characterId }, 'applyKinshipSexInference failed (non-fatal)');
    return false;
  }
}

/**
 * Weakest-tier fallback: guess sex from a character's first name when no
 * kinship title has already told us. Never overwrites a kinship-inferred or
 * user-confirmed value — see sexFromKinship.ts's precedence tiers.
 */
export async function applyNameSexInference(
  userId: string,
  characterId: string,
  name: string,
): Promise<boolean> {
  try {
    const sex = sexFromFirstName(name);
    if (!sex) return false;

    const { data: row } = await supabaseAdmin
      .from('characters')
      .select('id, metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!row) return false;

    const patch = nameSexMetadataPatch((row.metadata as Record<string, unknown> | null) ?? {}, sex);
    if (!patch) return false;

    const { error } = await supabaseAdmin
      .from('characters')
      .update({ metadata: patch, updated_at: new Date().toISOString() })
      .eq('id', characterId)
      .eq('user_id', userId);
    if (error) {
      logger.debug({ error, userId, characterId }, 'applyNameSexInference update failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.debug({ err, userId, characterId }, 'applyNameSexInference failed (non-fatal)');
    return false;
  }
}
