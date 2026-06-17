/**
 * Contradiction detection — compare resolved claims against existing ontology/memory.
 */
import { selfCharacterService } from '../selfCharacterService';
import { supabaseAdmin } from '../supabaseClient';
import type { PotentialContradiction, TemporalContext } from './meaningResolutionTypes';

export async function detectContradictions(
  userId: string,
  temporal: TemporalContext
): Promise<PotentialContradiction[]> {
  const contradictions: PotentialContradiction[] = [];

  const newWork = temporal.statements.find(
    (s) => (s.predicate === 'works_at' || s.predicate === 'will_work_at') && s.status === 'present'
  );
  if (!newWork) return contradictions;

  const self = await selfCharacterService.ensureSelfCharacter(userId).catch(() => null);
  if (!self?.id) return contradictions;

  const { data: facts } = await supabaseAdmin
    .from('entity_facts')
    .select('fact')
    .eq('user_id', userId)
    .eq('entity_id', self.id)
    .eq('status', 'active')
    .ilike('fact', '%work%');

  for (const f of facts ?? []) {
    const fact = String(f.fact ?? '');
    const atMatch = fact.match(/(?:works?\s+at|employed\s+(?:at|by))\s+(.+)/i);
    if (!atMatch?.[1]) continue;
    const existing = atMatch[1].trim().replace(/[,.]$/, '');
    if (existing.toLowerCase() !== newWork.object.toLowerCase()) {
      contradictions.push({
        field: 'works_at',
        existingFact: existing,
        newClaim: newWork.object,
        severity: 'high',
        needsReview: true,
      });
    }
  }

  return contradictions;
}
