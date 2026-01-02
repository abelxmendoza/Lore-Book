// Types
export * from './types';

// Services
export { EntityExtractor } from './entityExtractor';
export { EntityNormalizer } from './entityNormalizer';
export { FuzzyMatcher } from './fuzzyMatcher';
export { DuplicateDetector } from './duplicateDetector';
export { EntityResolver } from './entityResolver';
export { EntityStorage } from './storageService';

// Default export
export { EntityResolver as default } from './entityResolver';

