/**
 * Temporal coherence for narrative anchors.
 */

import type { TemporalCoherenceScore } from './narrativeAnchorCognitionTypes';

const DAY_MS = 24 * 60 * 60 * 1000;

export function scoreTemporalCoherence(input: {
  dates?: string[];
  eventCount?: number;
}): TemporalCoherenceScore {
  const reasons: string[] = [];
  const times = (input.dates ?? [])
    .map((d) => Date.parse(d))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  let unresolvedDatePenalty = 0;
  if ((input.eventCount ?? 0) > 0 && times.length === 0) {
    unresolvedDatePenalty = 0.25;
    reasons.push('events_without_dates');
  }

  if (times.length === 0) {
    return {
      dateCoverage: 0.35,
      eventSpacing: 0.35,
      continuity: 0.4,
      temporalConflictPenalty: 0,
      unresolvedDatePenalty,
      finalScore: clamp01(0.4 - unresolvedDatePenalty),
      reasons: reasons.length ? reasons : ['no_dates'],
    };
  }

  if (times.length === 1) {
    reasons.push('single_timepoint');
    return {
      dateCoverage: 0.55,
      eventSpacing: 0.5,
      continuity: 0.55,
      temporalConflictPenalty: 0,
      unresolvedDatePenalty,
      finalScore: clamp01(0.55 - unresolvedDatePenalty),
      reasons,
    };
  }

  const spanDays = (times[times.length - 1]! - times[0]!) / DAY_MS;
  let temporalConflictPenalty = 0;
  // Huge span with few events → weak continuity
  if (spanDays > 400 && times.length < 3) {
    temporalConflictPenalty = 0.35;
    reasons.push('sparse_over_long_span');
  }

  const dateCoverage = Math.min(0.9, 0.4 + times.length * 0.12);
  const eventSpacing = spanDays < 90 ? 0.75 : spanDays < 365 ? 0.6 : 0.4;
  const continuity = clamp01(0.7 - temporalConflictPenalty);

  const finalScore = clamp01(
    dateCoverage * 0.3 + eventSpacing * 0.25 + continuity * 0.3 - unresolvedDatePenalty * 0.5,
  );

  return {
    dateCoverage,
    eventSpacing,
    continuity,
    temporalConflictPenalty,
    unresolvedDatePenalty,
    finalScore,
    reasons,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
