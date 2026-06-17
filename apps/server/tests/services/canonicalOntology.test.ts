import { describe, expect, it } from 'vitest';

import {
  entityClassToRootType,
  lexicalEntityTypeToRootType,
  llmEntityTypeToRootType,
  mapDomainToLexicalEntityType,
  mapDomainToRootType,
  bridgePlaceCategory,
  bridgeRelationshipRole,
  toStorageType,
  toOmegaType,
  isCharacterEligible,
  glossaryFoodDrinkLexicon,
  matchesGlossaryLexicon,
  parseLexicalAnalysisResult,
} from '../../src/services/ontology/canonical';
import { classifyEntity } from '../../src/services/entities/entityClassifier';
import { extractLexicalEntities } from '../../src/services/lexical/lexicalEntityExtractor';

describe('canonical mappers', () => {
  it('collapses EntityClass duplicates onto RootType', () => {
    expect(entityClassToRootType('PLACE')).toBe('LOCATION');
    expect(entityClassToRootType('LOCATION')).toBe('LOCATION');
    expect(entityClassToRootType('HOUSEHOLD')).toBe('LOCATION');
    expect(entityClassToRootType('COMPANY')).toBe('ORGANIZATION');
    expect(entityClassToRootType('FOOD_DRINK')).toBe('FOODDRINK');
    expect(entityClassToRootType('UNCLASSIFIED')).toBe('UNKNOWN');
  });

  it('maps LLM extraction types to canonical roots', () => {
    expect(llmEntityTypeToRootType('PERSON')).toBe('PERSON');
    expect(llmEntityTypeToRootType('PLACE')).toBe('LOCATION');
    expect(llmEntityTypeToRootType('ANIMAL')).toBe('PET');
    expect(llmEntityTypeToRootType('OBJECT')).toBe('POSSESSION');
  });

  it('maps storage and omega types from roots', () => {
    expect(toStorageType('PERSON')).toBe('person');
    expect(toStorageType('FOOD_DRINK')).toBe('platform');
    expect(toOmegaType('HOUSEHOLD')).toBe('LOCATION');
    expect(toOmegaType('FAMILY')).toBe('ORG');
  });

  it('only PERSON is character-eligible', () => {
    expect(isCharacterEligible('PERSON')).toBe(true);
    expect(isCharacterEligible('LOCATION')).toBe(false);
    expect(isCharacterEligible('UNKNOWN')).toBe(false);
  });
});

describe('lexical → ontology bridge', () => {
  it('maps kinship glossary hits to PERSON root', () => {
    expect(mapDomainToRootType('PERSON', 'FAMILY')).toBe('PERSON');
    expect(mapDomainToLexicalEntityType('PERSON', 'FAMILY')).toBe('PERSON');
  });

  it('maps anti-person domains without defaulting to PERSON', () => {
    expect(mapDomainToRootType('APP', 'SOFTWARE')).toBe('POSSESSION');
    expect(mapDomainToRootType('FOODDRINK', 'CONSUMABLE')).toBe('POSSESSION');
    expect(mapDomainToRootType('UNKNOWN', 'X')).toBe('POSSESSION');
    expect(mapDomainToLexicalEntityType('UNKNOWN', 'X')).toBe('OBJECT');
  });

  it('maps place categories to LOCATION ontology paths', () => {
    const nightclub = bridgePlaceCategory('night_club');
    expect(nightclub.rootType).toBe('LOCATION');
    expect(nightclub.subcategory).toBe('NIGHTCLUB');
  });

  it('maps relationship roles to hints', () => {
    expect(bridgeRelationshipRole('mother')).toBe('FAMILY_RELATIONSHIP');
    expect(bridgeRelationshipRole('coworker')).toBe('WORK_RELATIONSHIP');
    expect(bridgeRelationshipRole('rival')).toBe('ADVERSARIAL_RELATIONSHIP');
  });

  it('maps lexical signal types to roots', () => {
    expect(lexicalEntityTypeToRootType('EMOTION')).toBe('CONCEPT');
    expect(lexicalEntityTypeToRootType('OBJECT')).toBe('POSSESSION');
    expect(lexicalEntityTypeToRootType('ROLE')).toBe('CONCEPT');
  });
});

describe('glossary lexicon integration', () => {
  it('classifies High Noon via glossary food/drink lexicon', () => {
    const lexicon = glossaryFoodDrinkLexicon();
    expect(matchesGlossaryLexicon(['high noon'], lexicon)).toBe(true);
    expect(classifyEntity('High Noon').type).toBe('FOOD_DRINK');
  });

  it('does not auto-classify bare proper nouns as PERSON in lexical layer', () => {
    const entities = extractLexicalEntities('Morgan Gray went to the store.');
    const morgan = entities.find((e) => e.surface === 'Morgan Gray');
    expect(morgan?.type).toBe('OBJECT');
    expect(morgan?.subcategory).toBe('PROPER_NOUN');
    expect(morgan?.confidence).toBeLessThan(0.5);
  });
});

describe('Zod pipeline schemas', () => {
  it('validates a minimal lexical analysis result', () => {
    const parsed = parseLexicalAnalysisResult({
      messageId: 'msg-1',
      userId: 'user-1',
      rawText: 'hello',
      normalizedText: 'hello',
      entities: [],
      intents: [],
      emotions: [],
      relationships: [],
      skills: [],
      places: [],
      events: [],
      ontologyCandidates: [],
      memoryCandidates: [],
      glossaryMatches: [],
      confidence: 0.5,
      ambiguityFlags: [],
      needsClarification: false,
      createdAt: new Date().toISOString(),
    });
    expect(parsed.messageId).toBe('msg-1');
  });
});

describe('kinship and possessive guards', () => {
  it('classifies kinship with honorific as PERSON', () => {
    expect(classifyEntity('Tio Ralph').type).toBe('PERSON');
    expect(classifyEntity("Mom's House").type).toBe('HOUSEHOLD');
  });

  it('classifies apps and products from glossary', () => {
    expect(classifyEntity('Find My').type).toBe('APP');
    expect(classifyEntity('Amazon Ring').type).toBe('PRODUCT');
  });
});
