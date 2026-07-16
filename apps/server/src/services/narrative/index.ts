// Types
export * from './types';
export * from './narrativeAnchorTypes';
export * from './narrativeCognitionTypes';
export { computeEntityGravity, computeGravityBatch } from './entityGravityService';

// Narrative Cognition Layer — reasoning over the graph, not retrieval
export {
  detectCognitionQuestion,
  answerCognitionQuestion,
  answerNarrativeCognition,
  buildCognitionContext,
  detectRecentChanges,
} from './narrativeReasoner';
export { computePersonSalience, rankMostImportant, risingPeople } from './salienceEngine';
export { buildSalienceInputs, classifyPersonCategory } from './relationshipSalience';
export { resolveActiveArcs } from './activeArcResolver';
export { resolveCurrentEra } from './lifeEraResolver';
export { resolveAttention } from './attentionResolver';
export { synthesizeIdentity } from './identitySynthesizer';
export { scoreEventImportance } from './importanceScorer';
export { assembleStories, latestStory } from './storyImportance';
export { buildAnchorsFromContext } from './anchorClusterBuilder';
export { narrativeAnchorService } from './narrativeAnchorService';
export { narrativeAnchorResolver } from './narrativeAnchorResolver';

// Core services
export { NarrativeEngine } from './narrativeEngine';
export { NarrativeBuilder } from './narrativeBuilder';
export { NarrativeSegmenter } from './narrativeSegmenter';
export { NarrativeConnector } from './narrativeConnector';
export { NarrativeStorage } from './narrativeStorage';

// Default export
export { NarrativeEngine as default } from './narrativeEngine';

