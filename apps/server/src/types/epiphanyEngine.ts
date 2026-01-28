/**
 * LOREBOOK v0.1 — EPIPHANY ENGINE
 * Types for retroactive reinterpretation: when new information is added,
 * reinterpret past events and surface coherent insights.
 */

export type EpiphanyScope = 'global' | 'thread' | 'timeline_node';

export type EpiphanyCooldown = {
  scope: EpiphanyScope;
  scope_id?: string;
  last_fired_at: string; // ISO string
};

// Existing types remain unchanged:
// - EpiphanyMemory
// - EpiphanyInterpretation
// - EpiphanyPatternType (enum)
//
// EpiphanyPattern type is no longer used by the engine.
// It may remain defined for backward compatibility,
// but detectPattern returns ONLY EpiphanyPatternType | null.

/** Single memory unit used by the epiphany engine. */
export type EpiphanyMemory = {
  id: string;
  timestamp: string;
  text: string;
  entities: string[];
  themes: string[];
  emotions: string[];
};

/** Natural-language insight with confidence and lineage. */
export type EpiphanyInterpretation = {
  id: string;
  claim: string;
  confidence: number;
  supporting_memory_ids: string[];
  contradicting_memory_ids: string[];
  created_at: string;
  last_updated: string;
  supersedes_interpretation_ids: string[];
};

/** Pattern types detected from related memories. */
export type EpiphanyPatternType = 'REPEATED_EXCLUSION' | 'RECURRING_CONFLICT';

/** Detected pattern used to generate an interpretation. Kept for backward compat; engine uses EpiphanyPatternType + memories. */
export type EpiphanyPattern = {
  type: EpiphanyPatternType;
  memories: EpiphanyMemory[];
  dominantEntity?: string;
};
