import type { DetectionSource } from './lexicalIntelligenceTypes';

/**
 * Log-odds boosts per context rule — tuned against fixture pack.
 * Values are LLR contributions added to logit(baseConfidence).
 */
export const RULE_LOG_ODDS: Record<string, number> = {
  school_club_at_school: 0.38,
  friend_group_from_team: 0.32,
  school_team_sport: 0.18,
  employer_worked_at: 0.34,
  deployment_site_not_employer: 0.28,
  travel_destination_japan: 0.3,
  fuzzy_time_last_summer: 0.14,
  relationship_best_friend: 0.42,
  emotional_irreplaceability: 0.48,
  activity_bike_repair: 0.22,
  activity_gardening: 0.2,
};

const SOURCE_LLR: Record<DetectionSource, number> = {
  pattern: 0.1,
  history: 0.06,
  alias: 0.08,
  model: -0.04,
  correction: 0.12,
};

function logit(probability: number): number {
  const p = Math.max(0.01, Math.min(0.99, probability));
  return Math.log(p / (1 - p));
}

function sigmoid(logOdds: number): number {
  return 1 / (1 + Math.exp(-logOdds));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Shannon entropy of alternative type distribution (including primary). */
export function classificationEntropy(
  primaryConfidence: number,
  alternatives: Array<{ confidence: number }>
): number {
  const weights = [primaryConfidence, ...alternatives.map((a) => a.confidence)];
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return 0;

  let entropy = 0;
  for (const w of weights) {
    if (w <= 0) continue;
    const p = w / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function fuseLogOddsConfidence(input: {
  baseConfidence: number;
  rulesFired: string[];
  detectionSource: DetectionSource;
  needsReview?: boolean;
  alternatives?: Array<{ confidence: number }>;
}): { confidence: number; entropy: number; highAmbiguity: boolean } {
  let logOdds = logit(input.baseConfidence);

  for (const rule of input.rulesFired) {
    logOdds += RULE_LOG_ODDS[rule] ?? 0;
  }

  logOdds += SOURCE_LLR[input.detectionSource] ?? 0;

  if (input.detectionSource === 'model' && input.baseConfidence < 0.75) {
    logOdds -= 0.1;
  }

  let confidence = sigmoid(logOdds);
  if (input.needsReview) confidence = Math.min(confidence, 0.92);
  confidence = Math.max(0.35, Math.min(0.99, round(confidence)));

  const entropy = classificationEntropy(confidence, input.alternatives ?? []);
  const highAmbiguity = entropy > 1.35;

  return { confidence, entropy, highAmbiguity };
}
