/**
 * Group creation + association from club/team/meetup language.
 */
import { matchExistingGroup } from './historyAssociationService';
import type {
  HistoryContext,
  InferredEventAssociation,
  InferredGroupAssociation,
  InferredRelationshipAssociation,
} from './inferenceAssociationTypes';
import { inferenceBase } from './inferenceAssociationTypes';

const OUR_GROUP_RE =
  /\b(?:our|my)\s+(?:after\s+school\s+)?([A-Z][\w'&.-]+(?:\s+[A-Z][\w'&.-]+){0,3})\s*(?:Club|club|Team|team|Group|group)\b/i;
const GROUP_MEETUP_RE =
  /\b(?:after\s+school\s+)?([A-Z][\w'&.-]+(?:\s+[A-Z][\w'&.-]+){0,3})\s*(?:Club|club)\s+meet\s*up\b/i;
const GENERIC_CLUB_RE =
  /\b(?:our|my)\s+([A-Z][\w'&.-]+(?:\s+[A-Z][\w'&.-]+){0,3})\s*(?:club|team|group)\b/i;

export function inferGroupAssociations(
  text: string,
  messageId: string,
  history: HistoryContext
): {
  groups: InferredGroupAssociation[];
  events: InferredEventAssociation[];
  relationships: InferredRelationshipAssociation[];
} {
  const groups: InferredGroupAssociation[] = [];
  const events: InferredEventAssociation[] = [];
  const relationships: InferredRelationshipAssociation[] = [];

  const groupMatch =
    OUR_GROUP_RE.exec(text) ??
    GROUP_MEETUP_RE.exec(text) ??
    GENERIC_CLUB_RE.exec(text);

  if (!groupMatch?.[1]) return { groups, events, relationships };

  const baseName = groupMatch[1].trim();
  const groupName = /club/i.test(groupMatch[0]) ? `${baseName} Club` : baseName;
  const evidence = [groupMatch[0]];
  const existing = matchExistingGroup(history, groupName);
  const isCoding = /coding/i.test(groupName);

  groups.push({
    ...inferenceBase(messageId, evidence, 0.88, 'explicit_group_reference'),
    name: groupName,
    normalizedName: groupName.toLowerCase(),
    existingGroupId: existing?.id,
    type: 'school_club_or_interest_group',
    domain: isCoding ? 'coding/programming' : undefined,
    userRoleCandidate: /\bour\b/i.test(groupMatch[0]) ? 'member_or_organizer' : 'member_candidate',
    eventTitle: /meet\s*up/i.test(text) ? `after school ${groupName} meetup` : undefined,
    associatedPeople: ['user'],
  });

  if (/meet\s*up/i.test(text)) {
    events.push({
      ...inferenceBase(messageId, evidence, 0.86, 'group_meetup_reference'),
      title: `after school ${groupName} meetup`,
      kind: 'group_meetup',
      groupName,
      people: ['user'],
      timeHint: /around\s+noon/i.test(text) ? 'around noon' : undefined,
    });
  }

  relationships.push({
    ...inferenceBase(messageId, evidence, 0.87, 'user_associated_with_group'),
    subjectName: 'user',
    objectName: groupName,
    relationshipType: 'associated_with',
    direction: 'user_to_group',
  });

  return { groups, events, relationships };
}

export function extractGroupName(text: string): string | undefined {
  const m = OUR_GROUP_RE.exec(text) ?? GROUP_MEETUP_RE.exec(text) ?? GENERIC_CLUB_RE.exec(text);
  if (!m?.[1]) return undefined;
  const base = m[1].trim();
  return /club/i.test(m[0]) ? `${base} Club` : base;
}
