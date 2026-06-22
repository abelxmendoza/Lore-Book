import type { RelationshipCandidate } from './relationshipInferenceTypes';
import { USER_ENTITY } from './relationshipInferenceTypes';
import { buildRelationshipContext } from './relationshipProvenanceService';
import { makeRelationshipCandidate } from './relationshipDirectionResolver';
import { resolveTemporalStatus } from './relationshipTemporalResolver';

const ROMANTIC_RE =
  /\b([A-Z][a-z]+)\s+(?:is\s+my\s+)?(girlfriend|boyfriend|ex|crush|hookup|one\s+night\s+stand)\b/gi;

const ROMANTIC_EVENT_RE =
  /\b([A-Z][a-z]+)\s+(?:ghosted|blocked)\s+me\b/gi;

const SITUATIONSHIP_RE = /\b(?:talking\s+stage|situationship)\s+with\s+([A-Z][a-z]+)\b/gi;

export function inferRomanticRelationships(text: string): RelationshipCandidate[] {
  const out: RelationshipCandidate[] = [];
  let match: RegExpExecArray | null;

  const romanticRe = new RegExp(ROMANTIC_RE.source, 'gi');
  while ((match = romanticRe.exec(text)) !== null) {
    const name = match[1].trim();
    const role = match[2].trim().toLowerCase();
    const predicate =
      role === 'ex' ? 'ex_of' : role === 'crush' ? 'crush_of' : role.includes('girl') ? 'girlfriend_of' : 'boyfriend_of';

    out.push(
      makeRelationshipCandidate({
        subject: { displayName: name },
        predicate,
        object: USER_ENTITY,
        relationshipType: 'romantic',
        temporalStatus: resolveTemporalStatus(text, predicate),
        context: buildRelationshipContext(text, match[0]),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.9,
        inferredNotConfirmed: true,
        requiresReview: true,
        sensitive: true,
        promotionStatus: 'candidate',
      }),
    );
  }

  const eventRe = new RegExp(ROMANTIC_EVENT_RE.source, 'gi');
  while ((match = eventRe.exec(text)) !== null) {
    const name = match[1].trim();
    const predicate = match[0].toLowerCase().includes('ghosted') ? 'ghosted_by' : 'blocked_by';
    out.push(
      makeRelationshipCandidate({
        subject: { displayName: name },
        predicate,
        object: USER_ENTITY,
        relationshipType: 'conflict',
        temporalStatus: 'past',
        context: buildRelationshipContext(text, match[0], { emotionalContext: predicate }),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.88,
        inferredNotConfirmed: true,
        requiresReview: true,
        sensitive: true,
        promotionStatus: 'candidate',
      }),
    );
  }

  const situationRe = new RegExp(SITUATIONSHIP_RE.source, 'gi');
  while ((match = situationRe.exec(text)) !== null) {
    out.push(
      makeRelationshipCandidate({
        subject: { displayName: match[1].trim() },
        predicate: 'situationship_with',
        object: USER_ENTITY,
        relationshipType: 'romantic',
        temporalStatus: 'uncertain',
        context: buildRelationshipContext(text, match[0]),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.82,
        inferredNotConfirmed: true,
        requiresReview: true,
        sensitive: true,
        promotionStatus: 'candidate',
      }),
    );
  }

  return out;
}
