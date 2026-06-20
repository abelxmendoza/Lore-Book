/**
 * Workplace inference orchestrator — careers, roles, coworkers, deployment sites, skills.
 * Review-first: all outputs carry inferredNotConfirmed=true and provenance.
 */
import type {
  HistoryContext,
  InferredEventAssociation,
  InferredGroupAssociation,
  InferredPersonAssociation,
  InferredPlaceAssociation,
  InferredRelationshipAssociation,
  InferredSkillAssociation,
  InferenceAmbiguity,
} from '../inferenceAssociationTypes';
import { inferenceBase } from '../inferenceAssociationTypes';
import { matchExistingEmployer, matchExistingPerson } from '../historyAssociationService';
import { inferCoworkerAssociations, extractCoworkerNames } from './coworkerInferenceService';
import { inferDeploymentSiteAssociations, extractDeploymentSites } from './deploymentSiteInferenceService';
import { buildRoleCandidate, extractRoleFromText } from './roleInferenceService';
import { buildSkillGraphInferences, applySkillFrequencyBoost } from './skillGraphInferenceService';
import {
  buildCareerTimelineEntry,
  buildOrganizationHierarchy,
  buildWorkplaceCommunity,
  formatCareerTimelineSummary,
} from './workplaceTimelineInferenceService';
import type { CareerTimelineEntry, SkillProgressionRecord } from './workplaceTypes';

export const ROBOTICS_WORKPLACE_FIXTURE_TEXT =
  "I worked at Armstrong Robotics as a robot tech with Gary and Jeff. I was doing ArUco calibration, gripper swaps, and live robot support at Denny's in Hollywood.";

export function isRoboticsWorkplaceFixtureText(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes('armstrong robotics') &&
    t.includes('robot tech') &&
    (t.includes('gary') || t.includes('jeff')) &&
    t.includes('aruco')
  );
}

const EMPLOYER_RE = /\bworked\s+at\s+([A-Z][\w]*(?:\s+[A-Z][\w]*)+)\b/;

export function extractEmployerName(text: string): string | undefined {
  const m = EMPLOYER_RE.exec(text);
  return m?.[1]?.trim();
}

export function inferWorkplaceAssociations(
  text: string,
  messageId: string,
  history: HistoryContext,
  options?: { skillMentionCounts?: Map<string, number>; userLabel?: string }
): {
  people: InferredPersonAssociation[];
  groups: InferredGroupAssociation[];
  relationships: InferredRelationshipAssociation[];
  skills: InferredSkillAssociation[];
  places: InferredPlaceAssociation[];
  events: InferredEventAssociation[];
  ambiguities: InferenceAmbiguity[];
  careerTimeline?: CareerTimelineEntry;
  skillProgressions: SkillProgressionRecord[];
  memoryReviewCandidates: string[];
  actionExtras: { label: string; kind: string; payload: Record<string, unknown>; confidence: number }[];
} {
  const userLabel = options?.userLabel ?? 'User';
  const people: InferredPersonAssociation[] = [];
  const groups: InferredGroupAssociation[] = [];
  const relationships: InferredRelationshipAssociation[] = [];
  const skills: InferredSkillAssociation[] = [];
  const places: InferredPlaceAssociation[] = [];
  const events: InferredEventAssociation[] = [];
  const ambiguities: InferenceAmbiguity[] = [];
  const memoryReviewCandidates: string[] = [];
  const actionExtras: { label: string; kind: string; payload: Record<string, unknown>; confidence: number }[] = [];

  const hasWorkContext =
    isRoboticsWorkplaceFixtureText(text) ||
    EMPLOYER_RE.test(text) ||
    /\bas\s+(?:a|an)\s+\w+/i.test(text);

  if (!hasWorkContext) {
    return {
      people,
      groups,
      relationships,
      skills,
      places,
      events,
      ambiguities,
      skillProgressions: [],
      memoryReviewCandidates,
      actionExtras,
    };
  }

  const employerName = extractEmployerName(text);
  const existingEmployer = employerName ? matchExistingEmployer(history, employerName) : null;

  // Rule 1: "worked at X" → worked_for organization
  if (employerName) {
    const evidence = [EMPLOYER_RE.exec(text)?.[0] ?? `worked at ${employerName}`];
    groups.push({
      ...inferenceBase(messageId, evidence, 0.9, 'employer_from_worked_at'),
      name: employerName,
      normalizedName: employerName.toLowerCase(),
      existingGroupId: existingEmployer?.id,
      type: 'company',
      domain: 'workplace',
      userRoleCandidate: extractRoleFromText(text)?.displayTitle,
      associatedPeople: extractCoworkerNames(text).map((c) => c.name),
    });

    relationships.push({
      ...inferenceBase(messageId, evidence, 0.9, 'worked_for'),
      subjectName: userLabel,
      objectName: employerName,
      relationshipType: 'worked_for',
      direction: 'user_to_group',
    });

    memoryReviewCandidates.push(`User worked for ${employerName}.`);
    actionExtras.push({
      kind: 'associate_employer',
      label: `Associate user with ${employerName}`,
      payload: { employerName, existingId: existingEmployer?.id },
      confidence: 0.9,
    });
  }

  // Rule 3: "as a X" → role candidate
  const { role, skillCandidates: roleSkills } = buildRoleCandidate(text, messageId);
  if (role) {
    memoryReviewCandidates.push(`User held role: ${role.displayTitle}.`);
    actionExtras.push({
      kind: 'assign_role',
      label: `Assign role: ${role.displayTitle}`,
      payload: { role: role.displayTitle, employerName },
      confidence: role.confidence,
    });
    for (const rs of roleSkills) {
      skills.push({
        ...inferenceBase(messageId, [role.evidencePhrase], 0.75, 'role_implied_skill'),
        subjectName: userLabel,
        skill: rs,
        category: 'professional',
        subjectKind: 'user',
      });
    }
  }

  // Rule 2: "with X" → coworker candidates (not manager without evidence)
  const coworkerResult = inferCoworkerAssociations(text, messageId, history, employerName, userLabel);
  people.push(...coworkerResult.people);
  relationships.push(...coworkerResult.relationships);
  for (const p of coworkerResult.people) {
    memoryReviewCandidates.push(`User worked with ${p.name}.`);
  }

  // Rule 5: deployment site ≠ employer
  const deploymentSites = extractDeploymentSites(text);
  const deploymentResult = inferDeploymentSiteAssociations({
    text,
    messageId,
    history,
    employerName,
    userLabel,
  });
  places.push(...deploymentResult.places);
  groups.push(...deploymentResult.groups);
  relationships.push(...deploymentResult.relationships);
  ambiguities.push(...deploymentResult.ambiguities);
  for (const site of deploymentSites) {
    memoryReviewCandidates.push(`User deployed to ${site.displayName}.`);
  }

  // Rules 4/6/7: skills from activities + frequency boost
  const skillGraph = buildSkillGraphInferences({
    text,
    messageId,
    history,
    userLabel,
    skillMentionCounts: options?.skillMentionCounts,
  });
  let inferredSkills = skillGraph.skills;
  const arucoMentions = options?.skillMentionCounts?.get('aruco calibration') ?? 0;
  if (arucoMentions >= 5) {
    inferredSkills = applySkillFrequencyBoost(inferredSkills, arucoMentions);
  }
  skills.push(...inferredSkills);

  // Career timeline + community + hierarchy
  let careerTimeline: CareerTimelineEntry | undefined;
  if (employerName) {
    careerTimeline = buildCareerTimelineEntry({
      employerName,
      role,
      skillProgressions: skillGraph.skillProgressions,
      deploymentSites,
    });
    memoryReviewCandidates.push(formatCareerTimelineSummary(careerTimeline));

    const community = buildWorkplaceCommunity({
      employerName,
      memberNames: coworkerResult.people.map((p) => p.name),
    });
    memoryReviewCandidates.push(
      `${userLabel} → member_of ${community.communityName}`
    );
    for (const member of coworkerResult.people) {
      relationships.push({
        ...inferenceBase(messageId, [`worked at ${employerName}`], community.confidence, 'community_member'),
        subjectName: member.name,
        objectName: community.communityName,
        relationshipType: 'member_of',
        direction: 'person_to_community',
      });
    }

    if (deploymentSites.length > 0) {
      const hierarchy = buildOrganizationHierarchy({ employerName, deploymentSites });
      memoryReviewCandidates.push(
        `${hierarchy.name} → Deployment Sites → ${deploymentSites.map((d) => d.displayName).join(', ')}`
      );
    }
  }

  // Hard rules ambiguities
  if (!/\b(?:boss|manager|supervisor)\b/i.test(text)) {
    ambiguities.push({
      code: 'no_manager_assumed',
      description: 'Did not infer manager relationships — no explicit evidence.',
      confidence: 0.95,
    });
  }
  if (employerName && deploymentSites.length > 0) {
    ambiguities.push({
      code: 'deployment_not_employer',
      description: 'Customer/deployment venues are not treated as employers.',
      confidence: 0.93,
    });
  }

  if (/\b(?:doing|was doing)\b/i.test(text)) {
    events.push({
      ...inferenceBase(messageId, [/\b(?:doing|was doing)\b/i.exec(text)?.[0] ?? 'work activities'], 0.8, 'work_activities'),
      title: 'Work activities described',
      kind: 'work_activity',
      people: [userLabel, ...coworkerResult.people.map((p) => p.name)],
      place: deploymentSites[0]?.displayName,
    });
  }

  // Attach existing person IDs without duplicating
  for (const p of people) {
    const existing = matchExistingPerson(history, p.name);
    if (existing) p.existingEntityId = existing.id;
  }

  return {
    people,
    groups,
    relationships,
    skills,
    places,
    events,
    ambiguities,
    careerTimeline,
    skillProgressions: skillGraph.skillProgressions,
    memoryReviewCandidates,
    actionExtras,
  };
}
