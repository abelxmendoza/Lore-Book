// Types
export * from './types';

// Core services
export { RecommendationEngine } from './recommendationEngine';
export { RecommendationStorageService, recommendationStorageService } from './storageService';
export { PriorityScorer } from './prioritization/priorityScorer';

// Generators
export { JournalPromptGenerator } from './generators/journalPromptGenerator';
export { ReflectionQuestionGenerator } from './generators/reflectionQuestionGenerator';
export { ActionGenerator } from './generators/actionGenerator';
export { RelationshipCheckinGenerator } from './generators/relationshipCheckinGenerator';
export { GoalReminderGenerator } from './generators/goalReminderGenerator';
export { PatternExplorationGenerator } from './generators/patternExplorationGenerator';
export { GapFillerGenerator } from './generators/gapFillerGenerator';
export { ContinuityFollowupGenerator } from './generators/continuityFollowupGenerator';
export { GrowthOpportunityGenerator } from './generators/growthOpportunityGenerator';
export { LegacyGenerator } from './generators/legacyGenerator';

// Utilities
export { deduplicateRecommendations, isSimilarRecommendation } from './deduplication';

// Default export
export { RecommendationEngine as default } from './recommendationEngine';

