import type { RelationshipCandidate, EntityRef } from './relationshipInferenceTypes';
import { USER_ENTITY } from './relationshipInferenceTypes';
import { buildRelationshipContext } from './relationshipProvenanceService';
import { makeRelationshipCandidate } from './relationshipDirectionResolver';
import { resolveTemporalStatus } from './relationshipTemporalResolver';

function resolveEntity(name: string, resolved?: Record<string, string>): EntityRef {
  const key = name.toLowerCase();
  return { displayName: name, entityId: resolved?.[key] };
}

export function inferFamilyRelationships(
  text: string,
  resolvedEntities?: Record<string, string>,
): RelationshipCandidate[] {
  const out: RelationshipCandidate[] = [];

  let match: RegExpExecArray | null;

  const cousinRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+my\s+cousin\b/gi;
  while ((match = cousinRe.exec(text)) !== null) {
    const name = match[1].trim();
    out.push(
      makeRelationshipCandidate({
        subject: resolveEntity(name, resolvedEntities),
        predicate: 'cousin_of',
        object: USER_ENTITY,
        relationshipType: 'family',
        temporalStatus: resolveTemporalStatus(text, 'cousin_of'),
        context: buildRelationshipContext(text, match[0]),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.92,
        inferredNotConfirmed: true,
        requiresReview: true,
        sensitive: false,
        promotionStatus: 'candidate',
      }),
    );
  }

  const uncleRe = /\b(Tio|Tía|Tia)\s+([A-Z][a-z]+)\s+is\s+my\s+(?:tio|tía|tia|uncle|aunt)\b/gi;
  while ((match = uncleRe.exec(text)) !== null) {
    const name = `${match[1]} ${match[2]}`.trim();
    out.push(
      makeRelationshipCandidate({
        subject: resolveEntity(name, resolvedEntities),
        predicate: 'uncle_of',
        object: USER_ENTITY,
        relationshipType: 'family',
        temporalStatus: resolveTemporalStatus(text, 'uncle_of'),
        context: buildRelationshipContext(text, match[0]),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.93,
        inferredNotConfirmed: true,
        requiresReview: true,
        promotionStatus: 'candidate',
      }),
    );
  }

  return out;
}
