/**
 * Persist third-party romances ("her boyfriend Juan") as character↔character
 * relationships. Previously these were detected only as "not the user's partner"
 * and dropped; this records the actual edge between the two named people when both
 * already exist as characters.
 */
import { logger } from '../../logger';
import { matchCharacterName } from '../../utils/characterNameMatching';
import { supabaseAdmin } from '../supabaseClient';

import { extractThirdPartyRomances } from './thirdPartyRomanceExtractor';

export async function persistThirdPartyRomances(
  userId: string,
  text: string | null | undefined,
  sourceMessageId?: string,
): Promise<{ created: number }> {
  const romances = extractThirdPartyRomances(text ?? '');
  if (romances.length === 0) return { created: 0 };

  const { data: chars } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias')
    .eq('user_id', userId)
    .eq('status', 'active');
  const roster = (chars ?? []) as Array<{ id: string; name: string; alias: string[] | null }>;

  const resolve = (name: string): string | null => {
    for (const c of roster) {
      const labels = [c.name, ...((c.alias as string[] | null) ?? [])];
      if (labels.some((label) => matchCharacterName(name, label).matches)) return c.id;
    }
    return null;
  };

  let created = 0;
  for (const r of romances) {
    const anchorId = resolve(r.anchorName);
    const partnerId = resolve(r.partnerName);
    // Only record when BOTH people are already known characters — never invent.
    if (!anchorId || !partnerId || anchorId === partnerId) continue;

    const { data: existing } = await supabaseAdmin
      .from('character_relationships')
      .select('id')
      .eq('user_id', userId)
      .eq('relationship_type', 'romantic')
      .or(
        `and(source_character_id.eq.${partnerId},target_character_id.eq.${anchorId}),` +
          `and(source_character_id.eq.${anchorId},target_character_id.eq.${partnerId})`,
      )
      .limit(1);
    if (existing && existing.length > 0) continue;

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from('character_relationships').insert({
      user_id: userId,
      source_character_id: partnerId,
      target_character_id: anchorId,
      relationship_type: 'romantic',
      relationship_category: 'romantic',
      relationship_role: r.partnerRole,
      inverse_role: r.anchorRole,
      status: 'active',
      inference_status: 'inferred',
      summary: `${r.partnerName} is ${r.anchorName}'s ${r.partnerRole}.`,
      evidence: r.evidence,
      metadata: { source: 'third_party_romance_extractor', source_message_id: sourceMessageId ?? null },
      created_at: now,
      updated_at: now,
    });
    if (!error) {
      created += 1;
      logger.info(
        { userId, anchor: r.anchorName, partner: r.partnerName, role: r.partnerRole },
        'Recorded third-party romance as character↔character relationship',
      );
    }
  }
  return { created };
}
