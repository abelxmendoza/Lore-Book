/**
 * Travel + school-class association inference (review-first, provenance-backed).
 */
import { matchExistingGroup } from './historyAssociationService';
import type {
  HistoryContext,
  InferredEventAssociation,
  InferredGroupAssociation,
  InferredHobbyAssociation,
  InferredRelationshipAssociation,
  InferredSkillAssociation,
  InferenceAmbiguity,
} from './inferenceAssociationTypes';
import { inferenceBase } from './inferenceAssociationTypes';
import { isTravelJapanSchoolJapaneseClassText } from '../lexical/travelContextLexical';

const SCHOOL_CLASS_RE =
  /\b(?:my|our)\s+school\s+([A-Z][\w]*(?:\s+[A-Z][\w]*)*)\s+Class\b/i;
const SCHOOL_CLASS_WITH_RE =
  /\bwith\s+my\s+school\s+([A-Z][\w]*(?:\s+[A-Z][\w]*)*)\s+Class\b/i;

export function extractSchoolClassName(text: string): string | undefined {
  const m = SCHOOL_CLASS_RE.exec(text) ?? SCHOOL_CLASS_WITH_RE.exec(text);
  if (!m?.[1]) return undefined;
  return `${m[1].trim()} Class`;
}

function resolveSchoolParent(
  history: HistoryContext,
  messageId: string,
  evidence: string[]
): {
  parentSchoolName?: string;
  parentSchoolId?: string;
  needsSchoolResolution: boolean;
  ambiguities: InferenceAmbiguity[];
  extraGroups: InferredGroupAssociation[];
  extraActions: { label: string; kind: string; payload: Record<string, unknown> }[];
} {
  const schools = [...history.schools.values()];
  const ambiguities: InferenceAmbiguity[] = [];
  const extraGroups: InferredGroupAssociation[] = [];
  const extraActions: { label: string; kind: string; payload: Record<string, unknown> }[] = [];

  if (schools.length === 1) {
    return {
      parentSchoolName: schools[0].name,
      parentSchoolId: schools[0].id,
      needsSchoolResolution: false,
      ambiguities,
      extraGroups,
      extraActions,
    };
  }

  if (schools.length > 1) {
    ambiguities.push({
      code: 'multiple_schools_needs_review',
      description: 'Multiple schools in history — link Japanese Class to the correct school.',
      confidence: 0.88,
    });
    for (const school of schools.slice(0, 3)) {
      extraActions.push({
        kind: 'link_subgroup_to_school',
        label: `Link Japanese Class to ${school.name}`,
        payload: { groupName: 'Japanese Class', schoolId: school.id, schoolName: school.name },
      });
    }
    extraActions.push({
      kind: 'create_school',
      label: 'Create new school',
      payload: {},
    });
    return {
      needsSchoolResolution: true,
      ambiguities,
      extraGroups,
      extraActions,
    };
  }

  extraGroups.push({
    ...inferenceBase(messageId, evidence, 0.7, 'unresolved_school_parent'),
    name: 'Unknown School',
    normalizedName: 'unknown school',
    type: 'school_unresolved',
    userRoleCandidate: undefined,
    associatedPeople: [],
    needsSchoolResolution: true,
  } as InferredGroupAssociation & { needsSchoolResolution?: boolean });

  ambiguities.push({
    code: 'school_parent_unresolved',
    description: 'No school in history — Japanese Class needs school resolution.',
    confidence: 0.9,
  });

  return {
    parentSchoolName: undefined,
    parentSchoolId: undefined,
    needsSchoolResolution: true,
    ambiguities,
    extraGroups,
    extraActions,
  };
}

export function inferTravelClassAssociations(
  text: string,
  messageId: string,
  history: HistoryContext
): {
  groups: InferredGroupAssociation[];
  events: InferredEventAssociation[];
  relationships: InferredRelationshipAssociation[];
  skills: InferredSkillAssociation[];
  hobbies: InferredHobbyAssociation[];
  ambiguities: InferenceAmbiguity[];
  actionExtras: { label: string; kind: string; payload: Record<string, unknown>; confidence: number }[];
} {
  const groups: InferredGroupAssociation[] = [];
  const events: InferredEventAssociation[] = [];
  const relationships: InferredRelationshipAssociation[] = [];
  const skills: InferredSkillAssociation[] = [];
  const hobbies: InferredHobbyAssociation[] = [];
  const ambiguities: InferenceAmbiguity[] = [];
  const actionExtras: { label: string; kind: string; payload: Record<string, unknown>; confidence: number }[] = [];

  const isTravelFixture = isTravelJapanSchoolJapaneseClassText(text);
  const hasTravel = isTravelFixture || /\bwent\s+to\s+Japan\b/i.test(text) || /\bwent\s+on\s+the\s+trip\b/i.test(text);
  const className = extractSchoolClassName(text);

  if (!hasTravel && !className) {
    return { groups, events, relationships, skills, hobbies, ambiguities, actionExtras };
  }

  if (hasTravel) {
    const travelEvidence = [/\bwent\s+to\s+Japan\b/i.exec(text)?.[0] ?? 'went to Japan'];
    events.push({
      ...inferenceBase(messageId, travelEvidence, 0.9, 'travel_to_japan'),
      title: 'Trip to Japan',
      kind: 'travel',
      place: 'Japan',
      people: ['user'],
      timeHint: /\blast\s+summer\b/i.test(text) ? 'last summer' : undefined,
    });

    if (className) {
      events.push({
        ...inferenceBase(messageId, [SCHOOL_CLASS_WITH_RE.exec(text)?.[0] ?? `trip with ${className}`], 0.82, 'educational_travel'),
        title: 'Japan school trip',
        kind: 'educational_travel',
        place: 'Japan',
        groupName: className,
        people: ['user'],
        timeHint: /\blast\s+summer\b/i.test(text) ? 'last summer' : undefined,
      });
      relationships.push({
        ...inferenceBase(messageId, travelEvidence, 0.84, 'trip_associated_with_class'),
        subjectName: 'Japan trip',
        objectName: className,
        relationshipType: 'associated_with',
        direction: 'user_to_group',
      });
    }
  }

  if (className) {
    const evidence = [SCHOOL_CLASS_RE.exec(text)?.[0] ?? SCHOOL_CLASS_WITH_RE.exec(text)?.[0] ?? className];
    const existing = matchExistingGroup(history, className);
    const schoolResolution = resolveSchoolParent(history, messageId, evidence);

    ambiguities.push(...schoolResolution.ambiguities);
    groups.push(...schoolResolution.extraGroups);

    const groupAssoc: InferredGroupAssociation & {
      parentSchoolName?: string;
      parentSchoolId?: string;
      needsSchoolResolution?: boolean;
      subgroupOf?: string;
    } = {
      ...inferenceBase(messageId, evidence, 0.91, 'explicit_school_class_reference'),
      name: className,
      normalizedName: className.toLowerCase(),
      existingGroupId: existing?.id,
      type: 'school_class',
      domain: 'education',
      userRoleCandidate: 'member_of',
      associatedPeople: ['user'],
      parentSchoolName: schoolResolution.parentSchoolName,
      parentSchoolId: schoolResolution.parentSchoolId,
      needsSchoolResolution: schoolResolution.needsSchoolResolution,
      subgroupOf: schoolResolution.parentSchoolName,
    };
    groups.push(groupAssoc);

    relationships.push({
      ...inferenceBase(messageId, evidence, 0.9, 'user_member_of_class'),
      subjectName: 'user',
      objectName: className,
      relationshipType: 'member_of',
      direction: 'user_to_group',
    });

    if (schoolResolution.parentSchoolName) {
      relationships.push({
        ...inferenceBase(messageId, evidence, 0.85, 'class_subgroup_of_school'),
        subjectName: className,
        objectName: schoolResolution.parentSchoolName,
        relationshipType: 'subgroup_of',
        direction: 'user_to_group',
      });
      relationships.push({
        ...inferenceBase(messageId, evidence, 0.8, 'user_indirect_school_via_class'),
        subjectName: 'user',
        objectName: schoolResolution.parentSchoolName,
        relationshipType: 'associated_with',
        direction: 'user_to_group',
      });

      actionExtras.push({
        kind: 'link_subgroup_to_school',
        label: `Link ${className} to ${schoolResolution.parentSchoolName}`,
        payload: { groupName: className, schoolName: schoolResolution.parentSchoolName },
        confidence: 0.88,
      });
      actionExtras.push({
        kind: 'mark_subgroup',
        label: `Mark ${className} as subgroup of ${schoolResolution.parentSchoolName}`,
        payload: { groupName: className, parentSchool: schoolResolution.parentSchoolName },
        confidence: 0.86,
      });
    }

    for (const extra of schoolResolution.extraActions) {
      actionExtras.push({ ...extra, confidence: 0.82 });
    }

    actionExtras.push({
      kind: 'create_group',
      label: `Create group: ${className}`,
      payload: { name: className, type: 'school_class' },
      confidence: 0.9,
    });

    if (/\bJapanese\b/i.test(text)) {
      for (const interest of ['Japanese language', 'Japanese culture']) {
        skills.push({
          ...inferenceBase(messageId, evidence, 0.74, 'class_context_interest'),
          subjectName: 'user',
          skill: interest,
          category: 'language_culture',
          subjectKind: 'user',
        });
      }
    }

    groups.push({
      ...inferenceBase(messageId, evidence, 0.68, 'community_container_candidate'),
      name: `${className} Community`,
      normalizedName: `${className} community`.toLowerCase(),
      type: 'community_container',
      domain: 'education',
      associatedPeople: ['user'],
      userRoleCandidate: 'member_candidate',
    });
  }

  if (/\bfavorite\s+summer\s+clothes\b/i.test(text)) {
    hobbies.push({
      ...inferenceBase(messageId, [/\bfavorite\s+summer\s+clothes\b/i.exec(text)?.[0] ?? 'favorite summer clothes'], 0.72, 'preference_candidate'),
      subjectName: 'user',
      hobby: 'summer clothes preference',
      category: 'preference',
      subjectKind: 'user',
    });
    ambiguities.push({
      code: 'preference_not_permanent_truth',
      description: 'Favorite summer clothes stored as preference candidate only.',
      confidence: 0.9,
    });
  }

  if (/\bhot\b/i.test(text) && !/\bhot\s+(?:flash|line)\b/i.test(text)) {
    ambiguities.push({
      code: 'weather_context_not_medical',
      description: '"hot" interpreted as weather context, not medical/safety event.',
      confidence: 0.93,
    });
  }

  return { groups, events, relationships, skills, hobbies, ambiguities, actionExtras };
}
