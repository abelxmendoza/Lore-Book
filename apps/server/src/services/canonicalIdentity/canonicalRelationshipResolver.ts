export type RelationshipEvidenceVerdict = {
  allowed: boolean;
  confidence: number;
  reason: string;
  rulesFired: string[];
};

const EXPLICIT_RELATIONSHIP =
  /\b(?:dating|boyfriend|girlfriend|partner|wife|husband|spouse|crush|ex|hooked up|together|in a relationship)\b/i;

const NEGATED_RELATIONSHIP =
  /\b(?:not dating|never dated|not my boyfriend|not my girlfriend|wtf)\b/i;

export function evaluateCanonicalRelationshipEvidence(text: string, corroboratingSignals = 0): RelationshipEvidenceVerdict {
  if (NEGATED_RELATIONSHIP.test(text)) {
    return { allowed: false, confidence: 0, reason: 'relationship_negated', rulesFired: ['relationship_negated'] };
  }
  if (EXPLICIT_RELATIONSHIP.test(text)) {
    return { allowed: true, confidence: 0.86, reason: 'explicit_relationship_evidence', rulesFired: ['explicit_relationship_evidence'] };
  }
  if (corroboratingSignals >= 2) {
    return { allowed: true, confidence: 0.72, reason: 'multiple_corroborating_signals', rulesFired: ['relationship_corroborated'] };
  }
  return { allowed: false, confidence: 0.25, reason: 'proximity_is_not_relationship_evidence', rulesFired: ['proximity_rejected'] };
}
