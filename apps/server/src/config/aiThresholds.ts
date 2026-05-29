/**
 * Centralized AI/ML decision thresholds.
 *
 * Every value here was calibrated empirically.  Change with care and
 * update the comment when you have evidence for a new value.
 */

export const AI_THRESHOLDS = {
  /**
   * Jaro-Winkler score above which two names are treated as the same entity.
   * Catches "Sara"→"Sarah", initials, common nickname variants.
   * Below this, the system falls through to semantic embedding search.
   */
  JW_ENTITY_MATCH: 0.88,

  /**
   * Secondary JW band used in entityAmbiguityService for partial-match scoring.
   *   ≥ JW_ENTITY_MATCH    → high confidence (0.75)
   *   ≥ JW_PARTIAL_HIGH    → medium confidence (0.60)
   *   ≥ JW_PARTIAL_LOW     → low confidence (0.45)
   *   below                → effectively no match (0.20)
   */
  JW_PARTIAL_HIGH: 0.80,
  JW_PARTIAL_LOW:  0.72,

  /**
   * Cosine similarity threshold for pgvector RPC `match_omega_entities`.
   * Entities below this threshold are not returned as semantic matches.
   */
  SEMANTIC_ENTITY_MATCH: 0.7,

  /**
   * Minimum claim confidence for the claim to be considered valid / trusted.
   * Claims below this are flagged as conflicts in ingestion.
   */
  CLAIM_CONFIDENCE_FLOOR: 0.5,

  /**
   * Minimum confidence for a belief to be flagged as CONTRADICTED.
   */
  CONTRADICTION_CONFIDENCE: 0.5,

  /**
   * Minimum confidence for a PARTIALLY_SUPPORTED belief to generate an alert.
   */
  PARTIAL_SUPPORT_ALERT: 0.3,

  /**
   * Minimum confidence for a suggestion returned by suggestUpdates().
   */
  UPDATE_SUGGESTION_MIN: 0.7,

  /**
   * Confidence assigned to new-entity aliases before any usage data is
   * accumulated (used in normalizeEntity() for zero-usage entities).
   */
  COLD_START_CONFIDENCE: 0.3,

  /**
   * Number of distinct conversation appearances required before an entity
   * is promoted from 'mentioned_only' to 'confirmed'.
   * Prevents single weak LLM extractions from polluting the entity graph.
   */
  ENTITY_CONFIRMATION_THRESHOLD: 2,
} as const;

export type AiThresholdKey = keyof typeof AI_THRESHOLDS;
