// ============================================================================
// Cross-Relationship Pattern Analyzer
//
// Discovers patterns that span multiple relationships. Called after
// a relationship ends and the user has >= 3 ended relationships.
//
// Three pattern types analyzed:
//   1. Cycle recurrence — same cycle_type across 3+ relationships
//   2. Red flag theme clustering — same flag theme across 3+ relationships
//   3. Affection trajectory — same score shape across 3+ relationships
//
// Evidence thresholds (from audit):
//   - Minimum 3 relationships showing the pattern
//   - Relationships must span at least 24 months total
//   - Confidence: 0.45 + (count - 3) × 0.10, max 0.80
//
// Anti-overgeneralization rules:
//   - Patterns describe the user's EXPERIENCE, not their partners' character
//   - human_readable_claim never says "you pick X type of person"
//   - No pattern generated from fewer than 3 distinct relationship_ids
// ============================================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { upsertClaim } from './claimLifecycleManager';
import type { ConfidenceBreakdown, EvidenceBundleItem } from './types';

// ─── Confidence formula ───────────────────────────────────────────────────────

function patternConfidence(count: number): number {
  return Math.min(0.80, 0.45 + (count - 3) * 0.10);
}

// ─── Flag theme normalizer ────────────────────────────────────────────────────
// Maps raw user-written flag strings to canonical themes for clustering.
// Keyword-based — no semantic embedding needed for this use case.

const FLAG_THEME_MAP: Record<string, string[]> = {
  unreliable_communication: [
    'inconsistent communication', 'doesn\'t text back', 'flaky', 'unreliable',
    'ghosting', 'goes quiet', 'hard to reach', 'doesn\'t respond', 'inconsistent',
    'bad communicator', 'poor communication', 'never texts first',
  ],
  emotional_unavailability: [
    'emotionally unavailable', 'won\'t open up', 'avoidant', 'walls up',
    'can\'t be vulnerable', 'closed off', 'emotionally distant', 'guarded',
    'doesn\'t share feelings', 'avoids emotion', 'cold',
  ],
  hot_cold_behavior: [
    'hot and cold', 'runs hot and cold', 'blows hot and cold', 'inconsistent interest',
    'never know where i stand', 'mixed signals', 'blows hot then cold',
  ],
  commitment_avoidance: [
    'won\'t commit', 'avoids labels', 'not ready for commitment', 'keeps it casual',
    'won\'t define the relationship', 'non-committal',
  ],
  disrespect: [
    'disrespectful', 'rude', 'dismissive', 'condescending', 'belittling',
    'makes me feel small', 'doesn\'t listen', 'invalidating',
  ],
  intensity_mismatch: [
    'love bombing', 'too intense too fast', 'overwhelming', 'rushed things',
    'moved too fast', 'overwhelming affection early',
  ],
};

function normalizeFlag(flag: string): string | null {
  const lower = flag.toLowerCase();
  for (const [theme, keywords] of Object.entries(FLAG_THEME_MAP)) {
    if (keywords.some(kw => lower.includes(kw))) return theme;
  }
  return null;
}

function themeLabelToHuman(theme: string): string {
  const labels: Record<string, string> = {
    unreliable_communication: 'unreliable communication',
    emotional_unavailability: 'emotional unavailability',
    hot_cold_behavior: 'hot-and-cold behavior',
    commitment_avoidance: 'commitment avoidance',
    disrespect: 'disrespectful treatment',
    intensity_mismatch: 'overwhelming early intensity',
  };
  return labels[theme] ?? theme.replace(/_/g, ' ');
}

// ─── Helper: total span of relationships in months ───────────────────────────

function totalSpanMonths(rels: Array<{ start_date: string | null; end_date: string | null }>): number {
  const dates = rels
    .flatMap(r => [r.start_date, r.end_date])
    .filter(Boolean)
    .map(d => new Date(d!).getTime());
  if (dates.length < 2) return 0;
  return Math.round((Math.max(...dates) - Math.min(...dates)) / (30 * 24 * 60 * 60 * 1000));
}

// ─── Evidence bundle builder (for crystallization) ───────────────────────────

function buildCrossRelEvidence(
  relationshipIds: string[],
  descriptions: string[],
  weight: number
): EvidenceBundleItem[] {
  return relationshipIds.map((id, i) => ({
    evidence_type: 'romantic_relationship' as const,
    evidence_id:   id,
    raw_weight:    weight / relationshipIds.length,
    summary:       descriptions[i] ?? `Relationship ${i + 1}`,
    event_date:    null,
    arc_id:        null,
  }));
}

function buildBreakdown(confidence: number): ConfidenceBreakdown {
  return {
    base_evidence:        Math.min(0.80, confidence + 0.10),
    temporal_stability:   0.80,
    cross_context:        1.00,  // By definition spans multiple relationships
    recency_factor:       0.90,
    contradiction_penalty: 0,
    final:                confidence,
    computed_at:          new Date().toISOString(),
  };
}

// ─── Pattern 1: Cycle recurrence ─────────────────────────────────────────────

async function analyzeCycleRecurrence(
  userId: string,
  endedRelIds: string[],
  relDescMap: Map<string, string>
): Promise<void> {
  const { data: cycles } = await supabaseAdmin
    .from('relationship_cycles')
    .select('relationship_id, cycle_type, cycle_strength, pattern_description')
    .in('relationship_id', endedRelIds)
    .gte('cycle_strength', 0.65);

  if (!cycles || cycles.length === 0) return;

  // Group by cycle_type, collect distinct relationship_ids
  const byCycleType = new Map<string, { relIds: Set<string>; descriptions: string[] }>();
  for (const c of cycles) {
    if (!byCycleType.has(c.cycle_type)) {
      byCycleType.set(c.cycle_type, { relIds: new Set(), descriptions: [] });
    }
    const entry = byCycleType.get(c.cycle_type)!;
    if (!entry.relIds.has(c.relationship_id)) {
      entry.relIds.add(c.relationship_id);
      entry.descriptions.push(c.pattern_description ?? c.cycle_type);
    }
  }

  for (const [cycleType, { relIds, descriptions }] of byCycleType) {
    const count = relIds.size;
    if (count < 3) continue;

    const confidence = patternConfidence(count);
    const cycleLabel = cycleType.replace(/_/g, '-');
    const humanLabel = cycleType === 'push_pull'        ? 'a push-pull dynamic'
                     : cycleType === 'hot_cold'         ? 'hot-and-cold behavior'
                     : cycleType === 'toxic_pattern'    ? 'a toxic pattern'
                     : cycleType === 'negative_loop'    ? 'a recurring negative loop'
                     : cycleType === 'on_again_off_again' ? 'an on-again-off-again dynamic'
                     : `a ${cycleLabel} pattern`;

    const relIdArray = Array.from(relIds);

    // Store in relationship_patterns table
    await supabaseAdmin.from('relationship_patterns').upsert({
      user_id:          userId,
      pattern_type:     'cycle_recurrence',
      description:      `${humanLabel.charAt(0).toUpperCase() + humanLabel.slice(1)} has appeared across ${count} of your relationships.`,
      pattern_value:    cycleType,
      occurrence_count: count,
      relationship_ids: relIdArray,
      confidence,
      computed_at:      new Date().toISOString(),
    }, { onConflict: 'user_id,pattern_type,pattern_value' });

    // Crystallize as behavioral_pattern knowledge claim
    const humanReadable = `You've experienced ${humanLabel} in ${count} of your relationships. This is a recurring dynamic, not a coincidence specific to one person.`;
    const evidence = buildCrossRelEvidence(
      relIdArray,
      relIdArray.map(id => relDescMap.get(id) ?? 'Relationship'),
      0.60
    );

    await upsertClaim(userId, {
      machine_claim:        `behavioral_pattern:cross_relationship_${cycleType}`,
      human_readable_claim: humanReadable,
      knowledge_type:       'behavioral_pattern',
      status:               'ACTIVE',
      confidence,
      confidence_breakdown: buildBreakdown(confidence),
      trigger_type:         'arc_close',
      trigger_id:           null,
      first_evidenced_at:   null,
      last_reinforced_at:   new Date().toISOString(),
      arc_close_eligible:   false,
    }, evidence);

    logger.info({ userId, cycleType, count, confidence }, 'crossRelationshipAnalyzer: cycle_recurrence pattern crystallized');
  }
}

// ─── Pattern 2: Red flag theme clustering ─────────────────────────────────────

async function analyzeFlagThemes(
  userId: string,
  endedRels: Array<{ id: string; red_flags: string[] }>,
  relDescMap: Map<string, string>
): Promise<void> {
  // Normalize all red flags across all ended relationships
  const themeToRelIds = new Map<string, Set<string>>();

  for (const rel of endedRels) {
    const flags = rel.red_flags ?? [];
    const seen  = new Set<string>();
    for (const flag of flags) {
      const theme = normalizeFlag(flag);
      if (theme && !seen.has(theme)) {
        seen.add(theme);
        if (!themeToRelIds.has(theme)) themeToRelIds.set(theme, new Set());
        themeToRelIds.get(theme)!.add(rel.id);
      }
    }
  }

  for (const [theme, relIds] of themeToRelIds) {
    const count = relIds.size;
    if (count < 3) continue;

    const confidence  = patternConfidence(count);
    const humanTheme  = themeLabelToHuman(theme);
    const relIdArray  = Array.from(relIds);

    await supabaseAdmin.from('relationship_patterns').upsert({
      user_id:          userId,
      pattern_type:     'flag_theme',
      description:      `${humanTheme.charAt(0).toUpperCase() + humanTheme.slice(1)} has appeared as a red flag across ${count} of your relationships.`,
      pattern_value:    theme,
      occurrence_count: count,
      relationship_ids: relIdArray,
      confidence,
      computed_at:      new Date().toISOString(),
    }, { onConflict: 'user_id,pattern_type,pattern_value' });

    const humanReadable = `You've consistently encountered ${humanTheme} across ${count} relationships. This is a recurring challenge in your relationship experience.`;
    const evidence = buildCrossRelEvidence(
      relIdArray,
      relIdArray.map(id => relDescMap.get(id) ?? 'Relationship'),
      0.55
    );

    await upsertClaim(userId, {
      machine_claim:        `lesson:cross_relationship_flag_${theme}`,
      human_readable_claim: humanReadable,
      knowledge_type:       'lesson',
      status:               'ACTIVE',
      confidence,
      confidence_breakdown: buildBreakdown(confidence),
      trigger_type:         'arc_close',
      trigger_id:           null,
      first_evidenced_at:   null,
      last_reinforced_at:   new Date().toISOString(),
      arc_close_eligible:   false,
    }, evidence);

    logger.info({ userId, theme, count, confidence }, 'crossRelationshipAnalyzer: flag_theme pattern crystallized');
  }
}

// ─── Pattern 3: Affection trajectory ─────────────────────────────────────────
// Detects: "your relationships start high and cool within 90 days"

async function analyzeAffectionTrajectory(
  userId: string,
  endedRelIds: string[],
  relDescMap: Map<string, string>
): Promise<void> {
  if (endedRelIds.length < 3) return;

  // Load analytics snapshots for each relationship (first and last)
  const decayingRelIds: string[] = [];

  for (const relId of endedRelIds) {
    const { data: snapshots } = await supabaseAdmin
      .from('relationship_analytics')
      .select('affection_score, calculated_at')
      .eq('relationship_id', relId)
      .order('calculated_at', { ascending: true });

    if (!snapshots || snapshots.length < 2) continue;

    const first = snapshots[0].affection_score;
    const last  = snapshots[snapshots.length - 1].affection_score;
    const spanDays = (
      new Date(snapshots[snapshots.length - 1].calculated_at).getTime() -
      new Date(snapshots[0].calculated_at).getTime()
    ) / 86400000;

    // High start (>0.70), significant drop (>0.20), within 90 days
    if (first > 0.70 && (first - last) > 0.20 && spanDays <= 90) {
      decayingRelIds.push(relId);
    }
  }

  if (decayingRelIds.length < 3) return;

  const confidence = patternConfidence(decayingRelIds.length);

  await supabaseAdmin.from('relationship_patterns').upsert({
    user_id:          userId,
    pattern_type:     'trajectory',
    description:      `Your relationships have tended to start with high affection that cools significantly within the first 90 days, across ${decayingRelIds.length} relationships.`,
    pattern_value:    'high_start_early_cool',
    occurrence_count: decayingRelIds.length,
    relationship_ids: decayingRelIds,
    confidence,
    computed_at:      new Date().toISOString(),
  }, { onConflict: 'user_id,pattern_type,pattern_value' });

  const evidence = buildCrossRelEvidence(
    decayingRelIds,
    decayingRelIds.map(id => relDescMap.get(id) ?? 'Relationship'),
    0.55
  );

  await upsertClaim(userId, {
    machine_claim:        'behavioral_pattern:cross_relationship_high_start_early_cool',
    human_readable_claim: `Across ${decayingRelIds.length} relationships, your affection has started very high and cooled significantly within the first 90 days. This may reflect an intensity pattern in how you enter relationships.`,
    knowledge_type:       'behavioral_pattern',
    status:               'ACTIVE',
    confidence,
    confidence_breakdown: buildBreakdown(confidence),
    trigger_type:         'arc_close',
    trigger_id:           null,
    first_evidenced_at:   null,
    last_reinforced_at:   new Date().toISOString(),
    arc_close_eligible:   false,
  }, evidence);

  logger.info({ userId, count: decayingRelIds.length, confidence }, 'crossRelationshipAnalyzer: trajectory pattern crystallized');
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function analyzeCrossRelationshipPatterns(userId: string): Promise<void> {
  try {
    // Load all ended relationships with enough data to analyze
    const { data: endedRels } = await supabaseAdmin
      .from('romantic_relationships')
      .select('id, relationship_type, affection_score, red_flags, start_date, end_date, person_id, person_type')
      .eq('user_id', userId)
      .eq('status', 'ended');

    if (!endedRels || endedRels.length < 3) {
      logger.debug({ userId, count: endedRels?.length ?? 0 }, 'crossRelationshipAnalyzer: fewer than 3 ended relationships, skipping');
      return;
    }

    // Gate: relationships must span at least 24 months total
    const spanMonths = totalSpanMonths(endedRels);
    if (spanMonths < 24) {
      logger.debug({ userId, spanMonths }, 'crossRelationshipAnalyzer: span < 24 months, skipping');
      return;
    }

    // Resolve partner names for evidence summaries (batched)
    const charIds = endedRels.filter(r => r.person_type === 'character').map(r => r.person_id);
    const { data: chars } = charIds.length > 0
      ? await supabaseAdmin.from('characters').select('id, name').in('id', charIds)
      : { data: [] };
    const charNameMap = new Map((chars ?? []).map(c => [c.id, c.name]));

    const relDescMap = new Map(
      endedRels.map(r => [
        r.id,
        `${charNameMap.get(r.person_id) ?? 'Unknown'} (${r.relationship_type})`,
      ])
    );

    const endedRelIds = endedRels.map(r => r.id);

    // Run all three analyzers in parallel — each is independent
    await Promise.all([
      analyzeCycleRecurrence(userId, endedRelIds, relDescMap),
      analyzeFlagThemes(userId, endedRels, relDescMap),
      analyzeAffectionTrajectory(userId, endedRelIds, relDescMap),
    ]);

    logger.info({ userId, relationshipCount: endedRels.length, spanMonths }, 'crossRelationshipAnalyzer: analysis complete');
  } catch (err) {
    logger.error({ err, userId }, 'crossRelationshipAnalyzer: failed');
  }
}
