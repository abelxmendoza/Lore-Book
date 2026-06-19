import { describe, expect, it } from 'vitest';

import { evaluateEntityCandidates, hasEntityCandidates } from './entityCandidateGate';

describe('entityCandidateGate', () => {
  describe('skips the entity-extraction LLM (no candidates)', () => {
    const entityFree = [
      'had a great workout today',
      'feeling tired and kind of burnt out',
      'thanks!',
      'i went for a long run this morning and felt amazing',
      'cooked dinner and watched a movie',
    ];
    for (const text of entityFree) {
      it(`skips: "${text}"`, () => {
        expect(hasEntityCandidates(text)).toBe(false);
      });
    }

    it('does not count a sentence-start capital as a proper noun', () => {
      // "Woke" is only capitalized by position — not an entity.
      const v = evaluateEntityCandidates('Woke up early and felt rested');
      expect(v.properNounCount).toBe(0);
      expect(v.hasCandidates).toBe(false);
    });
  });

  describe('runs the LLM (candidates present)', () => {
    it('proper noun (named person)', () => {
      const v = evaluateEntityCandidates('had coffee with Maria today');
      expect(v.hasCandidates).toBe(true);
      expect(v.properNounCount).toBeGreaterThan(0);
    });

    it('multi-token proper noun at sentence start', () => {
      expect(evaluateEntityCandidates('Blue Bottle had a long line').hasCandidates).toBe(true);
    });

    it('glossary kinship entity (no proper noun)', () => {
      const v = evaluateEntityCandidates('went to my abuela for dinner');
      expect(v.hasCandidates).toBe(true);
      expect(v.glossaryHitCount).toBeGreaterThan(0);
    });

    it('describable unnamed person', () => {
      const v = evaluateEntityCandidates('the barista gave me a free coffee');
      expect(v.hasCandidates).toBe(true);
      expect(v.describableCue).toBe(true);
    });

    it('describable place/org', () => {
      expect(evaluateEntityCandidates('met someone cool at the gym').hasCandidates).toBe(true);
    });
  });

  it('empty text → no candidates', () => {
    expect(evaluateEntityCandidates('').hasCandidates).toBe(false);
    expect(evaluateEntityCandidates('   ').hasCandidates).toBe(false);
  });
});
