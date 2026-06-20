import { expect } from 'vitest';
import type { LexicalPreviewResult } from '../../src/services/lexical/lexicalPreviewService';
import type { InferenceAssociationResult } from '../../src/services/inference/inferenceAssociationTypes';
import {
  ROBOTICS_WORKPLACE_FIXTURE_TEXT,
  ROBOTICS_WORKPLACE_FIXTURE_ID,
} from '../../src/services/lexical/workplaceContextLexical';

export { ROBOTICS_WORKPLACE_FIXTURE_TEXT, ROBOTICS_WORKPLACE_FIXTURE_ID };

const span = (result: LexicalPreviewResult, re: RegExp) =>
  result.spans.find((s) => re.test(s.text));

export function assertWorkplacePreviewSpans(result: LexicalPreviewResult): void {
  const org = span(result, /Armstrong Robotics/i);
  expect(org, 'ORGANIZATION Armstrong Robotics').toBeDefined();
  expect(org!.type).toBe('ORGANIZATION');
  expect(org!.colorKey).toBe('organization');

  const role = span(result, /robot tech/i);
  expect(role, 'ROLE robot tech').toBeDefined();
  expect(role!.type).toBe('ROLE');
  expect(role!.colorKey).toBe('role');

  const gary = span(result, /^Gary$/);
  expect(gary, 'PERSON Gary').toBeDefined();
  expect(gary!.type).toBe('PERSON');

  const jeff = span(result, /^Jeff$/);
  expect(jeff, 'PERSON Jeff').toBeDefined();

  const skill = span(result, /ArUco calibration/i);
  expect(skill, 'SKILL ArUco calibration').toBeDefined();
  expect(skill!.colorKey).toBe('skill');

  const task = span(result, /gripper swaps/i);
  expect(task, 'TASK gripper swaps').toBeDefined();
  expect(task!.type).toBe('TASK');
  expect(task!.colorKey).toBe('task');

  const activity = span(result, /live robot support/i);
  expect(activity, 'WORK_ACTIVITY live robot support').toBeDefined();

  const deployment = span(result, /Denny's in Hollywood/i);
  expect(deployment, 'DEPLOYMENT_SITE Denny\'s Hollywood').toBeDefined();
  expect(deployment!.type).toBe('DEPLOYMENT_SITE');
  expect(deployment!.colorKey).toBe('worksite');
  expect(deployment!.parentContext, 'deployment under employer').toMatch(/DEPLOYMENT_UNDER/i);

  const hollywood = span(result, /^Hollywood$/);
  if (hollywood) {
    expect(hollywood.type).toBe('PLACE');
  } else {
    expect(deployment!.inferredAssociations?.some((a) => /PLACE:\s*Hollywood/i.test(a)), 'Hollywood embedded in deployment').toBe(true);
  }

  expect(result.spans.filter((s) => s.colorKey === 'uncertain'), 'no uncertain leftovers').toEqual([]);
}

export function assertWorkplaceInference(result: InferenceAssociationResult): void {
  expect(
    result.inferredRelationships.some(
      (r) => r.relationshipType === 'worked_for' && /Armstrong Robotics/i.test(r.objectName)
    ),
    'worked_for Armstrong Robotics'
  ).toBe(true);

  expect(
    result.inferredGroups.some((g) => g.type === 'company' && /Armstrong Robotics/i.test(g.name)),
    'employer organization'
  ).toBe(true);

  expect(
    result.inferredRelationships.some(
      (r) => r.relationshipType === 'worked_with' && r.objectName === 'Gary'
    ),
    'worked_with Gary'
  ).toBe(true);

  expect(
    result.inferredRelationships.some(
      (r) => r.relationshipType === 'worked_with' && r.objectName === 'Jeff'
    ),
    'worked_with Jeff'
  ).toBe(true);

  expect(
    result.inferredRelationships.some(
      (r) => r.relationshipType === 'deployed_to' && /Denny's Hollywood/i.test(r.objectName)
    ),
    'deployed_to Denny\'s Hollywood'
  ).toBe(true);

  expect(
    result.inferredSkills.some((s) => /ArUco calibration|robotics|field support/i.test(s.skill)),
    'skill inference'
  ).toBe(true);

  expect(
    result.ambiguities.some((a) => /deployment_not_employer|deployment_site_not_employer/i.test(a.code)),
    'deployment not employer'
  ).toBe(true);

  expect(
    result.ambiguities.some((a) => a.code === 'no_manager_assumed'),
    'no manager assumed'
  ).toBe(true);

  expect(result.inferredSkills.every((s) => s.inferredNotConfirmed)).toBe(true);
  expect(result.inferredRelationships.every((r) => r.inferredNotConfirmed)).toBe(true);

  expect(
    result.memoryReviewCandidates.some((c) => /Armstrong Robotics Community/i.test(c.claim)),
    'career community'
  ).toBe(true);
}

export function assertWorkplaceKnownWhenIndexed(result: LexicalPreviewResult): void {
  const org = span(result, /Armstrong Robotics/i);
  expect(org!.entityStatus).toBe('known');
  const gary = span(result, /^Gary$/);
  expect(gary!.entityStatus).toBe('known');
}

export function assertSkillConfidenceGrowth(
  skills: Array<{ skill: string; confidence: number; inferenceReason?: string }>,
  mentionCount: number
): void {
  const aruco = skills.find((s) => /aruco/i.test(s.skill));
  expect(aruco, 'ArUco skill present').toBeDefined();
  if (mentionCount >= 8) {
    expect(aruco!.confidence).toBeGreaterThanOrEqual(0.9);
  }
}

export function assertCareerTimeline(timeline: {
  organization: string;
  role?: string;
  skillsGained: string[];
}): void {
  expect(timeline.organization).toMatch(/Armstrong Robotics/i);
  expect(timeline.role).toMatch(/Robot Technician/i);
  expect(timeline.skillsGained.length).toBeGreaterThan(0);
}
