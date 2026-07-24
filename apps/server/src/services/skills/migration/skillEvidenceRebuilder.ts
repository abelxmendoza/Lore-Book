/**
 * Rebuild calibrated proficiency/usage/trajectory from stored evidence text.
 */

import { skillCognitionEngine } from '../skillCognitionEngine';

export function rebuildSkillEvidenceFields(input: {
  skillName: string;
  evidenceText?: string;
  practiceEventAts?: string[];
  knownSkillNames?: string[];
}) {
  const result = skillCognitionEngine.evaluate({
    span: input.skillName,
    evidenceText: input.evidenceText,
    practiceEventAts: input.practiceEventAts,
    knownSkills: (input.knownSkillNames ?? []).map((name) => ({ name })),
    sourceType: 'user_import',
  });

  return {
    existenceConfidence: result.existenceConfidence,
    proficiency: result.proficiency,
    usageFrequency: result.usageFrequency,
    trajectory: result.trajectory,
    monetization: result.monetization,
    evidenceStrength: result.evidenceStrength,
    decision: result.decision,
  };
}
