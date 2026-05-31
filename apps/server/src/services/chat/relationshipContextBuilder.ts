// ============================================================================
// Relationship Context Builder
//
// Builds RelationshipContinuitySummary[] — the canonical structure consumed by:
//   - systemPromptBuilder (relationship advisor block)
//   - RelationshipDetailModal (Patterns section, future)
//   - Any future surface that needs relationship intelligence
//
// Design:
//   - All DB reads run in a single Promise.all — no sequential calls
//   - Name resolution is batched: one query per person_type, not one per person
//   - Drift + cycles are READ from stored rows (never re-run detectors here)
//   - romantic_interactions are read for the last 3 per relationship
//   - breakupRisk is derived from stored drift + cycle signals — no new computation
//   - Failure is always non-fatal: returns empty array on any error
// ============================================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type DriftDirection =
  | 'growing_closer'
  | 'drifting_apart'
  | 'stable'
  | 'volatile'
  | 'breaking_up'
  | 'reconnecting';

export type BreakupRisk = 'low' | 'moderate' | 'elevated';

export interface RelationshipContinuitySummary {
  // Identity
  relationshipId: string;
  partnerName: string;
  relationshipType: string;
  status: string;
  isCurrent: boolean;
  isSituationship: boolean;
  exclusivityStatus: string | null;
  startDate: string | null;
  endDate: string | null;

  // Scores (0–1)
  affectionScore: number;
  compatibilityScore: number;
  healthScore: number;
  emotionalIntensity: number;
  healthTrend: string;

  // Drift — from most recent relationship_drift row
  driftDirection: DriftDirection | null;
  driftStrength: number | null;
  daysSinceLastMention: number | null;

  // Active cycles — from relationship_cycles WHERE is_active = true
  activeCycles: Array<{
    cycleType: string;
    cycleStrength: number;
    patternDescription: string;
    frequency: string;
  }>;

  // Recent interactions — last 3 from romantic_interactions
  recentInteractions: Array<{
    date: string;
    interactionType: string;
    sentiment: number;
    wasPositive: boolean;
    description: string | null;
  }>;

  // Flags
  redFlags: string[];
  greenFlags: string[];
  pros: string[];
  cons: string[];

  // Key milestone dates from romantic_dates
  keyDates: Array<{
    dateType: string;
    date: string;
    description: string | null;
  }>;

  // Derived risk signal
  breakupRisk: BreakupRisk | null;
}

// ─── Name resolution ─────────────────────────────────────────────────────────

async function resolveNames(
  rels: Array<{ person_id: string; person_type: string }>
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();

  const charIds = rels
    .filter(r => r.person_type === 'character')
    .map(r => r.person_id);

  const entityIds = rels
    .filter(r => r.person_type === 'omega_entity')
    .map(r => r.person_id);

  await Promise.all([
    charIds.length > 0
      ? supabaseAdmin
          .from('characters')
          .select('id, name')
          .in('id', charIds)
          .then(({ data }) => {
            for (const c of data ?? []) nameMap.set(c.id, c.name);
          })
      : Promise.resolve(),

    entityIds.length > 0
      ? supabaseAdmin
          .from('omega_entities')
          .select('id, primary_name')
          .in('id', entityIds)
          .then(({ data }) => {
            for (const e of data ?? []) nameMap.set(e.id, e.primary_name);
          })
      : Promise.resolve(),
  ]);

  return nameMap;
}

// ─── Risk derivation ──────────────────────────────────────────────────────────

function deriveBreakupRisk(
  driftDirection: DriftDirection | null,
  driftStrength: number | null,
  activeCycles: RelationshipContinuitySummary['activeCycles']
): BreakupRisk | null {
  if (!driftDirection && activeCycles.length === 0) return null;

  const hasToxicCycle = activeCycles.some(c =>
    ['toxic_pattern', 'on_again_off_again', 'negative_loop'].includes(c.cycleType) &&
    c.cycleStrength > 0.65
  );

  if (driftDirection === 'breaking_up') return 'elevated';

  if (driftDirection === 'drifting_apart' && (driftStrength ?? 0) > 0.6) {
    return hasToxicCycle ? 'elevated' : 'moderate';
  }

  if (hasToxicCycle) return 'moderate';

  return 'low';
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export async function buildRelationshipContext(
  relationships: any[],
  userId: string
): Promise<RelationshipContinuitySummary[]> {
  if (!relationships || relationships.length === 0) return [];

  try {
    const relIds = relationships.map(r => r.id);

    // Resolve all names in two batched queries
    const nameMap = await resolveNames(relationships);

    // All enrichment queries in parallel
    const [driftResult, cyclesResult, interactionsResult, datesResult] = await Promise.all([
      supabaseAdmin
        .from('relationship_drift')
        .select('relationship_id, drift_type, drift_strength, time_since_last_mention_days, detected_at')
        .in('relationship_id', relIds)
        .order('detected_at', { ascending: false }),

      supabaseAdmin
        .from('relationship_cycles')
        .select('relationship_id, cycle_type, cycle_strength, pattern_description, cycle_frequency')
        .in('relationship_id', relIds)
        .eq('is_active', true),

      supabaseAdmin
        .from('romantic_interactions')
        .select('relationship_id, interaction_type, interaction_date, sentiment, was_positive, description')
        .in('relationship_id', relIds)
        .order('interaction_date', { ascending: false })
        .limit(relationships.length * 3),

      supabaseAdmin
        .from('romantic_dates')
        .select('relationship_id, date_type, date_time, description')
        .in('relationship_id', relIds)
        .in('date_type', [
          'first_date', 'first_kiss', 'first_i_love_you',
          'engagement', 'marriage', 'breakup', 'first_meeting',
        ])
        .order('date_time', { ascending: true }),
    ]);

    // Group by relationship_id — take only the most recent drift per relationship
    const latestDriftByRel = new Map<string, any>();
    for (const row of driftResult.data ?? []) {
      if (!latestDriftByRel.has(row.relationship_id)) {
        latestDriftByRel.set(row.relationship_id, row);
      }
    }

    const cyclesByRel = new Map<string, any[]>();
    for (const row of cyclesResult.data ?? []) {
      const list = cyclesByRel.get(row.relationship_id) ?? [];
      list.push(row);
      cyclesByRel.set(row.relationship_id, list);
    }

    // Group interactions — cap at 3 per relationship (already ordered DESC)
    const interactionsByRel = new Map<string, any[]>();
    for (const row of interactionsResult.data ?? []) {
      const list = interactionsByRel.get(row.relationship_id) ?? [];
      if (list.length < 3) {
        list.push(row);
        interactionsByRel.set(row.relationship_id, list);
      }
    }

    const datesByRel = new Map<string, any[]>();
    for (const row of datesResult.data ?? []) {
      const list = datesByRel.get(row.relationship_id) ?? [];
      list.push(row);
      datesByRel.set(row.relationship_id, list);
    }

    return relationships.map(rel => {
      const drift = latestDriftByRel.get(rel.id) ?? null;
      const cycles = (cyclesByRel.get(rel.id) ?? []).map(c => ({
        cycleType: c.cycle_type,
        cycleStrength: c.cycle_strength,
        patternDescription: c.pattern_description,
        frequency: c.cycle_frequency,
      }));
      const interactions = (interactionsByRel.get(rel.id) ?? []).map(i => ({
        date: i.interaction_date,
        interactionType: i.interaction_type,
        sentiment: i.sentiment ?? 0,
        wasPositive: i.was_positive ?? i.sentiment > 0,
        description: i.description ?? null,
      }));
      const keyDates = (datesByRel.get(rel.id) ?? []).map(d => ({
        dateType: d.date_type,
        date: d.date_time,
        description: d.description ?? null,
      }));

      const driftDirection: DriftDirection | null = drift?.drift_type ?? null;
      const driftStrength: number | null = drift?.drift_strength ?? null;

      return {
        relationshipId: rel.id,
        partnerName: nameMap.get(rel.person_id) ?? rel.person_name ?? 'Unknown',
        relationshipType: rel.relationship_type ?? 'relationship',
        status: rel.status ?? 'active',
        isCurrent: rel.is_current ?? false,
        isSituationship: rel.is_situationship ?? false,
        exclusivityStatus: rel.exclusivity_status ?? null,
        startDate: rel.start_date ?? null,
        endDate: rel.end_date ?? null,

        affectionScore: rel.affection_score ?? 0.5,
        compatibilityScore: rel.compatibility_score ?? 0.5,
        healthScore: rel.relationship_health ?? 0.5,
        emotionalIntensity: rel.emotional_intensity ?? 0.5,
        healthTrend: rel.health_trend ?? 'stable',

        driftDirection,
        driftStrength,
        daysSinceLastMention: drift?.time_since_last_mention_days ?? null,

        activeCycles: cycles,
        recentInteractions: interactions,

        redFlags: rel.red_flags ?? [],
        greenFlags: rel.green_flags ?? [],
        pros: rel.pros ?? [],
        cons: rel.cons ?? [],

        keyDates,
        breakupRisk: deriveBreakupRisk(driftDirection, driftStrength, cycles),
      };
    });
  } catch (err) {
    logger.error({ err, userId }, 'relationshipContextBuilder: failed to build context');
    return [];
  }
}

// ─── Name-only resolution (used by ragBuilderService for lore cache) ──────────

export async function resolveRelationshipNames(
  relationships: any[]
): Promise<any[]> {
  if (!relationships || relationships.length === 0) return relationships;
  const nameMap = await resolveNames(relationships);
  return relationships.map(rel => ({
    ...rel,
    partner_name: nameMap.get(rel.person_id) ?? rel.partner_name ?? 'Unknown',
  }));
}
