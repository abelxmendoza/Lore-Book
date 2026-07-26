/**
 * Quality-weighted learning score for What Lore Knows / knowledge base.
 * 100 means coherent coverage — not "extracted a lot".
 */

import { dedupeEntityFactsForDisplay, factTemporalPolarity, employmentOrProjectClusterKey, normalizeFactText } from './entityFactDedup';

export type LearningScoreFact = {
  fact: string;
  category: string;
  confidence?: number;
  status?: string;
  mention_count?: number;
  metadata?: Record<string, unknown> | null;
};

export type LearningScoreInput = {
  facts: LearningScoreFact[];
  patternCount: number;
  timelineEventCount: number;
  identityMentionCount?: number;
  memoryCount?: number;
  sceneCandidateCount?: number;
};

function evidenceCoverage(facts: LearningScoreFact[]): number {
  if (facts.length === 0) return 0;
  let withEvidence = 0;
  for (const f of facts) {
    const ids = f.metadata && Array.isArray(f.metadata.evidence_ids) ? f.metadata.evidence_ids : [];
    const conf = Number(f.metadata?.confirmation_count ?? f.mention_count ?? 1);
    if (ids.length >= 1 || conf >= 2) withEvidence += 1;
  }
  return withEvidence / facts.length;
}

function temporalCoherence(facts: LearningScoreFact[]): number {
  const career = facts.filter((f) => f.category === 'career' || employmentOrProjectClusterKey(normalizeFactText(f.fact)));
  if (career.length === 0) return 0.7;
  const present = career.filter((f) => factTemporalPolarity(f.fact) === 'present').length;
  const past = career.filter((f) => factTemporalPolarity(f.fact) === 'past').length;
  // Prefer a small set of present employment claims; many unresolved presents is incoherent.
  if (present <= 2) return 1;
  if (present <= 4 && past >= 1) return 0.75;
  return Math.max(0.2, 1 - (present - 2) * 0.15);
}

function contradictionRate(facts: LearningScoreFact[]): number {
  if (facts.length === 0) return 0;
  const contradicted = facts.filter((f) => f.status === 'contradicted').length;
  const withPrev = facts.filter((f) => {
    const changes = f.metadata && Array.isArray(f.metadata.state_changes) ? f.metadata.state_changes : [];
    return changes.length > 3;
  }).length;
  return (contradicted + withPrev * 0.5) / Math.max(facts.length, 1);
}

/**
 * Compute 0–100 learning score from unique facts + coverage signals.
 */
export function computeLearningScore(input: LearningScoreInput): number {
  const active = input.facts.filter((f) => f.status !== 'contradicted');
  const unique = dedupeEntityFactsForDisplay(
    active.map((f, i) => ({
      id: String(i),
      fact: f.fact,
      category: f.category,
      confidence: f.confidence ?? 0.7,
      mention_count: f.mention_count ?? 1,
      status: f.status,
      metadata: f.metadata ?? undefined,
    })),
  );

  const uniqueCount = unique.length;
  const coverage = evidenceCoverage(unique);
  const temporal = temporalCoherence(unique);
  const contradiction = contradictionRate(input.facts);

  const factPoints = Math.min(40, uniqueCount * 3.5);
  const evidencePoints = coverage * 20;
  const temporalPoints = temporal * 15;
  const patternPoints = Math.min(15, input.patternCount * 3);
  const timelinePoints = Math.min(10, input.timelineEventCount * 2);
  const identityPoints = Math.min(5, (input.identityMentionCount ?? 0) * 1.5);
  const memoryBonus = Math.min(5, (input.memoryCount ?? 0) * 0.4);
  const sceneBonus = Math.min(5, (input.sceneCandidateCount ?? 0) * 2);

  const raw =
    factPoints +
    evidencePoints +
    temporalPoints +
    patternPoints +
    timelinePoints +
    identityPoints +
    memoryBonus +
    sceneBonus;

  const penalized = raw * (1 - Math.min(0.55, contradiction * 0.8));

  // Volume without patterns/timeline cannot hit 100.
  const ceiling =
    input.patternCount === 0 && input.timelineEventCount === 0
      ? Math.min(72, penalized)
      : penalized;

  return Math.max(0, Math.min(100, Math.round(ceiling)));
}
