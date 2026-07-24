/**
 * Usage frequency from time-separated practice observations only.
 */

import type { SkillUsageFrequencyV2 } from './skillCognitionTypes';

const DAY_MS = 24 * 60 * 60 * 1000;

export function estimateSkillUsageFrequency(input: {
  practiceEventAts?: string[];
  practiceCount: number;
  proposed?: string;
}): { frequency: SkillUsageFrequencyV2; reasons: string[] } {
  const reasons: string[] = [];
  const ats = (input.practiceEventAts ?? [])
    .map((s) => Date.parse(s))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  if (input.practiceCount <= 1 && ats.length <= 1) {
    reasons.push('single_observation');
    return { frequency: 'OBSERVED_ONCE', reasons };
  }

  if (ats.length < 2) {
    // Multiple practices claimed but no timestamps → unknown, not weekly
    reasons.push('missing_timestamps');
    return { frequency: input.practiceCount >= 2 ? 'RARE' : 'OBSERVED_ONCE', reasons };
  }

  const spanDays = (ats[ats.length - 1]! - ats[0]!) / DAY_MS;
  const count = ats.length;

  // Distinct calendar days
  const days = new Set(ats.map((t) => new Date(t).toISOString().slice(0, 10)));
  const distinctDays = days.size;

  if (distinctDays <= 1) {
    reasons.push('same_day_only');
    return { frequency: 'OBSERVED_ONCE', reasons };
  }

  const ratePerWeek = spanDays > 0 ? (distinctDays / spanDays) * 7 : 0;

  if (ratePerWeek >= 5 && spanDays >= 7) {
    reasons.push('daily_rate');
    return { frequency: 'DAILY', reasons };
  }
  if (ratePerWeek >= 2.5 && spanDays >= 14) {
    reasons.push('multiple_weekly_rate');
    return { frequency: 'MULTIPLE_TIMES_WEEKLY', reasons };
  }
  if (ratePerWeek >= 0.8 && spanDays >= 14) {
    reasons.push('weekly_rate');
    return { frequency: 'WEEKLY', reasons };
  }
  if (spanDays >= 60 && count >= 2) {
    reasons.push('monthly_or_rare');
    return { frequency: count >= 4 ? 'MONTHLY' : 'RARE', reasons };
  }

  reasons.push('insufficient_temporal_spread');
  return { frequency: 'RARE', reasons };
}
