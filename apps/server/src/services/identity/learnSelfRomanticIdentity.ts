import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  mergeSelfRomanticIdentityMetadata,
  parseSelfRomanticIdentity,
  selfRomanticIdentityFacts,
} from './selfRomanticIdentity';

export type LearnSelfRomanticIdentityResult = {
  applied: boolean;
  fields: string[];
};

export async function learnSelfRomanticIdentity(
  userId: string,
  characterId: string,
  text: string,
): Promise<LearnSelfRomanticIdentityResult> {
  const parsed = parseSelfRomanticIdentity(text);
  if (!parsed) return { applied: false, fields: [] };

  const { data: row, error } = await supabaseAdmin
    .from('characters')
    .select('id, pronouns, metadata')
    .eq('id', characterId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !row) {
    if (error) logger.warn({ error, userId, characterId }, 'self romantic identity: character lookup failed');
    return { applied: false, fields: [] };
  }

  const existing = ((row.metadata ?? {}) as Record<string, unknown>) || {};
  const isSelf = existing.is_self === true || existing.is_user === true;
  if (!isSelf) return { applied: false, fields: [] };

  const nextMeta = mergeSelfRomanticIdentityMetadata(existing, parsed);
  const fields = [
    parsed.sex ? 'sex' : null,
    parsed.gender_identity ? 'gender_identity' : null,
    parsed.sexual_orientation ? 'sexual_orientation' : null,
    parsed.pronouns ? 'pronouns' : null,
    parsed.dating_preference ? 'dating_preference' : null,
  ].filter((field): field is string => Boolean(field));

  const update: Record<string, unknown> = {
    metadata: nextMeta,
    updated_at: new Date().toISOString(),
  };
  if (parsed.pronouns && !row.pronouns) {
    update.pronouns = parsed.pronouns;
  }

  const { error: updateError } = await supabaseAdmin
    .from('characters')
    .update(update)
    .eq('id', characterId)
    .eq('user_id', userId);

  if (updateError) {
    logger.warn({ error: updateError, userId, characterId }, 'self romantic identity: update failed');
    return { applied: false, fields: [] };
  }

  const now = new Date().toISOString();
  for (const fact of selfRomanticIdentityFacts(parsed)) {
    const { data: existingFact } = await supabaseAdmin
      .from('entity_facts')
      .select('id, mention_count')
      .eq('user_id', userId)
      .eq('entity_id', characterId)
      .eq('entity_type', 'character')
      .eq('fact', fact)
      .maybeSingle();

    if (existingFact?.id) {
      await supabaseAdmin
        .from('entity_facts')
        .update({
          mention_count: (existingFact.mention_count ?? 1) + 1,
          last_confirmed_at: now,
          updated_at: now,
        })
        .eq('id', existingFact.id)
        .eq('user_id', userId);
      continue;
    }

    await supabaseAdmin.from('entity_facts').insert({
      user_id: userId,
      entity_id: characterId,
      entity_type: 'character',
      fact,
      category: 'general',
      confidence: 0.95,
      mention_count: 1,
      status: 'active',
      first_seen_at: now,
      last_confirmed_at: now,
      metadata: {
        assertion_type: 'self_asserted',
        source: 'user_confirmed',
        identity_field: true,
      },
    });
  }

  return { applied: true, fields };
}
