/**
 * Trajectory requires multiple time-separated observations.
 */

import type { SkillTrajectoryV2 } from './skillCognitionTypes';

export function estimateSkillTrajectory(input: {
  practiceEventAts?: string[];
  practiceCount: number;
  evidenceText?: string;
  coverageConfidence?: number;
}): { trajectory: SkillTrajectoryV2; reasons: string[] } {
  const reasons: string[] = [];
  const ats = (input.practiceEventAts ?? [])
    .map((s) => Date.parse(s))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  if (input.practiceCount <= 1 || ats.length < 2) {
    reasons.push('insufficient_temporal_evidence');
    return { trajectory: 'UNKNOWN', reasons };
  }

  const text = input.evidenceText ?? '';
  if (/\b(?:improv(?:ing|ed)|getting\s+better|level(?:ing)?\s+up|progress)\b/i.test(text)) {
    reasons.push('explicit_improvement_language');
    return { trajectory: 'IMPROVING', reasons };
  }
  if (/\b(?:worse|declining|rusty|out\s+of\s+practice|falling\s+off)\b/i.test(text)) {
    reasons.push('explicit_decline_language');
    return { trajectory: 'DECLINING', reasons };
  }

  // Simple temporal density: more recent half denser → improving, else stable/unknown
  const mid = ats[Math.floor(ats.length / 2)]!;
  const early = ats.filter((t) => t <= mid).length;
  const late = ats.filter((t) => t > mid).length;
  if (late > early + 1) {
    reasons.push('increasing_practice_density');
    return { trajectory: 'IMPROVING', reasons };
  }
  if (early > late + 1 && (input.coverageConfidence ?? 0) >= 0.6) {
    reasons.push('decreasing_practice_density');
    return { trajectory: 'DECLINING', reasons };
  }

  if (ats.length >= 3) {
    reasons.push('multi_observation_stable');
    return { trajectory: 'STABLE', reasons };
  }

  reasons.push('default_emerging');
  return { trajectory: 'EMERGING', reasons };
}
