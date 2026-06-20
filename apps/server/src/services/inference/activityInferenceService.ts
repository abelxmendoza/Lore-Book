/**
 * Activity + invite → social relationship inference.
 */
import { matchExistingPerson } from './historyAssociationService';
import type {
  HistoryContext,
  InferredPersonAssociation,
  InferredRelationshipAssociation,
} from './inferenceAssociationTypes';
import { inferenceBase } from './inferenceAssociationTypes';
import { relativeLocationContext } from './placeCommunityInferenceService';

const INVITE_RE =
  /\b(?:I|i|we|We)\s+invited\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:out\s+to|to)\s+/;
const FOUND_DOING_RE =
  /\b(?:found|saw)\s+([A-Z][a-z]+)\s+([a-z][\w\s-]{2,40}?)(?:\s+around|\s+near|\s+on\b)/i;
const FIXING_BIKE_RE =
  /\b([A-Z][a-z]+)\s+fixing\s+(?:his|her|their|a|the)\s+bike\b/i;

export function inferActivityAndInviteAssociations(
  text: string,
  messageId: string,
  history: HistoryContext,
  streetName?: string,
  groupName?: string
): {
  people: InferredPersonAssociation[];
  relationships: InferredRelationshipAssociation[];
} {
  const people: InferredPersonAssociation[] = [];
  const relationships: InferredRelationshipAssociation[] = [];
  const seen = new Set<string>();

  const addPerson = (p: InferredPersonAssociation) => {
    const key = p.normalizedName;
    const existing = people.find((x) => x.normalizedName === key);
    if (existing) {
      existing.roles = [...new Set([...existing.roles, ...p.roles])];
      existing.hobbyCandidates = [...new Set([...existing.hobbyCandidates, ...p.hobbyCandidates])];
      existing.skillCandidates = [...new Set([...existing.skillCandidates, ...p.skillCandidates])];
      existing.interestCandidates = [...new Set([...existing.interestCandidates, ...p.interestCandidates])];
      existing.invitedTo = [...new Set([...(existing.invitedTo ?? []), ...(p.invitedTo ?? [])])];
      existing.evidencePhrases = [...new Set([...existing.evidencePhrases, ...p.evidencePhrases])];
      return;
    }
    if (seen.has(key)) return;
    seen.add(key);
    people.push(p);
  };

  const inviteMatch = INVITE_RE.exec(text);
  if (inviteMatch?.[1]) {
    const name = inviteMatch[1].trim();
    const evidence = [inviteMatch[0]];
    const existing = matchExistingPerson(history, name);
    const localCtx = relativeLocationContext(text, streetName);

    addPerson({
      ...inferenceBase(messageId, evidence, 0.72, 'invited_to_group_event'),
      name,
      normalizedName: name.toLowerCase(),
      existingEntityId: existing?.id,
      aliasLikely: existing?.aliasLikely ?? /ducky/i.test(name),
      roles: ['social_contact_candidate', 'friend_candidate'],
      associatedCommunities: [],
      associatedPlaces: streetName ? [streetName] : [],
      hobbyCandidates: [],
      skillCandidates: [],
      interestCandidates: [],
      invitedTo: groupName ? [`${groupName} meetup`] : [],
      localContext: localCtx,
    });

    relationships.push({
      ...inferenceBase(messageId, evidence, 0.74, 'user_invited_person'),
      subjectName: 'user',
      objectName: name,
      relationshipType: 'invited_by',
      direction: 'user_to_person',
    });

    relationships.push({
      ...inferenceBase(messageId, evidence, 0.7, 'social_contact_from_invitation'),
      subjectName: name,
      objectName: 'user',
      relationshipType: 'friend_candidate',
      direction: 'person_to_user',
    });

    if (groupName) {
      relationships.push({
        ...inferenceBase(messageId, evidence, 0.68, 'invited_to_group'),
        subjectName: name,
        objectName: groupName,
        relationshipType: 'invited_to',
        direction: 'person_to_community',
      });
    }
  }

  const foundMatch = FOUND_DOING_RE.exec(text) ?? FIXING_BIKE_RE.exec(text);
  if (foundMatch?.[1]) {
    const name = foundMatch[1].trim();
    const activity = foundMatch[2]?.trim() ?? 'fixing his bike';
    const evidence = [foundMatch[0]];
    const existing = matchExistingPerson(history, name);

    addPerson({
      ...inferenceBase(messageId, evidence, 0.75, 'observed_activity_near_street'),
      name,
      normalizedName: name.toLowerCase(),
      existingEntityId: existing?.id,
      aliasLikely: existing?.aliasLikely ?? /ducky/i.test(name),
      roles: ['local_context_member'],
      associatedCommunities: [],
      associatedPlaces: streetName ? [streetName] : [],
      hobbyCandidates: /bike|biking/i.test(activity) ? ['biking'] : [],
      skillCandidates: /fixing.*bike|bike repair|mechanics/i.test(activity) ? ['bike repair', 'mechanics'] : [],
      interestCandidates: /bike/i.test(activity) ? ['bikes'] : [],
      localContext: relativeLocationContext(text, streetName),
    });

    if (streetName) {
      relationships.push({
        ...inferenceBase(messageId, evidence, 0.7, 'local_context_near_street'),
        subjectName: name,
        objectName: streetName,
        relationshipType: 'local_context',
        direction: 'person_to_community',
      });
    }
  }

  return { people, relationships };
}

/** Do not create companion entities from inclusive "we". */
export function shouldSkipWeCompanionInference(text: string): boolean {
  return /\bwe\s+found\b/i.test(text) || /\bwe\s+were\b/i.test(text);
}
