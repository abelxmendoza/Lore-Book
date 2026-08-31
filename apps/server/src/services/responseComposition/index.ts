export {
  buildCompositionPlan,
  formatCompositionPlanBlock,
  resolveCompositionPlan,
} from './engine';
export {
  COMPOSITION_PROFILE_POLICIES,
  resolveCompositionProfile,
} from './profileResolver';
export {
  COMPOSITION_PLAN_VERSION,
} from './types';
export {
  COMPOSITION_QUALITY_VERSION,
  evaluateComposition,
} from './qualityEvaluator';
export { recomposeResponseDraft } from './recompositionService';
export type {
  CompositionEvidencePriority,
  CompositionEvidenceSource,
  CompositionFollowUpStrategy,
  CompositionNarrativeStrategy,
  CompositionOrdering,
  CompositionPlan,
  CompositionPlanInput,
  CompositionProfile,
} from './types';
export type {
  CompositionQualityResult,
  CompositionQualityScores,
} from './qualityEvaluator';
