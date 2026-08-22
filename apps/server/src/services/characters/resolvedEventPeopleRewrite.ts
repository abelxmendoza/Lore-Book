/**
 * Canonical Character participation lives on resolved_events.people[].
 * Merge/absorb must rewrite this array.
 */
import { supabaseAdmin } from '../supabaseClient';

export async function rewriteResolvedEventPeopleCharacterIds(
  userId: string,
  sourceCharacterId: string,
  targetCharacterId: string,
): Promise<number> {
  if (!sourceCharacterId || !targetCharacterId || sourceCharacterId === targetCharacterId) return 0;
  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id, people')
    .eq('user_id', userId)
    .contains('people', [sourceCharacterId]);
  if (error) throw error;
  let updated = 0;
  for (const ev of (data ?? []) as Array<{ id: string; people: string[] | null }>) {
    const people = [...new Set((ev.people ?? []).map((p) => (p === sourceCharacterId ? targetCharacterId : p)))];
    const { error: updateErr } = await supabaseAdmin
      .from('resolved_events')
      .update({ people })
      .eq('id', ev.id)
      .eq('user_id', userId);
    if (updateErr) throw updateErr;
    updated++;
  }
  return updated;
}

export async function canonicalEventIdsForCharacter(
  userId: string,
  characterId: string,
): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('resolved_events')
    .select('id')
    .eq('user_id', userId)
    .contains('people', [characterId]);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.id).filter(Boolean));
}
