// Legacy result types
export * from './types';

// Structured pipeline types (record types, canonical events, trace, …)
export * from './narrativeRecords';

// Engine
export { StoryOfSelfEngine, type StoryOfSelfContext } from './storyOfSelfEngine';

// Pipeline stages (exported for tests and diagnostics)
export { normalizeEvidence, classifyRecordType } from './evidenceNormalizer';
export { resolveEntities, buildSeparationConstraints, isSeparated } from './entityResolution';
export { clusterCanonicalEvents } from './eventClustering';
export { scoreEvents, computeImportanceSignals, weightedImportance, IMPORTANCE_WEIGHTS } from './importanceScoring';
export { assessTurningPoints, classifyArcLabel } from './turningPointAssessment';
export { buildLifeChapters, inferThemes, synthesizeCurrentChapter } from './chapterAndThemes';
export { runQualityGates, validateLeakage, gatesToRecord } from './qualityGates';
export { renderNarrative } from './narrativeRenderer';
export { retrieveStoryOfSelfInput } from './longitudinalRetrieval';

// Default export
export { StoryOfSelfEngine as default } from './storyOfSelfEngine';
