// Types
export * from './shadowTypes';

// Services
export { ShadowEngine } from './shadowEngine';
export { extractShadowSignals } from './shadowSignals';
export { computeShadowArchetypes } from './shadowArchetypes';
export { detectShadowLoops } from './shadowLoops';
export { detectShadowTriggers } from './shadowTriggers';
export { projectShadowTrajectory } from './shadowProjection';
export { buildShadowSummary } from './shadowSummary';
export { saveShadowProfile, getShadowProfile } from './shadowStorage';

// Default export
export { ShadowEngine as default } from './shadowEngine';

