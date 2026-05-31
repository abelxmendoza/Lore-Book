export { evaluatePatternThreshold, evaluateArcClose } from './crystallizationService';
export { buildKnowledgePromptBlock, loadPromptClaims, formatPromptBlock } from './promptKnowledgeBuilder';
export type {
  CrystallizedKnowledge,
  CrystallizedKnowledgeWithEvidence,
  EvidenceLink,
  ConfidenceBreakdown,
  KnowledgeType,
  ClaimStatus,
  PromptReadyClaim,
  PatternThresholdContext,
} from './types';
