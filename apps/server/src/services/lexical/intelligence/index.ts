export type {
  EntityType,
  LexicalIntelligenceSpan,
  LexicalIntelligenceResult,
  LexicalDebugReport,
} from './lexicalIntelligenceTypes';

export {
  runLexicalIntelligence,
  intelligenceSpanToPreview,
  findIntelligenceSpan,
} from './lexicalIntelligenceService';

export { buildLexicalDebugReport, formatSpanWhyHighlighted } from './lexicalDebugReporter';

export { SpanIntervalIndex, spansOverlap } from './spanIntervalIndex';
export { buildContextRuleSession } from './contextWindowScorer';
export { AhoCorasickMatcher } from './ahoCorasickMatcher';
export { hasWordBoundary, validatePreviewPattern } from '../previewPatternTypes';
export { patternEngineStats } from './lexicalPatternRegistry';
export {
  clearIntelligenceCache,
  intelligenceCacheSize,
  intelligenceCacheKey,
} from './lexicalIntelligenceCache';
export { fuseLogOddsConfidence, RULE_LOG_ODDS, classificationEntropy } from './logOddsConfidence';

export {
  LEXICAL_FIXTURE_PACK,
  runFixture,
  assertFixtureExpectations,
  runAllLexicalFixtures,
} from './lexicalFixtureRunner';

export { LEXICAL_PATTERN_REGISTRY } from './lexicalPatternRegistry';

export { normalizeEntityType, colorKeyForType } from './lexicalEntityTaxonomy';
