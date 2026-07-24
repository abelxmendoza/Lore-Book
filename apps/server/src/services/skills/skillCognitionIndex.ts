/**
 * Public exports for Skill Cognition & Consolidation Engine v1.
 */

export * from './skillCognitionTypes';
export { SkillCognitionEngine, skillCognitionEngine } from './skillCognitionEngine';
export { resolveSkillAgent, isUserOwnedSkill, subjectBlocksUserSkillBook } from './skillAgentResolver';
export { classifyEvidenceRealityContext, realityBlocksSkillCreation } from './skillContextClassifier';
export { routeCapabilityOntology, entityTypeIsSkillBookEligible } from './capabilityOntologyRouter';
export { evaluateSkillEligibility, classifyEvidenceStrength } from './skillEligibilityGate';
export { resolveSkillCanonical, isLoreBookProjectLabel } from './skillCanonicalResolver';
export { findSimilarExistingSkill } from './skillSimilarityResolver';
export { resolveSkillHierarchy } from './skillHierarchyResolver';
export { aggregateSkillEvidence } from './skillEvidenceAggregator';
export { estimateSkillProficiency } from './skillProficiencyEstimator';
export { estimateSkillUsageFrequency } from './skillUsageEstimator';
export { estimateSkillTrajectory } from './skillTrajectoryEstimator';
export { classifySkillMonetization } from './skillMonetizationClassifier';
export { linkSkillToProjects } from './skillProjectLinker';
export { linkSkillResponsibility } from './skillResponsibilityLinker';
export { formatSkillDiagnostics, buildSkillDiagnostics } from './skillDiagnostics';
export {
  applySkillCorrections,
  correctionBlocksCreation,
  correctionForcesConfirm,
  type SkillCorrection,
} from './skillCorrectionService';
