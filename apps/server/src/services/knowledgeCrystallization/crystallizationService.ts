// ============================================================================
// Crystallization Service
//
// Public entry point for the knowledge crystallization layer.
// Orchestrates: trigger → evidence collection → confidence scoring → lifecycle write.
//
// Entry points:
//   evaluatePatternThreshold(userId, eventCandidateId, ctx)
//     Called by eventCandidateService after a candidate crosses 0.80/4+ threshold.
//     Fire-and-forget in production — caller does NOT await this.
//
//   evaluateArcClose(userId, arcId)                          [v2 stub]
//     Called by lifeArc PATCH route when is_active transitions false.
//     Stub only in MVP — logs intent, performs no writes.
//
// Invariants:
//   - Never called synchronously from the chat pipeline
//   - Never writes to event_candidates, life_arcs, resolved_events, omega_claims
//   - AI-sourced evidence is excluded before reaching this service (in evidenceCollector)
// ============================================================================

import { logger } from '../../logger';
import {
  buildPatternThresholdBundle,
  buildHumanReadableClaim,
  buildMachineClaim,
} from './evidenceCollector';
import { computeConfidence } from './confidenceEngine';
import { upsertClaim, findActiveClaim } from './claimLifecycleManager';
import type { PatternThresholdContext } from './types';

// ─── Pattern threshold trigger ────────────────────────────────────────────────
//
// Evaluates whether an event_candidate that crossed continuity_strength >= 0.80
// with occurrence_count >= 4 should crystallize into a behavioral_pattern claim.
//
// Guards:
//   - continuity_strength must be >= 0.80 (re-checked here in case caller is stale)
//   - occurrence_count must be >= 4
//   - Evidence span must be >= 30 days (prevents single-week burst patterns)
//   - If a DORMANT claim exists for the same machine_key, it is reactivated
//     rather than creating a duplicate

export async function evaluatePatternThreshold(
  ctx: PatternThresholdContext
): Promise<void> {
  const { userId, eventCandidateId, continuityStrength, occurrenceCount, firstSeenAt, lastSeenAt } = ctx;

  // Guard: re-validate threshold (caller may have stale values)
  if (continuityStrength < 0.80 || occurrenceCount < 4) {
    logger.debug({ userId, eventCandidateId }, 'crystallization: below threshold, skipping');
    return;
  }

  // Guard: temporal spread check — 30 days minimum
  if (firstSeenAt && lastSeenAt) {
    const spanDays = (new Date(lastSeenAt).getTime() - new Date(firstSeenAt).getTime()) / 86400000;
    if (spanDays < 30) {
      logger.debug({ userId, eventCandidateId, spanDays }, 'crystallization: temporal spread < 30 days, skipping');
      return;
    }
  }

  // Build evidence bundle
  const bundle = await buildPatternThresholdBundle(userId, eventCandidateId);
  if (!bundle || bundle.items.length === 0) {
    logger.warn({ userId, eventCandidateId }, 'crystallization: empty evidence bundle, skipping');
    return;
  }

  // Score confidence
  const breakdown = computeConfidence(bundle);

  // Minimum confidence gate — if the score is too low after all factors, skip.
  // (e.g. very old events with no arc context and recent contradiction)
  if (breakdown.final < 0.35) {
    logger.debug({ userId, eventCandidateId, confidence: breakdown.final }, 'crystallization: computed confidence below 0.35, skipping');
    return;
  }

  // Fetch event_candidate title for claim text generation
  const { supabaseAdmin } = await import('../supabaseClient');
  const { data: candidate } = await supabaseAdmin
    .from('event_candidates')
    .select('canonical_title, recurring_activities, first_seen_at, last_seen_at, occurrence_count')
    .eq('id', eventCandidateId)
    .eq('user_id', userId)
    .single();

  if (!candidate) {
    logger.warn({ userId, eventCandidateId }, 'crystallization: candidate not found for claim text generation');
    return;
  }

  const machineClaim = buildMachineClaim('behavioral_pattern', candidate.canonical_title);
  const humanReadable = buildHumanReadableClaim(
    candidate.canonical_title,
    candidate.occurrence_count,
    candidate.first_seen_at,
    candidate.last_seen_at,
    candidate.recurring_activities ?? []
  );

  // Check for existing active/dormant claim — reinforce rather than duplicate
  const existing = await findActiveClaim(userId, 'behavioral_pattern', machineClaim);

  const arcCloseEligible = !!(bundle as typeof bundle & { _arc_close_eligible?: boolean })._arc_close_eligible;

  const result = await upsertClaim(
    userId,
    {
      machine_claim:         machineClaim,
      human_readable_claim:  humanReadable,
      knowledge_type:        'behavioral_pattern',
      status:                'ACTIVE',
      confidence:            breakdown.final,
      confidence_breakdown:  breakdown,
      trigger_type:          'pattern_threshold',
      trigger_id:            eventCandidateId,
      first_evidenced_at:    bundle.first_seen_at,
      last_reinforced_at:    bundle.last_seen_at ?? new Date().toISOString(),
      arc_close_eligible:    arcCloseEligible,
    },
    bundle.items
  );

  if (result) {
    const action = existing ? 'reinforced' : 'created';
    logger.info(
      { userId, knowledgeId: result.id, machine_claim: machineClaim, confidence: breakdown.final, action },
      `crystallization: behavioral_pattern claim ${action}`
    );
  }
}

// ─── Arc close trigger (v2 stub) ─────────────────────────────────────────────
//
// When a life arc closes (is_active → false), this function will evaluate
// what durable knowledge emerged from the arc period. In the MVP this is a
// stub — it logs intent and does nothing, but its call site is wired in so
// v2 can fill in the implementation without changing the arc route.
//
// v2 scope:
//   - Load arc + arc_memberships + event_candidates
//   - Evaluate: sustained patterns, key relationships, arc lessons
//   - Crystallize skill/career/relationship/lesson claims as appropriate
//   - Transition closed-arc career claims to HISTORICAL automatically

export async function evaluateArcClose(userId: string, arcId: string): Promise<void> {
  logger.info({ userId, arcId }, 'crystallization: arc_close trigger received — v2 not yet implemented');
  // TODO v2: implement arc-close crystallization
}
