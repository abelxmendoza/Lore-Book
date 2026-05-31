// ============================================================================
// Confidence Engine
//
// Pure computation — no DB calls, no side effects.
// Input:  EvidenceBundle assembled by evidenceCollector
// Output: ConfidenceBreakdown with all five factors and the final score
//
// Formula (from blueprint Phase 5):
//   confidence = base_evidence × temporal_stability × cross_context × recency_factor
//                − contradiction_penalty
//   Clamped to [0.05, 0.95]
//
// Design principle: knowledge is hard to earn, slow to lose.
//   temporal_stability rewards years of evidence.
//   recency_factor has a floor of 0.35 — old evidence degrades but never zeros.
//   base_evidence is capped at 0.80 — no single evidence type can max it alone.
// ============================================================================

import type { EvidenceBundle, ConfidenceBreakdown } from './types';

const NORMALIZATION_CAP = 0.80;
const CONFIDENCE_FLOOR  = 0.05;
const CONFIDENCE_CEIL   = 0.95;

// ─── base_evidence ────────────────────────────────────────────────────────────
//
// Sum of all positive evidence weights, capped at NORMALIZATION_CAP.
// Negative weights (corrections) are summed separately as contradiction_penalty.

function computeBaseEvidence(bundle: EvidenceBundle): number {
  const positiveSum = bundle.items
    .filter(i => i.raw_weight > 0)
    .reduce((acc, i) => acc + i.raw_weight, 0);
  return Math.min(positiveSum, NORMALIZATION_CAP);
}

function computeContradictionPenalty(bundle: EvidenceBundle): number {
  const negativeSum = bundle.items
    .filter(i => i.raw_weight < 0)
    .reduce((acc, i) => acc + Math.abs(i.raw_weight), 0);
  // Cap penalty at 0.50 — contradictions reduce confidence but cannot zero a
  // claim that has years of supporting behavioral evidence.
  return Math.min(negativeSum, 0.50);
}

// ─── temporal_stability ──────────────────────────────────────────────────────
//
// Rewards evidence spread across time. A claim with 3 years of support
// is structurally more reliable than a claim with 3 weeks.

function computeTemporalStability(bundle: EvidenceBundle): number {
  if (!bundle.first_seen_at || !bundle.last_seen_at) return 0.40;

  const first = new Date(bundle.first_seen_at).getTime();
  const last  = new Date(bundle.last_seen_at).getTime();
  const spanDays = Math.max(0, (last - first) / 86400000);

  if (spanDays < 30)  return 0.40;
  if (spanDays < 90)  return 0.65;
  if (spanDays < 365) return 0.80;
  if (spanDays < 730) return 0.90;
  return 1.00; // 2+ years
}

// ─── cross_context ────────────────────────────────────────────────────────────
//
// Rewards evidence appearing in multiple life arc contexts.
// A behavioral pattern seen only in one arc may reflect that arc's conditions,
// not a durable personal trait. Three or more arcs = fully cross-contextual.

function computeCrossContext(bundle: EvidenceBundle): number {
  const count = bundle.unique_arc_ids.length;
  if (count === 0) return 0.55; // No arc context — slight penalty, not zero
  if (count === 1) return 0.60;
  if (count === 2) return 0.80;
  return 1.00; // 3+ arcs
}

// ─── recency_factor ───────────────────────────────────────────────────────────
//
// Knowledge about a living person must acknowledge change.
// Old evidence uncorroborated by recent events decays — but has a floor of 0.35.
// The floor ensures that lessons and long-term patterns remain historically valid
// even when they no longer describe current behavior.

function computeRecencyFactor(lastReinforcedAt: string | null): number {
  if (!lastReinforcedAt) return 0.60; // Unknown recency — moderate penalty

  const now = Date.now();
  const last = new Date(lastReinforcedAt).getTime();
  const daysSince = Math.max(0, (now - last) / 86400000);

  if (daysSince < 30)  return 1.00;
  if (daysSince < 90)  return 0.95;
  if (daysSince < 180) return 0.85;
  if (daysSince < 365) return 0.70;
  if (daysSince < 730) return 0.50;
  return 0.35; // Floor — very old evidence still counts, just less
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computeConfidence(bundle: EvidenceBundle): ConfidenceBreakdown {
  const base_evidence        = computeBaseEvidence(bundle);
  const temporal_stability   = computeTemporalStability(bundle);
  const cross_context        = computeCrossContext(bundle);
  const recency_factor       = computeRecencyFactor(bundle.last_seen_at);
  const contradiction_penalty = computeContradictionPenalty(bundle);

  const raw = base_evidence
    * temporal_stability
    * cross_context
    * recency_factor
    - contradiction_penalty;

  const final = Math.min(CONFIDENCE_CEIL, Math.max(CONFIDENCE_FLOOR, raw));

  return {
    base_evidence,
    temporal_stability,
    cross_context,
    recency_factor,
    contradiction_penalty,
    final,
    computed_at: new Date().toISOString(),
  };
}

// ─── Dormancy threshold check ─────────────────────────────────────────────────
//
// Returns true when a claim's recency_factor has decayed to the point where
// the claim should transition from ACTIVE → DORMANT.
// Called by the dormancy job (v2), not by the MVP pipeline.

export function shouldTransitionToDormant(
  knowledgeType: string,
  lastReinforcedAt: string | null
): boolean {
  if (!lastReinforcedAt) return false;

  const daysSince = (Date.now() - new Date(lastReinforcedAt).getTime()) / 86400000;

  // Dormancy thresholds differ by knowledge type (blueprint Phase 3)
  const thresholds: Record<string, number> = {
    behavioral_pattern: 180,
    value:              365,
    belief:              90,
    skill:              180,
    relationship:       180,
    lesson:             Infinity, // Lessons never go dormant
    preference:          60,
    career:             180,
    creative:           120,
    identity:           365,
    health:             180,
    location:           365,
  };

  const threshold = thresholds[knowledgeType] ?? 180;
  return daysSince >= threshold;
}
