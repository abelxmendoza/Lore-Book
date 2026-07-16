/**
 * Evidence weighting — what the user states outright always outweighs what
 * the system inferred. Direct statements and shared experiences carry the
 * relationship model; single mentions and speculation barely move it.
 */
import { isClosureStatement } from './emotionalSignalEngine';
import type { EvidenceSource, RelationshipEvidence } from './relationshipCognitionTypes';

export const EVIDENCE_WEIGHT: Record<EvidenceSource, number> = {
  user_correction: 1.0,
  direct_statement: 0.9,
  relationship_label: 0.8,
  shared_experience: 0.7,
  mention: 0.4,
  speculation: 0.2,
};

const FIRST_PERSON_FEELING_RE =
  /\b(i (feel|felt|miss|love|like|trust|want|hope|care|hate|can'?t stop)|i('m| am) (into|over|attached|interested|done|falling)|my feelings)\b/i;

/** Classify free text into an evidence source tier. */
export function classifyEvidenceSource(text: string): EvidenceSource {
  if (isClosureStatement(text)) return 'user_correction';
  if (FIRST_PERSON_FEELING_RE.test(text)) return 'direct_statement';
  if (/\b(we (went|kissed|hooked|talked|hung|spent)|together (at|last))\b/i.test(text)) return 'shared_experience';
  if (/\b(apparently|i heard|someone said|maybe|might be|i think (she|he|they) might)\b/i.test(text)) return 'speculation';
  return 'mention';
}

export function weightFor(evidence: RelationshipEvidence): number {
  return EVIDENCE_WEIGHT[evidence.source];
}

/**
 * Confidence grows with weighted evidence volume but saturates — ten weak
 * mentions never reach the certainty of one direct statement plus history.
 */
export function aggregateConfidence(evidence: RelationshipEvidence[]): number {
  if (evidence.length === 0) return 0;
  let confidence = 0;
  for (const item of evidence) {
    confidence += (1 - confidence) * weightFor(item) * 0.45;
  }
  return Math.round(Math.min(0.95, confidence) * 100) / 100;
}
