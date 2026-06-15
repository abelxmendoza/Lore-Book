/**
 * Sprint AH — Memory Formation Transparency (Phase 4)
 *
 * Returns verified system state when user asks "Did you save Abuela?"
 */

import { supabaseAdmin } from '../supabaseClient';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { resolveCharacterByName } from './foundationRecallDataService';

function extractEntityName(message: string): string | null {
  const patterns = [
    /\b(?:save|saved|create|created|make|made|store|stored|capture|captured|have on|have for|about)\s+(?:a |the )?([A-ZÁÉÍÓÚÑ][\w\s.'-]{2,40}?)(?:\?|$|\s+(?:in|as|to))/i,
    /\b(?:is|was)\s+([A-ZÁÉÍÓÚÑ][\w\s.'-]{2,40}?)\s+(?:saved|stored|recorded|in the system)/i,
    /\b([A-ZÁÉÍÓÚÑ][\w\s.'-]{2,40}?)\s+(?:saved|stored|recorded)\??$/i,
  ];
  for (const pat of patterns) {
    const m = message.match(pat);
    const name = m?.[1]?.replace(/[?!.,]+$/, '').trim();
    if (name && name.length >= 2) return name;
  }
  return null;
}

type FormationCheck = { label: string; ok: boolean; detail: string };

export async function getMemoryFormationStatus(
  userId: string,
  message: string
): Promise<{ content: string; entityName: string | null }> {
  const entityName = extractEntityName(message);

  if (!entityName) {
    const { count: charCount } = await supabaseAdmin
      .from('characters')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { count: memCount } = await supabaseAdmin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    return {
      entityName: null,
      content: [
        '**Memory Formation — System State**',
        '',
        `Characters: ${charCount ?? 0} stored`,
        `Journal memories: ${memCount ?? 0} stored`,
        '',
        'Ask about a specific name (e.g. "Did you save Abuela?") for a detailed check.',
      ].join('\n'),
    };
  }

  const char = await resolveCharacterByName(userId, entityName);
  const checks: FormationCheck[] = [];

  checks.push({
    label: 'Character',
    ok: !!char,
    detail: char ? `✓ ${char.name}` : `✗ No character record for "${entityName}"`,
  });

  if (char) {
    const { count: relCount } = await supabaseAdmin
      .from('character_relationships')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .or(`source_character_id.eq.${char.id},target_character_id.eq.${char.id}`);

    checks.push({
      label: 'Relationship',
      ok: (relCount ?? 0) > 0,
      detail: (relCount ?? 0) > 0 ? `✓ ${relCount} relationship row(s)` : '✗ No relationships linked yet',
    });

    const { count: memCount } = await supabaseAdmin
      .from('character_memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('character_id', char.id);

    checks.push({
      label: 'Memories',
      ok: (memCount ?? 0) > 0,
      detail: (memCount ?? 0) > 0 ? `✓ ${memCount} linked memory(ies)` : '✗ No linked memories yet',
    });

    const { count: timelineCount } = await supabaseAdmin
      .from('character_timeline_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('character_id', char.id);

    checks.push({
      label: 'Timeline',
      ok: (timelineCount ?? 0) > 0,
      detail: (timelineCount ?? 0) > 0 ? `✓ ${timelineCount} timeline event(s)` : '○ No timeline events yet',
    });

    const { count: factCount } = await supabaseAdmin
      .from('entity_facts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('entity_type', 'character')
      .eq('entity_id', char.id)
      .eq('status', 'active');

    checks.push({
      label: 'Facts',
      ok: (factCount ?? 0) > 0,
      detail: (factCount ?? 0) > 0 ? `✓ ${factCount} active fact(s)` : '○ No verified facts yet',
    });
  }

  // Location check by name
  const { data: place } = await supabaseAdmin
    .from('people_places')
    .select('id, name, type')
    .eq('user_id', userId)
    .ilike('name', entityName)
    .maybeSingle();

  if (place?.type === 'LOCATION') {
    checks.push({
      label: 'Location',
      ok: true,
      detail: `✓ ${place.name}`,
    });
  }

  const { count: eventCount } = await supabaseAdmin
    .from('resolved_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .ilike('title', `%${entityName}%`);

  checks.push({
    label: 'Event',
    ok: (eventCount ?? 0) > 0,
    detail: (eventCount ?? 0) > 0 ? `✓ ${eventCount} related event(s)` : '○ Pending extraction',
  });

  const evidenceCount =
    (char ? 1 : 0) +
    checks.filter((c) => c.ok && c.label !== 'Character').length;

  const lines = [
    `**Memory Formation — ${entityName}**`,
    '',
    ...checks.map((c) => `**${c.label}:** ${c.detail}`),
    '',
    `**Evidence:** ${evidenceCount} supporting layer(s) on record`,
  ];

  if (!char) {
    lines.push('', `_No character card exists for "${entityName}" yet. Mention them again in chat to create one._`);
  }

  return { content: lines.join('\n'), entityName };
}

export async function extractEntityNameFromMessage(message: string): Promise<string | null> {
  return extractEntityName(message);
}

export function entityNameFromMessage(message: string): string | null {
  return extractEntityName(message);
}
