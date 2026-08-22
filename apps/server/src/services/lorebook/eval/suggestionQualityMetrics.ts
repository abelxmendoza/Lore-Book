/**
 * Standard suggestion-quality eval vocabulary.
 * One label per candidate; cleanup outcomes are scored separately against the oracle.
 */

export const CANDIDATE_OUTCOMES = [
  'ATTACHED_EXISTING',
  'CREATED_NEW',
  'REVIEWED',
  'REJECTED',
  'DEGRADED',
  'SUPPRESSED_PREVIOUS_REJECT',
  'SUPPRESSED_NOT_SAME',
  'MERGE_MEMORY_ATTACH',
  'WRONG_BOOK_ROUTED',
  'UNRESOLVED_ACTOR',
] as const;

export type CandidateOutcome = (typeof CANDIDATE_OUTCOMES)[number];

export const CLEANUP_OUTCOMES = [
  'MANUAL_MERGE_REQUIRED',
  'MANUAL_DELETE_REQUIRED',
  'MANUAL_TYPE_EDIT_REQUIRED',
  'MANUAL_RENAME_REQUIRED',
  'FALSE_POSITIVE_SUGGESTION',
  'DUPLICATE_CARD_CREATED',
] as const;

export type CleanupOutcome = (typeof CLEANUP_OUTCOMES)[number];

export const EVAL_BOOKS = [
  'characters',
  'locations',
  'organizations',
  'groups',
  'skills',
  'projects',
  'quests',
] as const;

export type EvalBook = (typeof EVAL_BOOKS)[number];

export type OutcomeCounts = Record<CandidateOutcome, number>;
export type CleanupCounts = Record<CleanupOutcome, number>;

export function emptyOutcomeCounts(): OutcomeCounts {
  return {
    ATTACHED_EXISTING: 0,
    CREATED_NEW: 0,
    REVIEWED: 0,
    REJECTED: 0,
    DEGRADED: 0,
    SUPPRESSED_PREVIOUS_REJECT: 0,
    SUPPRESSED_NOT_SAME: 0,
    MERGE_MEMORY_ATTACH: 0,
    WRONG_BOOK_ROUTED: 0,
    UNRESOLVED_ACTOR: 0,
  };
}

export function emptyCleanupCounts(): CleanupCounts {
  return {
    MANUAL_MERGE_REQUIRED: 0,
    MANUAL_DELETE_REQUIRED: 0,
    MANUAL_TYPE_EDIT_REQUIRED: 0,
    MANUAL_RENAME_REQUIRED: 0,
    FALSE_POSITIVE_SUGGESTION: 0,
    DUPLICATE_CARD_CREATED: 0,
  };
}

export type WriteAmplification = {
  aliasesWritten: number;
  evidenceUpdates: number;
  suggestionUpdates: number;
  canonicalUpdates: number;
  semanticWrites: number;
};

export function emptyWriteAmplification(): WriteAmplification {
  return {
    aliasesWritten: 0,
    evidenceUpdates: 0,
    suggestionUpdates: 0,
    canonicalUpdates: 0,
    semanticWrites: 0,
  };
}

export type PerformanceCounters = {
  canonIndexLoads: number;
  decisionIndexLoads: number;
  perCandidateDbQueries: number;
  llmCalls: number;
  durationMs: number;
  candidateCount: number;
};

export type PrecisionRecall = {
  entityCreationPrecision: number | null;
  duplicatePreventionRate: number | null;
  attachPrecision: number | null;
  suppressionPrecision: number | null;
  stableEntityRecall: number | null;
  unresolvedPrecision: number | null;
  wrongAttachCount: number;
  missedAttachCount: number;
};

export type CleanupBurden = {
  manualMerges: number;
  manualDeletes: number;
  manualTypeEdits: number;
  manualRenames: number;
  resurrectedDismissals: number;
  repeatedMergeSuggestions: number;
  total: number;
  per100Candidates: number | null;
};

export type BookScorecardRow = {
  book: EvalBook;
  candidates: number;
  created: number;
  attached: number;
  reviewed: number;
  rejected: number;
  unresolved: number;
  duplicates: number;
  wrongType: number;
  cleanupBurden: number;
};

export function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(4));
}
