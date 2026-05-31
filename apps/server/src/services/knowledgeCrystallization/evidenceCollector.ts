// ============================================================================
// Evidence Collector
//
// Fetches and assembles the evidence bundle for a given trigger context.
// All DB reads happen here. The confidence engine receives the bundle as
// a pure in-memory input — no DB access in the engine itself.
//
// Invariants:
//   - AI-sourced omega_claims (source = 'AI') are excluded before the bundle
//     is assembled. They never reach the confidence engine.
//   - event_interpretations with source = 'ai' are excluded.
//   - Identity system tables (essence_profiles, identity_cores) are not read.
// ============================================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { EvidenceBundle, EvidenceBundleItem, EvidenceType } from './types';

// Evidence weight constants — match the blueprint Phase 5 definitions.
const W = {
  EVENT_CANDIDATE_STRONG:   0.35,  // continuity_strength >= 0.80, count >= 4
  EVENT_CANDIDATE_MODERATE: 0.20,  // continuity_strength 0.50-0.79
  ARC_MEMBERSHIP_DEFINING:  0.25,  // role = 'defining_moment'
  ARC_MEMBERSHIP_TURNING:   0.20,  // role = 'turning_point'
  ARC_MEMBERSHIP_BACKGROUND: 0.10, // role = 'background' or null
  INTERPRETATION_TURNING:   0.20,  // user-sourced, narrative_role = 'turning_point'
  INTERPRETATION_RESOLUTION: 0.15, // user-sourced, narrative_role = 'resolution'
  OMEGA_CLAIM_USER:         0.15,  // source = 'USER', truth_state = 'CANONICAL'
  CORRECTION_NEGATIVE:     -0.30,  // user correction contradicting the pattern
} as const;

// ─── Pattern threshold bundle ─────────────────────────────────────────────────
//
// Builds an evidence bundle for a single event_candidate that has crossed
// the pattern threshold (continuity_strength >= 0.80, occurrence_count >= 4).

export async function buildPatternThresholdBundle(
  userId: string,
  eventCandidateId: string
): Promise<EvidenceBundle | null> {
  const items: EvidenceBundleItem[] = [];

  // 1. Load the event_candidate itself
  const { data: candidate, error: cError } = await supabaseAdmin
    .from('event_candidates')
    .select('id, canonical_title, dominant_entities, recurring_activities, continuity_strength, occurrence_count, first_seen_at, last_seen_at, source_event_ids')
    .eq('id', eventCandidateId)
    .eq('user_id', userId)
    .single();

  if (cError || !candidate) {
    logger.warn({ userId, eventCandidateId, error: cError }, 'evidenceCollector: event_candidate not found');
    return null;
  }

  const weight = candidate.continuity_strength >= 0.80
    ? W.EVENT_CANDIDATE_STRONG
    : W.EVENT_CANDIDATE_MODERATE;

  items.push({
    evidence_type: 'event_candidate',
    evidence_id: candidate.id,
    raw_weight: weight,
    summary: `Recurring scene: "${candidate.canonical_title}" — ${candidate.occurrence_count} occurrences (continuity ${(candidate.continuity_strength * 100).toFixed(0)}%)`,
    event_date: candidate.last_seen_at,
    arc_id: null,
  });

  // 2. Load user-sourced event_interpretations for source events
  const sourceEventIds: string[] = candidate.source_event_ids ?? [];
  if (sourceEventIds.length > 0) {
    const { data: interps } = await supabaseAdmin
      .from('event_interpretations')
      .select('id, interpretation, narrative_role, written_at, event_id, source')
      .eq('user_id', userId)
      .eq('source', 'user')  // INVARIANT: AI-sourced interpretations excluded
      .in('event_id', sourceEventIds)
      .in('narrative_role', ['turning_point', 'resolution', 'origin'])
      .order('written_at', { ascending: false })
      .limit(5);

    for (const interp of interps ?? []) {
      const iWeight = interp.narrative_role === 'turning_point'
        ? W.INTERPRETATION_TURNING
        : W.INTERPRETATION_RESOLUTION;

      items.push({
        evidence_type: 'event_interpretation',
        evidence_id: interp.id,
        raw_weight: iWeight,
        summary: `Your reflection (${interp.narrative_role}): "${interp.interpretation.substring(0, 120)}${interp.interpretation.length > 120 ? '…' : ''}"`,
        event_date: interp.written_at,
        arc_id: null,
      });
    }
  }

  // 3. Load USER-sourced omega_claims for the dominant entities
  // AI claims are excluded by the source filter — this is the evidence integrity gate.
  const dominantEntities: string[] = candidate.dominant_entities ?? [];
  if (dominantEntities.length > 0) {
    const { data: claims } = await supabaseAdmin
      .from('omega_claims')
      .select('id, text, source, truth_state, start_time')
      .eq('user_id', userId)
      .eq('source', 'USER')  // INVARIANT: AI-sourced claims excluded
      .in('truth_state', ['CANONICAL', 'CONTEXTUAL'])
      .in('entity_id', dominantEntities)
      .limit(3);

    for (const claim of claims ?? []) {
      items.push({
        evidence_type: 'omega_claim',
        evidence_id: claim.id,
        raw_weight: W.OMEGA_CLAIM_USER,
        summary: `Your statement: "${claim.text?.substring(0, 100) ?? ''}${(claim.text?.length ?? 0) > 100 ? '…' : ''}"`,
        event_date: claim.start_time,
        arc_id: null,
      });
    }
  }

  // 4. Check for corrections that contradict this candidate's entities
  if (dominantEntities.length > 0) {
    const { data: corrections } = await supabaseAdmin
      .from('corrections')
      .select('id, correction_text, created_at')
      .eq('user_id', userId)
      .limit(5);

    // Soft contradiction check: if any correction text shares keywords with the
    // candidate title, treat it as a negative signal. This is heuristic-only —
    // a v2 improvement would use semantic matching. For now the weight is applied
    // conservatively and only when correction count is non-zero.
    const candidateWords = (candidate.canonical_title ?? '').toLowerCase().split(/\s+/);
    for (const correction of corrections ?? []) {
      const correctionLower = (correction.correction_text ?? '').toLowerCase();
      const overlap = candidateWords.filter(w => w.length > 4 && correctionLower.includes(w));
      if (overlap.length >= 2) {
        items.push({
          evidence_type: 'correction',
          evidence_id: correction.id,
          raw_weight: W.CORRECTION_NEGATIVE,
          summary: `Correction signal: "${correction.correction_text?.substring(0, 80) ?? ''}…"`,
          event_date: correction.created_at,
          arc_id: null,
        });
      }
    }
  }

  // 5. Load arc_memberships for this candidate to populate arc_id fields
  //    (used in cross_context calculation by the confidence engine)
  const { data: memberships } = await supabaseAdmin
    .from('arc_memberships')
    .select('id, arc_id, importance_score, role')
    .eq('event_candidate_id', eventCandidateId)
    .eq('user_id', userId);

  const uniqueArcIds = new Set<string>();
  for (const m of memberships ?? []) {
    uniqueArcIds.add(m.arc_id);

    const mWeight = m.role === 'defining_moment'
      ? W.ARC_MEMBERSHIP_DEFINING
      : m.role === 'turning_point'
        ? W.ARC_MEMBERSHIP_TURNING
        : W.ARC_MEMBERSHIP_BACKGROUND;

    items.push({
      evidence_type: 'arc_membership',
      evidence_id: m.id,
      raw_weight: mWeight,
      summary: `Arc membership (${m.role ?? 'background'}, importance ${(m.importance_score * 100).toFixed(0)}%)`,
      event_date: null,
      arc_id: m.arc_id,
    });
  }

  // Determine arc_close_eligible: candidate participates in at least one arc
  // with confidence >= 0.70 (signals it's strong enough for v2 arc-close synthesis)
  let arcCloseEligible = false;
  if (uniqueArcIds.size > 0) {
    const { data: arcs } = await supabaseAdmin
      .from('life_arcs')
      .select('id, confidence')
      .eq('user_id', userId)
      .in('id', Array.from(uniqueArcIds))
      .gte('confidence', 0.70);
    arcCloseEligible = (arcs?.length ?? 0) > 0;
  }

  const allDates = items
    .map(i => i.event_date)
    .filter((d): d is string => !!d)
    .map(d => new Date(d).getTime())
    .sort((a, b) => a - b);

  return {
    user_id: userId,
    items,
    first_seen_at: candidate.first_seen_at ?? (allDates.length ? new Date(allDates[0]).toISOString() : null),
    last_seen_at: candidate.last_seen_at ?? (allDates.length ? new Date(allDates[allDates.length - 1]).toISOString() : null),
    unique_arc_ids: Array.from(uniqueArcIds),
    has_contradiction: items.some(i => i.evidence_type === 'correction' && i.raw_weight < 0),
    // Attach arc_close_eligible as a bundle extension (read by crystallizationService)
    ...(arcCloseEligible ? { _arc_close_eligible: true } : {}),
  } as EvidenceBundle & { _arc_close_eligible?: boolean };
}

// ─── Human-readable claim generator ──────────────────────────────────────────
//
// Converts a raw event_candidate into a human-readable claim sentence.
// No LLM call — deterministic string construction from structured fields.
// The output is used as `human_readable_claim` in crystallized_knowledge.

export function buildHumanReadableClaim(
  canonicalTitle: string,
  occurrenceCount: number,
  firstSeenAt: string | null,
  lastSeenAt: string | null,
  recurringActivities: string[]
): string {
  const span = (() => {
    if (!firstSeenAt) return '';
    const first = new Date(firstSeenAt);
    const last = lastSeenAt ? new Date(lastSeenAt) : new Date();
    const spanDays = Math.round((last.getTime() - first.getTime()) / 86400000);
    if (spanDays < 30) return '';
    if (spanDays < 365) return ` over the past ${Math.round(spanDays / 30)} months`;
    return ` over the past ${Math.round(spanDays / 365)} year${spanDays >= 730 ? 's' : ''}`;
  })();

  const activityNote = recurringActivities.length > 0
    ? ` (${recurringActivities.slice(0, 3).join(', ')})`
    : '';

  return `You have a recurring pattern of: ${canonicalTitle}${activityNote}. This scene has appeared ${occurrenceCount} times${span}.`;
}

// ─── Machine claim key generator ─────────────────────────────────────────────
//
// Produces a stable, lowercase slug used as the machine_claim for deduplication.
// Format: "behavioral_pattern:<slug_of_canonical_title>"

export function buildMachineClaim(
  knowledgeType: string,
  canonicalTitle: string
): string {
  const slug = canonicalTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 80);
  return `${knowledgeType}:${slug}`;
}
