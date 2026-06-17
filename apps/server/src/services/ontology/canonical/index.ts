export {
  type RootType,
  CANONICAL_ROOT_TYPES,
  CHARACTER_ELIGIBLE_ROOTS,
  isRootType,
  isCharacterEligibleRoot,
  isUnknownRoot,
} from './rootType';

export {
  type EntityClass,
  type LlmEntityType,
  type StorageType,
  type LegacyOmegaEntityType,
  entityClassToRootType,
  lexicalEntityTypeToRootType,
  llmEntityTypeToRootType,
  toStorageType,
  toOmegaType,
  isUnknownEntity,
  isCharacterEligible,
  isUnknownRootType,
} from './mappers';

export {
  type OntologyBridgeResult,
  mapDomainToLexicalEntityType,
  mapDomainToRootType,
  bridgeGlossaryHit,
  bridgePlaceCategory,
  bridgeRelationshipRole,
  bridgeLexicalEntity,
} from './bridge';

export {
  lexicalEntitySchema,
  lexicalAnalysisResultSchema,
  meaningResolutionResultSchema,
  ontologyEnrichmentMetadataSchema,
  parseLexicalAnalysisResult,
  parseMeaningResolutionResult,
  safeParseLexicalAnalysisResult,
  safeParseMeaningResolutionResult,
} from './schemas';

export {
  glossaryAppsLexicon,
  glossaryFoodDrinkLexicon,
  glossaryProductLexicon,
  glossaryBrandLexicon,
  glossaryOrganizationLexicon,
  glossaryMediaLexicon,
  glossarySkillLexicon,
  matchesGlossaryLexicon,
  glossaryLexiconForDomains,
} from './glossaryLexicon';

export type {
  CanonicalRelationshipType,
  RelationshipScope,
  EntityRelationshipKnowledge,
  RelationshipInputGroup,
  DiscoveredEntityLink,
} from './relationshipKnowledge';

export {
  HINT_TO_SCOPE,
  roleToScope,
  roleToCanonicalType,
  roleToRelationshipHint,
  hintToScope,
  hintToDefaultRole,
} from './relationshipKnowledge';
