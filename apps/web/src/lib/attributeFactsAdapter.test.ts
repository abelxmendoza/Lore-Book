import { describe, expect, it } from 'vitest';

import { buildFactsFromAttributes, mergeAttributeFactsIntoFacts } from './attributeFactsAdapter';
import { isHistoryFact } from './whatLoreKnowsFacts';

describe('buildFactsFromAttributes', () => {
  it('converts a structured attribute into a readable current-tense fact', () => {
    const facts = buildFactsFromAttributes([
      { id: 'a1', attributeType: 'occupation', attributeValue: 'software engineer', confidence: 0.9, isCurrent: true },
    ]);
    expect(facts).toHaveLength(1);
    expect(facts[0].fact).toBe('Works as software engineer');
    expect(facts[0].category).toBe('career');
    expect(facts[0].confidence).toBe(0.9);
  });

  it('phrases a past attribute in past tense so it partitions into History automatically', () => {
    const facts = buildFactsFromAttributes([
      { attributeType: 'workplace', attributeValue: 'Ring', isCurrent: false },
    ]);
    expect(facts[0].fact).toBe('Used to work at Ring');
    // Reuses the same temporal-polarity heuristic the rest of "What I Know" uses —
    // confirms an attribute-derived fact lands in the right bucket with no special-casing.
    expect(isHistoryFact({ fact: facts[0].fact })).toBe(true);
  });

  it('maps school/degree/major to Education and skill/hobby to Interests', () => {
    const facts = buildFactsFromAttributes([
      { attributeType: 'school', attributeValue: 'CSUF', isCurrent: false },
      { attributeType: 'hobby', attributeValue: 'ska shows', isCurrent: true },
    ]);
    expect(facts.find((f) => f.fact.includes('CSUF'))?.category).toBe('education');
    expect(facts.find((f) => f.fact.includes('ska shows'))?.category).toBe('interests');
  });

  it('deduplicates identical attributeType+value pairs', () => {
    const facts = buildFactsFromAttributes([
      { attributeType: 'current_city', attributeValue: 'Los Angeles', isCurrent: true },
      { attributeType: 'current_city', attributeValue: 'Los Angeles', isCurrent: true },
    ]);
    expect(facts).toHaveLength(1);
  });

  it('skips rows with no type or value rather than producing a blank fact', () => {
    const facts = buildFactsFromAttributes([
      { attributeType: '', attributeValue: 'x' },
      { attributeType: 'skill', attributeValue: '' },
    ]);
    expect(facts).toHaveLength(0);
  });

  it('supports the server snake_case field names as well as camelCase', () => {
    const facts = buildFactsFromAttributes([
      { attribute_type: 'hometown', attribute_value: 'Downey', is_current: true },
    ]);
    expect(facts).toHaveLength(1);
    expect(facts[0].fact).toBe('From Downey');
  });
});

describe('mergeAttributeFactsIntoFacts', () => {
  it('appends attribute-derived facts that are not already present as entity_facts', () => {
    const base = [{ fact: 'Works at Ring as a Technician' }];
    const attributeFacts = buildFactsFromAttributes([
      { attributeType: 'current_city', attributeValue: 'Los Angeles', isCurrent: true },
    ]);
    const merged = mergeAttributeFactsIntoFacts(base, attributeFacts);
    expect(merged).toHaveLength(2);
  });

  it('does not duplicate a fact whose text already exists in entity_facts', () => {
    const base = [{ fact: 'Works at Ring' }];
    const attributeFacts = buildFactsFromAttributes([
      { attributeType: 'workplace', attributeValue: 'Ring', isCurrent: true },
    ]);
    const merged = mergeAttributeFactsIntoFacts(base, attributeFacts);
    expect(merged).toHaveLength(1);
  });
});
