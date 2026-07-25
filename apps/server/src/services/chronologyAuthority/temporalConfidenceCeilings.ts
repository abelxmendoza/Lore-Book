/**
 * Confidence ceilings so fallback / year-only / import dates never look "exact".
 */

import type { TemporalEvidence, TemporalPrecision, TemporalSource } from '../temporal/temporalEvidence';

export const TEMPORAL_CONFIDENCE_CEILINGS = {
  USER_CORRECTED: 1.0,
  USER_STATED_EXACT: 0.98,
  USER_STATED_DAY: 0.95,
  RELATIVE_WITH_MESSAGE_ANCHOR: 0.93,
  DOCUMENT_STATED: 0.9,
  CONTEXT_INFERRED_RANGE: 0.7,
  RECORDING_FALLBACK: 0.2,
  YEAR_ONLY: 0.4,
  MONTH_ONLY: 0.55,
  UNKNOWN: 0,
  IMPORT_RECOVERY: 0.2,
} as const;

export function ceilingForTemporal(
  source: TemporalSource | string | null | undefined,
  precision: TemporalPrecision | string | null | undefined,
): number {
  const src = (source ?? 'recording_fallback') as TemporalSource;
  const prec = (precision ?? 'unknown') as TemporalPrecision;

  if (src === 'user_corrected') return TEMPORAL_CONFIDENCE_CEILINGS.USER_CORRECTED;
  if (src === 'recording_fallback') return TEMPORAL_CONFIDENCE_CEILINGS.RECORDING_FALLBACK;
  if (prec === 'year') return TEMPORAL_CONFIDENCE_CEILINGS.YEAR_ONLY;
  if (prec === 'month' || prec === 'season') return TEMPORAL_CONFIDENCE_CEILINGS.MONTH_ONLY;
  if (prec === 'unknown') return TEMPORAL_CONFIDENCE_CEILINGS.UNKNOWN;
  if (src === 'relative_expression') return TEMPORAL_CONFIDENCE_CEILINGS.RELATIVE_WITH_MESSAGE_ANCHOR;
  if (src === 'context_inferred') return TEMPORAL_CONFIDENCE_CEILINGS.CONTEXT_INFERRED_RANGE;
  if (src === 'document_stated') return TEMPORAL_CONFIDENCE_CEILINGS.DOCUMENT_STATED;
  if (prec === 'exact' || prec === 'time_of_day') return TEMPORAL_CONFIDENCE_CEILINGS.USER_STATED_EXACT;
  if (prec === 'date') return TEMPORAL_CONFIDENCE_CEILINGS.USER_STATED_DAY;
  return TEMPORAL_CONFIDENCE_CEILINGS.CONTEXT_INFERRED_RANGE;
}

/** Clamp evidence confidence; demote precision when source is a fallback. */
export function applyTemporalConfidenceCeiling(evidence: TemporalEvidence): TemporalEvidence {
  let precision = evidence.precision;
  let status = evidence.status;

  if (evidence.source === 'recording_fallback') {
    precision = 'unknown';
    status = evidence.start ? 'ambiguous' : 'unanchored';
  } else if (precision === 'year' && status === 'anchored') {
    status = 'approximate';
  }

  // Year/month/fallback must never be labeled exact
  if (
    (evidence.source === 'recording_fallback' || precision === 'year' || precision === 'month') &&
    evidence.precision === 'exact'
  ) {
    precision = evidence.source === 'recording_fallback' ? 'unknown' : precision;
  }

  const ceiling = ceilingForTemporal(evidence.source, precision);
  const confidence = Math.min(evidence.confidence, ceiling);

  return {
    ...evidence,
    precision,
    status,
    confidence,
  };
}

export function isImportOrRecoveryTag(tags: string[] | null | undefined): boolean {
  if (!tags?.length) return false;
  return tags.some((t) => /^(recovered|import|imported|chatgpt_import)$/i.test(t));
}
