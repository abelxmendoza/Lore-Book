import type { RelationshipCandidate } from './relationshipInferenceTypes';
import { USER_ENTITY } from './relationshipInferenceTypes';
import { buildRelationshipContext } from './relationshipProvenanceService';
import { makeRelationshipCandidate } from './relationshipDirectionResolver';
import { applyTemporalToPredicate, resolveTemporalStatus } from './relationshipTemporalResolver';

const FRIENDSHIP_RE =
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:is\s+my|used\s+to\s+be\s+my)\s+(best\s+friend|close\s+friend|friend|homie|old\s+friend|childhood\s+friend)\b/gi;

const FRIEND_FROM_GROUP_RE =
  /\bfriend\s+from\s+(?:the\s+)?([A-Za-z][\w\s]+(?:team|club|class|band))\b/gi;

function resolveEntity(name: string): RelationshipCandidate['subject'] {
  return { displayName: name };
}

function friendshipPredicate(role: string): string {
  const key = role.toLowerCase();
  if (key.includes('best')) return 'best_friend_of';
  if (key.includes('close')) return 'close_friend_of';
  if (key.includes('childhood') || key.includes('old')) return 'childhood_friend_of';
  return 'friend_of';
}

export function inferFriendshipRelationships(text: string): RelationshipCandidate[] {
  const out: RelationshipCandidate[] = [];
  let match: RegExpExecArray | null;

  const friendRe = new RegExp(FRIENDSHIP_RE.source, 'gi');
  while ((match = friendRe.exec(text)) !== null) {
    const name = match[1].trim();
    const role = match[2].trim();
    const temporal = resolveTemporalStatus(text, friendshipPredicate(role));
    const predicate = applyTemporalToPredicate(friendshipPredicate(role), temporal);

    out.push(
      makeRelationshipCandidate({
        subject: resolveEntity(name),
        predicate,
        object: USER_ENTITY,
        relationshipType: 'friendship',
        temporalStatus: temporal,
        direction: 'bidirectional',
        context: buildRelationshipContext(text, match[0]),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: role.toLowerCase().includes('best') ? 0.94 : 0.88,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      }),
    );
  }

  const groupRe = new RegExp(FRIEND_FROM_GROUP_RE.source, 'gi');
  while ((match = groupRe.exec(text)) !== null) {
    out.push(
      makeRelationshipCandidate({
        subject: { displayName: 'Unresolved Friend', unresolved: true },
        predicate: 'friend_from_group',
        object: { displayName: match[1].trim() },
        relationshipType: 'friendship',
        temporalStatus: 'current',
        direction: 'unclear',
        context: buildRelationshipContext(text, match[0], { groupContext: match[1].trim() }),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.72,
        inferredNotConfirmed: true,
        requiresReview: true,
        promotionStatus: 'mention_only',
      }),
    );
  }

  return out;
}
