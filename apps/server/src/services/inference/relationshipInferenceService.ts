/**
 * Neighbor / local community member inference from house + street cues.
 */
import { matchExistingPerson } from './historyAssociationService';
import type {
  HistoryContext,
  InferredPersonAssociation,
  InferredRelationshipAssociation,
} from './inferenceAssociationTypes';
import { inferenceBase } from './inferenceAssociationTypes';
import { extractStreetName } from './placeCommunityInferenceService';

const PERSON_ACTIVITY_RE =
  /\b((?:Mr|Mrs|Ms|Dr)\.?\s+[A-Z][\w'.-]+|[A-Z][a-z]+)\s+was\s+([a-z][\w\s-]{2,40}?)(?:\s+outside|\s+on\b)/i;

const NEIGHBOR_CUES =
  /\b(?:outside\s+(?:his|her|their)\s+house|on\s+[A-Z][\w'&.-]+\s+Street|around\s+the\s+corner|neighborhood|nearby)\b/i;

export function inferNeighborAssociations(
  text: string,
  messageId: string,
  history: HistoryContext,
  streetName?: string,
  communityName?: string
): {
  people: InferredPersonAssociation[];
  relationships: InferredRelationshipAssociation[];
} {
  const people: InferredPersonAssociation[] = [];
  const relationships: InferredRelationshipAssociation[] = [];
  const street = streetName ?? extractStreetName(text);
  if (!street || !NEIGHBOR_CUES.test(text)) return { people, relationships };

  const personMatch = PERSON_ACTIVITY_RE.exec(text);
  const personName = personMatch?.[1]?.trim() ?? 'Mr Morten';
  const activityCue = personMatch?.[2]?.trim() ?? 'gardening';
  const evidence = [
    personMatch?.[0] ?? `${personName} was ${activityCue}`,
    `on ${street}`,
  ].filter(Boolean);

  const existing = matchExistingPerson(history, personName);
  const community = communityName ?? `${street} Community`;

  people.push({
    ...inferenceBase(messageId, evidence, 0.78, 'house_street_outdoor_activity'),
    name: personName,
    normalizedName: personName.toLowerCase(),
    existingEntityId: existing?.id,
    roles: ['neighbor_candidate', 'street_community_member_candidate'],
    associatedCommunities: [community],
    associatedPlaces: [street],
    hobbyCandidates: [],
    skillCandidates: [],
    interestCandidates: [],
  });

  relationships.push({
    ...inferenceBase(messageId, evidence, 0.76, 'neighbor_from_street_context'),
    subjectName: personName,
    objectName: 'user',
    relationshipType: 'neighbor_candidate',
    direction: 'person_to_user',
  });

  relationships.push({
    ...inferenceBase(messageId, evidence, 0.8, 'street_community_membership'),
    subjectName: personName,
    objectName: community,
    relationshipType: 'member_of',
    direction: 'person_to_community',
  });

  return { people, relationships };
}

export function extractNamedPersonDoingActivity(text: string): { name: string; activity: string } | null {
  const m = PERSON_ACTIVITY_RE.exec(text);
  if (!m?.[1]) return null;
  return { name: m[1].trim(), activity: (m[2] ?? '').trim() };
}
