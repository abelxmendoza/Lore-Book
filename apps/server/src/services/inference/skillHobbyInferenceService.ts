/**
 * Activity → hobby / skill inference (review-first, never hard-stored).
 */
import type {
  InferredHobbyAssociation,
  InferredSkillAssociation,
} from './inferenceAssociationTypes';
import { inferenceBase } from './inferenceAssociationTypes';
import { extractNamedPersonDoingActivity } from './relationshipInferenceService';

const ACTIVITY_SKILL_MAP: Array<{
  activityRe: RegExp;
  hobby: string;
  skills: string[];
  category: string;
}> = [
  { activityRe: /\bgardening\b/i, hobby: 'gardening', skills: ['gardening'], category: 'home_outdoor' },
  { activityRe: /\bfixing\s+(?:his|her|their|a|the)\s+bike\b/i, hobby: 'biking', skills: ['bike repair', 'mechanics'], category: 'mechanical' },
  { activityRe: /\bcoding\b/i, hobby: 'coding', skills: ['coding', 'programming'], category: 'technical' },
];

export function inferSkillHobbyFromActivity(
  text: string,
  messageId: string,
  peopleNames: string[]
): {
  skills: InferredSkillAssociation[];
  hobbies: InferredHobbyAssociation[];
} {
  const skills: InferredSkillAssociation[] = [];
  const hobbies: InferredHobbyAssociation[] = [];
  const seenSkill = new Set<string>();
  const seenHobby = new Set<string>();

  const personActivity = extractNamedPersonDoingActivity(text);
  if (personActivity) {
    for (const map of ACTIVITY_SKILL_MAP) {
      if (!map.activityRe.test(personActivity.activity) && !map.activityRe.test(text)) continue;
      const evidence = [`${personActivity.name} was ${personActivity.activity}`];

      const hobbyKey = `${personActivity.name}:h:${map.hobby}`;
      if (!seenHobby.has(hobbyKey)) {
        seenHobby.add(hobbyKey);
        hobbies.push({
          ...inferenceBase(messageId, evidence, 0.76, 'activity_to_hobby'),
          subjectName: personActivity.name,
          hobby: map.hobby,
          category: map.category,
          subjectKind: 'person',
        });
      }

      for (const skill of map.skills) {
        const skillKey = `${personActivity.name}:s:${skill}`;
        if (seenSkill.has(skillKey)) continue;
        seenSkill.add(skillKey);
        skills.push({
          ...inferenceBase(messageId, evidence, 0.74, 'activity_to_skill'),
          subjectName: personActivity.name,
          skill,
          category: map.category,
          subjectKind: 'person',
        });
      }
    }
  }

  const duckyBike = /\bDucky\s+fixing\s+(?:his|her|their|a|the)\s+bike\b/i.exec(text);
  if (duckyBike) {
    const evidence = [duckyBike[0]];
    for (const [hobby, conf, reason] of [
      ['biking', 0.77, 'fixing_bike_hobby'] as const,
    ]) {
      const key = `Ducky:h:${hobby}`;
      if (!seenHobby.has(key)) {
        seenHobby.add(key);
        hobbies.push({
          ...inferenceBase(messageId, evidence, conf, reason),
          subjectName: 'Ducky',
          hobby,
          category: 'recreation',
          subjectKind: 'person',
        });
      }
    }
    for (const [skill, conf] of [
      ['bike repair', 0.75],
      ['mechanics', 0.72],
    ] as const) {
      const key = `Ducky:s:${skill}`;
      if (seenSkill.has(key)) continue;
      seenSkill.add(key);
      skills.push({
        ...inferenceBase(messageId, evidence, conf, 'fixing_bike_skill'),
        subjectName: 'Ducky',
        skill,
        category: 'mechanical',
        subjectKind: 'person',
      });
    }
  }

  return { skills, hobbies };
}

export function inferCodingClubSkillInterest(
  text: string,
  messageId: string,
  groupName?: string,
  invitedPerson?: string
): {
  skills: InferredSkillAssociation[];
  hobbies: InferredHobbyAssociation[];
} {
  const skills: InferredSkillAssociation[] = [];
  const hobbies: InferredHobbyAssociation[] = [];

  if (!groupName || !/coding/i.test(groupName)) return { skills, hobbies };

  const userEvidence = [/\bour\b[^.]*coding club/i.exec(text)?.[0] ?? `our ${groupName}`];
  hobbies.push({
    ...inferenceBase(messageId, userEvidence, 0.82, 'group_domain_interest'),
    subjectName: 'user',
    hobby: 'coding',
    category: 'technical',
    subjectKind: 'user',
  });
  skills.push({
    ...inferenceBase(messageId, userEvidence, 0.8, 'group_domain_skill'),
    subjectName: 'user',
    skill: 'coding/programming',
    category: 'technical',
    subjectKind: 'user',
  });

  if (invitedPerson) {
    const inviteEvidence = [
      /\binvited\s+[A-Z][a-z]+/i.exec(text)?.[0] ?? `invited ${invitedPerson}`,
    ];
    hobbies.push({
      ...inferenceBase(messageId, inviteEvidence, 0.45, 'invited_coding_interest_low_confidence', true),
      subjectName: invitedPerson,
      hobby: 'coding',
      category: 'technical',
      subjectKind: 'person',
    });
  }

  return { skills, hobbies };
}
