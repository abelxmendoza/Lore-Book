import type { RelationshipCandidate } from './relationshipInferenceTypes';
import { buildRelationshipContext } from './relationshipProvenanceService';
import { makeRelationshipCandidate } from './relationshipDirectionResolver';

const SUBGROUP_RE =
  /\b([A-Z][A-Za-z\s]+Band)\s+(?:is\s+)?(?:a\s+)?subgroup_of\s+([A-Z][A-Za-z\s]+(?:School\s+Community|Community))\b/gi;

const MEMBERSHIP_RE =
  /\b(?:my|our)\s+(club|class|team|band)\b/gi;

const FROM_TEAM_RE = /\bfrom\s+(?:the\s+)?([A-Za-z][\w\s]+(?:team|club|band|class))\b/gi;

const INVITED_RE =
  /\b([A-Z][a-z]+)\s+(?:was\s+)?invited\s+to\s+(?:the\s+)?([A-Z][A-Za-z\s]+(?:meetup|Club|Party|Show))\b/gi;

export function inferGroupMemberships(text: string): RelationshipCandidate[] {
  const out: RelationshipCandidate[] = [];
  let match: RegExpExecArray | null;

  const subgroupRe = new RegExp(SUBGROUP_RE.source, 'gi');
  while ((match = subgroupRe.exec(text)) !== null) {
    out.push(
      makeRelationshipCandidate({
        subject: { displayName: match[1].trim() },
        predicate: 'subgroup_of',
        object: { displayName: match[2].trim() },
        relationshipType: 'group_membership',
        temporalStatus: 'current',
        direction: 'subject_to_object',
        context: buildRelationshipContext(text, match[0]),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.9,
        inferredNotConfirmed: true,
        requiresReview: true,
        promotionStatus: 'candidate',
      }),
    );
  }

  const invitedRe = new RegExp(INVITED_RE.source, 'gi');
  while ((match = invitedRe.exec(text)) !== null) {
    out.push(
      makeRelationshipCandidate({
        subject: { displayName: match[1].trim() },
        predicate: 'invited_to',
        object: { displayName: match[2].trim() },
        relationshipType: 'event_participation',
        temporalStatus: 'past',
        direction: 'subject_to_object',
        context: buildRelationshipContext(text, match[0], { eventContext: match[2].trim() }),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.88,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      }),
    );
  }

  const fromRe = new RegExp(FROM_TEAM_RE.source, 'gi');
  while ((match = fromRe.exec(text)) !== null) {
    out.push(
      makeRelationshipCandidate({
        subject: { displayName: 'user', entityId: 'user' },
        predicate: 'member_of',
        object: { displayName: match[1].trim() },
        relationshipType: 'group_membership',
        temporalStatus: 'current',
        direction: 'subject_to_object',
        context: buildRelationshipContext(text, match[0], { groupContext: match[1].trim() }),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.78,
        inferredNotConfirmed: true,
        requiresReview: true,
        promotionStatus: 'mention_only',
      }),
    );
  }

  return out;
}
