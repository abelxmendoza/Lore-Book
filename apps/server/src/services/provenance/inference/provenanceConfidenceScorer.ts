import type { ProvenanceOrigin, ProvenanceSourceType } from './provenanceInferenceTypes';

/** Authority order — higher rank wins in conflict resolution. */
export const AUTHORITY_RANK: Record<ProvenanceOrigin, number> = {
  user_corrected: 8,
  user_confirmed: 7,
  explicit_user_statement: 6,
  implicit_user_statement: 5,
  system_inferred: 4,
  assistant_generated: 3,
};

const BASE_CONFIDENCE: Record<ProvenanceOrigin, number> = {
  user_corrected: 0.98,
  user_confirmed: 0.95,
  explicit_user_statement: 0.92,
  implicit_user_statement: 0.78,
  system_inferred: 0.68,
  assistant_generated: 0.45,
};

const SOURCE_TYPE_BOOST: Partial<Record<ProvenanceSourceType, number>> = {
  manual_edit: 0.05,
  user_correction: 0.04,
  user_message: 0.02,
};

export function scoreConfidence(
  origin: ProvenanceOrigin,
  sourceType: ProvenanceSourceType,
  opts: { mentionCount?: number; userConfirmed?: boolean } = {},
): number {
  let score = BASE_CONFIDENCE[origin];
  score += SOURCE_TYPE_BOOST[sourceType] ?? 0;

  const mentions = opts.mentionCount ?? 1;
  if (mentions >= 2 && origin === 'explicit_user_statement') {
    score = Math.min(0.97, score + 0.03 * Math.min(mentions - 1, 3));
  }
  if (mentions >= 3 && origin === 'implicit_user_statement') {
    score = Math.min(0.88, score + 0.02 * Math.min(mentions - 2, 2));
  }
  if (opts.userConfirmed) {
    score = Math.max(score, 0.95);
  }

  return Math.min(0.99, Math.max(0.1, score));
}

export function originOutranks(a: ProvenanceOrigin, b: ProvenanceOrigin): boolean {
  return AUTHORITY_RANK[a] > AUTHORITY_RANK[b];
}

export function inferenceConfidenceLowerThanExplicit(
  inferred: number,
  explicit: number,
): boolean {
  return inferred < explicit;
}
