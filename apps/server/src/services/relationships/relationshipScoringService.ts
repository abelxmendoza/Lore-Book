/**
 * Sprint AL-3 — Relationship Scoring Engine
 *
 * Wraps deterministic romantic relationship scoring (Sprint AD).
 * No LLM. Persists real scores instead of 0.5 defaults.
 */

export {
  computeSignals,
  type RelationshipEvidence,
  type RelationshipSignals,
} from '../conversationCentered/romanticRelationshipScoring';

import { romanticRelationshipScoring } from '../conversationCentered/romanticRelationshipScoring';
import { supabaseAdmin } from '../supabaseClient';

const DEFAULT_SCORE = 0.5;
const SCORE_COLS = [
  'affection_score',
  'emotional_intensity',
  'compatibility_score',
  'relationship_health',
  'ambiguity_level',
] as const;

export async function scoreAllRelationshipsForUser(userId: string): Promise<{ scored: number }> {
  return romanticRelationshipScoring.scoreAllForUser(userId);
}

export async function getRelationshipScoringCoverage(userId: string): Promise<{
  total: number;
  scored: number;
  coverage_pct: number;
  at_default_count: number;
}> {
  const { data: rels } = await supabaseAdmin
    .from('romantic_relationships')
    .select('affection_score, compatibility_score, relationship_health, emotional_intensity, ambiguity_level, green_flags, red_flags')
    .eq('user_id', userId);

  const total = rels?.length ?? 0;
  if (total === 0) {
    return { total: 0, scored: 0, coverage_pct: 0, at_default_count: 0 };
  }

  let atDefault = 0;
  let scored = 0;

  for (const rel of rels ?? []) {
    const allDefault = SCORE_COLS.every((col) => Number(rel[col]) === DEFAULT_SCORE);
    const hasFlags =
      ((rel.green_flags as string[] | null)?.length ?? 0) +
        ((rel.red_flags as string[] | null)?.length ?? 0) >
      0;

    if (allDefault && !hasFlags) atDefault++;
    else scored++;
  }

  return {
    total,
    scored,
    at_default_count: atDefault,
    coverage_pct: Math.round((scored / total) * 1000) / 10,
  };
}
