import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  detectCharacterPronouns,
  type CanonicalPronouns,
  type PronounEvidenceSource,
} from './characterPronounDetector';

export type LearnCharacterPronounsResult = {
  applied: boolean;
  pronouns: CanonicalPronouns | null;
  source: PronounEvidenceSource | null;
  overwritten: boolean;
};

function isSelfMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.is_self === true || metadata?.is_user === true;
}

export async function learnCharacterPronouns(
  userId: string,
  characterId: string,
  text: string,
  opts: { focused?: boolean; characterName?: string } = {},
): Promise<LearnCharacterPronounsResult> {
  const empty: LearnCharacterPronounsResult = {
    applied: false,
    pronouns: null,
    source: null,
    overwritten: false,
  };
  if (!text.trim()) return empty;

  const { data: row, error } = await supabaseAdmin
    .from('characters')
    .select('id, name, alias, pronouns, metadata')
    .eq('id', characterId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !row) {
    if (error) logger.warn({ error, userId, characterId }, 'character pronouns: lookup failed');
    return empty;
  }

  const metadata = ((row.metadata ?? {}) as Record<string, unknown>) || {};
  if (isSelfMetadata(metadata)) return empty;

  const aliases = Array.isArray(row.alias)
    ? row.alias.filter((value): value is string => typeof value === 'string')
    : [];
  const detected = detectCharacterPronouns(text, {
    name: opts.characterName?.trim() || String(row.name ?? ''),
    aliases,
    focused: opts.focused,
  });
  if (!detected) return empty;

  const existing = typeof row.pronouns === 'string' ? row.pronouns.trim() : '';
  const existingSource = typeof metadata.pronouns_source === 'string' ? metadata.pronouns_source : null;
  const confirmed = existingSource === 'user_confirmed';

  if (existing) {
    if (existing.toLowerCase() === detected.pronouns) return empty;
    if (confirmed && detected.source !== 'explicit') return empty;
    if (detected.source !== 'explicit') return empty;
  }

  const now = new Date().toISOString();
  const nextMeta = {
    ...metadata,
    pronouns_source: detected.source === 'explicit' ? 'user_confirmed' : 'inferred_from_chat',
    pronouns_confidence: detected.confidence,
    pronouns_inferred_at: now,
  };

  const { error: updateError } = await supabaseAdmin
    .from('characters')
    .update({
      pronouns: detected.pronouns,
      metadata: nextMeta,
      updated_at: now,
    })
    .eq('id', characterId)
    .eq('user_id', userId);

  if (updateError) {
    logger.warn({ error: updateError, userId, characterId }, 'character pronouns: update failed');
    return empty;
  }

  return {
    applied: true,
    pronouns: detected.pronouns,
    source: detected.source,
    overwritten: Boolean(existing),
  };
}
