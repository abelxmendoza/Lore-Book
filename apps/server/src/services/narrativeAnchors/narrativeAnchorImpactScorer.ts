/**
 * Emotional / identity impact — gravity is not entity count.
 */

import type { NarrativeImpactScore } from './narrativeAnchorCognitionTypes';

export function scoreNarrativeImpact(input: {
  evidenceText?: string;
  eventTitles?: string[];
  evidenceLabels?: string[];
  significanceScore?: number;
  membershipOnly?: boolean;
  memberCount?: number;
}): NarrativeImpactScore {
  const reasons: string[] = [];
  const text = [
    input.evidenceText ?? '',
    ...(input.eventTitles ?? []),
    ...(input.evidenceLabels ?? []),
  ].join(' ');

  if (input.membershipOnly) {
    reasons.push('membership_only_low_impact');
    return {
      emotionalIntensity: 0.1,
      explicitImportance: 0.1,
      lifeDirectionChange: 0.05,
      identityChange: 0.05,
      relationshipChange: 0.1,
      workOrProjectImpact: 0.05,
      conflictSeverity: 0.05,
      resolutionStrength: 0.05,
      finalScore: 0.08,
      reasons,
    };
  }

  let emotionalIntensity = 0.25;
  if (/\b(?:felt|proud|hurt|scared|devastat|love|miss|happy|angry|grief)\b/i.test(text)) {
    emotionalIntensity = 0.75;
    reasons.push('emotional_lexicon');
  }

  let explicitImportance = 0.2;
  if (/\b(?:life-changing|important|milestone|pivotal|major|never\s+forget|defining)\b/i.test(text)) {
    explicitImportance = 0.9;
    reasons.push('explicit_importance');
  }
  if ((input.significanceScore ?? 0) >= 70) {
    explicitImportance = Math.max(explicitImportance, 0.8);
    reasons.push('high_significance_score');
  }

  let lifeDirectionChange = 0.15;
  if (/\b(?:quit|started|moved|graduat|new\s+job|unemploy|career|transition)\b/i.test(text)) {
    lifeDirectionChange = 0.75;
    reasons.push('life_direction');
  }

  let identityChange = 0.15;
  if (/\b(?:identity|who\s+i\s+am|scene|community|became|no\s+longer)\b/i.test(text)) {
    identityChange = 0.7;
    reasons.push('identity_language');
  }

  let relationshipChange = 0.15;
  if (/\b(?:broke\s+up|ended|drifted|reconnected|falling\s+out|conflict|friendship)\b/i.test(text)) {
    relationshipChange = 0.7;
    reasons.push('relationship_change');
  }

  let workOrProjectImpact = 0.15;
  if (/\b(?:lorebook|amazon|job|work|built|shipped|project|coding)\b/i.test(text)) {
    workOrProjectImpact = 0.7;
    reasons.push('work_or_project');
  }

  let conflictSeverity = 0.1;
  if (/\b(?:collapse|pushed\s+out|fight|banned|conflict|lost\s+access)\b/i.test(text)) {
    conflictSeverity = 0.8;
    reasons.push('conflict');
  }

  let resolutionStrength = 0.15;
  if (/\b(?:resolved|healed|returned|found|started\s+over)\b/i.test(text)) {
    resolutionStrength = 0.65;
    reasons.push('resolution');
  }

  // Entity-count must not inflate impact
  if ((input.memberCount ?? 0) >= 4 && explicitImportance < 0.4) {
    reasons.push('member_count_ignored_for_impact');
  }

  const finalScore = clamp01(
    emotionalIntensity * 0.15
      + explicitImportance * 0.2
      + lifeDirectionChange * 0.15
      + identityChange * 0.15
      + relationshipChange * 0.1
      + workOrProjectImpact * 0.1
      + conflictSeverity * 0.1
      + resolutionStrength * 0.05,
  );

  return {
    emotionalIntensity,
    explicitImportance,
    lifeDirectionChange,
    identityChange,
    relationshipChange,
    workOrProjectImpact,
    conflictSeverity,
    resolutionStrength,
    finalScore,
    reasons,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
