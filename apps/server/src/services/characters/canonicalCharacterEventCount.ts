/**
 * Canonical character event membership: resolved_events.people[].
 */
import { supabaseAdmin } from '../supabaseClient';
import { isReviewPending } from '../reviewableRecord';

export async function countCanonicalEventsForCharacter(
  userId: string,
  characterId: string,
): Promise<number> {
  const { data } = await supabaseAdmin
    .from('resolved_events')
    .select('id, metadata')
    .eq('user_id', userId)
    .contains('people', [characterId]);
  return (data ?? []).filter((row) => !isReviewPending(row.metadata)).length;
}

export async function countCanonicalEventsForCharacters(
  userId: string,
  characterIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const id of characterIds) counts.set(id, 0);
  if (characterIds.length === 0) return counts;

  const { data } = await supabaseAdmin
    .from('resolved_events')
    .select('id, people, metadata')
    .eq('user_id', userId)
    .overlaps('people', characterIds);

  for (const row of data ?? []) {
    if (isReviewPending(row.metadata)) continue;
    for (const personId of (row.people as string[] | null) ?? []) {
      if (!counts.has(personId)) continue;
      counts.set(personId, (counts.get(personId) ?? 0) + 1);
    }
  }
  return counts;
}
