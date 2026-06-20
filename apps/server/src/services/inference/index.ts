/**
 * Inference Association Layer — soft association inference between meaning and ontology.
 */
export {
  inferenceAssociationService,
} from './inferenceAssociationService';

export type {
  InferenceAssociationInput,
  InferenceAssociationResult,
  InferredPersonAssociation,
  InferredGroupAssociation,
  InferredCommunityAssociation,
  InferredSkillAssociation,
  InferredHobbyAssociation,
  InferredRelationshipAssociation,
  InferredPlaceAssociation,
  InferredEventAssociation,
  InferenceAmbiguity,
  HistoryContext,
} from './inferenceAssociationTypes';

export {
  NEIGHBORHOOD_CODING_CLUB_FIXTURE_TEXT,
  isNeighborhoodAfterSchoolCodingClubText,
  inferenceBase,
  INFERENCE_AUTO_REVIEW_THRESHOLD,
} from './inferenceAssociationTypes';

export { loadHistoryContext, matchExistingPerson, matchExistingEmployer, matchExistingWorksite } from './historyAssociationService';
export {
  inferWorkplaceAssociations,
  extractEmployerName,
  isRoboticsWorkplaceFixtureText,
  ROBOTICS_WORKPLACE_FIXTURE_TEXT,
} from './work/workplaceInferenceService';
export { scoreInferenceConfidence, allInferencesRequireReview } from './inferenceConfidenceScorer';
