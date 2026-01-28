/**
 * Analytics System - Module Exports
 */

export { identityPulseModule } from './identityPulse';
export { relationshipAnalyticsModule } from './relationshipAnalytics';
export { sagaEngineModule } from './sagaEngine';
export { characterAnalyticsModule } from './characterAnalytics';

// Placeholder exports for modules to be implemented
export { memoryFabricModule } from './memoryFabric';
export { insightEngineModule } from './insightEngine';
export { predictionEngineModule } from './predictionEngine';
export { shadowEngineModule } from './shadowEngine';
export { xpEngineModule } from './xpEngine';
export { lifeMapModule } from './lifeMap';
export { searchEngineModule } from './searchEngine';
export { rpgAnalyticsModule } from './rpgAnalytics';

export type { AnalyticsPayload, AnalyticsModuleType } from './types';

export {
  buildAnalyticsContext,
  buildCacheKey,
  createLegacyDescriptor,
  executeModuleSafely,
  runLegacyAnalytics,
  runAnalyticsOrchestrator,
} from './orchestrator';
export type { OrchestratorRequest, AnalyticsContext, AnalyticsResult } from './types';

