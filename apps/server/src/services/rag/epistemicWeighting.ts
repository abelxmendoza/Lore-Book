// =====================================================
// EPISTEMIC RETRIEVAL WEIGHTING
// Formal Cognition Governance — Phase 6
//
// Applies truth-state and knowledge-type multipliers to
// retrieval scores so that governed cognition artifacts
// rank higher than unverified or disputed ones.
//
// Design principle:
//   Sparse authentic cognition > rich hallucinated cognition.
//   The retrieval layer must reflect epistemic quality,
//   not just semantic similarity.
//
// Integration point: applied in Step 9 of memoryRetriever
// after entity boosting and reranking are complete.
// =====================================================

// ─── Truth-state multipliers ─────────────────────────────────────────────────
//
// CANONICAL:            Verified by the user — full weight
// INFERRED:             Derived logically — slight discount (not directly stated)
// PENDING_VERIFICATION: Awaiting human review — moderate discount
// CONTEXTUAL:           Roleplay / hypothetical — significant discount for factual queries
// DISPUTED:             Contradicted — strong discount (unreliable)
// REVISED:              Superseded — near-zero (do not surface old facts)

const TRUTH_STATE_WEIGHT: Record<string, number> = {
  CANONICAL:             1.00,
  INFERRED:              0.85,
  PENDING_VERIFICATION:  0.70,
  CONTEXTUAL:            0.55,
  DISPUTED:              0.35,
  REVISED:               0.20,
};

// ─── Knowledge-type multipliers (factual retrieval context) ──────────────────
//
// For factual queries: FACT and EXPERIENCE carry the most signal.
// BELIEF and FEELING are subjective and should be weighted lower.
// QUESTION entries are not answers — they should rarely be retrieved for facts.

const KNOWLEDGE_TYPE_WEIGHT: Record<string, number> = {
  FACT:        1.00,
  EXPERIENCE:  0.90,
  DECISION:    0.85,
  BELIEF:      0.70,
  FEELING:     0.50,
  QUESTION:    0.40,
};

// ─── Canon-status bonus ───────────────────────────────────────────────────────
// Entries explicitly marked CANON by the system get a small upward nudge.
// Non-canon entries (ROLEPLAY, HYPOTHETICAL, etc.) are suppressed.

const CANON_STATUS_WEIGHT: Record<string, number> = {
  CANON:        1.05,   // slight boost: user confirmed this happened
  ROLEPLAY:     0.40,
  HYPOTHETICAL: 0.35,
  QUOTE:        0.65,
  UNKNOWN:      0.85,
};

// ─── Public API ───────────────────────────────────────────────────────────────

export interface EpistemicWeightResult {
  epistemicWeight: number;
  truthStateWeight: number;
  knowledgeTypeWeight: number;
  canonWeight: number;
}

/**
 * Compute the composite epistemic weight for a retrieval entry.
 * Reads `metadata.truth_state`, `metadata.knowledge_type`, and
 * `metadata.canon_status` from the entry's metadata blob.
 *
 * Returns a value in (0, 1.1] to multiply against the raw retrieval score.
 * All unknown / missing values default to neutral (1.0 or close to it).
 */
export function computeEpistemicWeight(
  metadata: Record<string, unknown> | undefined | null
): EpistemicWeightResult {
  const truthState    = (metadata?.truth_state    as string | undefined) ?? 'PENDING_VERIFICATION';
  const knowledgeType = (metadata?.knowledge_type as string | undefined) ?? 'EXPERIENCE';
  const canonStatus   = (metadata?.canon_status   as string | undefined) ?? 'UNKNOWN';

  const truthStateWeight    = TRUTH_STATE_WEIGHT[truthState]    ?? 0.70;
  const knowledgeTypeWeight = KNOWLEDGE_TYPE_WEIGHT[knowledgeType] ?? 0.85;
  const canonWeight         = CANON_STATUS_WEIGHT[canonStatus]  ?? 0.85;

  // Composite: truth-state is the dominant signal (weight 0.6),
  // knowledge-type is secondary (0.3), canon is a small nudge (0.1).
  const epistemicWeight =
    truthStateWeight    * 0.60 +
    knowledgeTypeWeight * 0.30 +
    canonWeight         * 0.10;

  return { epistemicWeight, truthStateWeight, knowledgeTypeWeight, canonWeight };
}

/**
 * Apply epistemic weighting to an array of retrieval entries in place.
 * Attaches `_epistemicWeight` to each entry for use in the final score formula.
 *
 * Call this AFTER reranking and entity boosting, BEFORE the final sort.
 */
export function applyEpistemicWeights<T extends { metadata?: Record<string, unknown> }>(
  entries: T[]
): Array<T & { _epistemicWeight: number }> {
  return entries.map((entry) => {
    const { epistemicWeight } = computeEpistemicWeight(entry.metadata);
    return { ...entry, _epistemicWeight: epistemicWeight };
  });
}
