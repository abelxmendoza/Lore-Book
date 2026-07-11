import { describe, it, expect } from 'vitest';
import {
  evaluateTitleOnlyPersonGuard,
  isMinimumPersonEntity,
  isTitleOnlyToken,
  parsePersonSurface,
} from '../../../src/services/lexical/intelligence/titleOnlyEntityGuard';
import { applyTitleOnlyGuardToSpan } from '../../../src/services/lexical/intelligence/titleOnlyEntityGuardApply';
import { runLexicalIntelligence } from '../../../src/services/lexical/intelligence/lexicalIntelligenceService';
import type { LexicalIntelligenceSpan } from '../../../src/services/lexical/intelligence/lexicalIntelligenceTypes';

describe('titleOnlyEntityGuard', () => {
  describe('title-only rejection', () => {
    const titleOnlyCases = [
      ['Professor', 'TITLE_REFERENCE'],
      ['Mr', 'TITLE_REFERENCE'],
      ['Tio', 'FAMILY_REFERENCE'],
      ['Friend', 'UNRESOLVED_PERSON_REFERENCE'],
      ['Homie', 'UNRESOLVED_PERSON_REFERENCE'],
      ['Manager', 'ROLE_REFERENCE'],
      ['Promoter', 'ROLE_REFERENCE'],
      ['Dad', 'FAMILY_REFERENCE'],
      ['Mom', 'FAMILY_REFERENCE'],
    ] as const;

    it.each(titleOnlyCases)('%s → %s', (text, refType) => {
      const guard = evaluateTitleOnlyPersonGuard(text);
      expect(guard.isTitleOnly).toBe(true);
      expect(guard.referenceType).toBe(refType);
      expect(guard.needsResolution).toBe(true);
      expect(isMinimumPersonEntity(text)).toBe(false);
    });
  });

  describe('valid named persons', () => {
    const validCases = [
      'Mr. Morten',
      'Professor Kim',
      'Coach Ramirez',
      'Pastor Daniel',
      'President Biden',
      'Tio Ralph',
      'Abuela Carmen',
      'Principal Johnson',
      'Officer Garcia',
      'Captain Rodriguez',
      'DJ Shadow',
      'Mayor Bass',
      'Bryan Oconner',
      'Ducky',
      'Moth Queen',
      'Neon Newts',
    ];

    it.each(validCases)('%s passes minimum person rule', (name) => {
      const guard = evaluateTitleOnlyPersonGuard(name);
      expect(guard.isTitleOnly).toBe(false);
      expect(isMinimumPersonEntity(name)).toBe(true);
    });
  });

  describe('parsePersonSurface examples from spec', () => {
    it('professor homework → TITLE_REFERENCE', () => {
      const guard = parsePersonSurface('Professor');
      expect(guard.referenceType).toBe('TITLE_REFERENCE');
    });

    it('uncle reference → FAMILY_REFERENCE', () => {
      const guard = parsePersonSurface('uncle');
      expect(guard.referenceType).toBe('FAMILY_REFERENCE');
    });

    it('promoter → ROLE_REFERENCE', () => {
      const guard = parsePersonSurface('promoter');
      expect(guard.referenceType).toBe('ROLE_REFERENCE');
    });
  });

  describe('isTitleOnlyToken O(1) lookup', () => {
    it('recognizes normalized tokens', () => {
      expect(isTitleOnlyToken('Professor')).toBe(true);
      expect(isTitleOnlyToken('professor')).toBe(true);
      expect(isTitleOnlyToken('Kim')).toBe(false);
    });
  });
});

describe('applyTitleOnlyGuardToSpan', () => {
  const baseSpan = (text: string, type: LexicalIntelligenceSpan['type'] = 'PERSON'): LexicalIntelligenceSpan => ({
    id: '0:9:PERSON',
    text,
    start: 0,
    end: text.length,
    type,
    confidence: 0.85,
    evidencePhrases: [],
    contextWindow: { before: '', match: text, after: '' },
    detectionSource: 'pattern',
    alternatives: [],
    status: 'new',
  });

  it('reclassifies bare Professor to TITLE_REFERENCE', () => {
    const out = applyTitleOnlyGuardToSpan(baseSpan('Professor'));
    expect(out.type).toBe('TITLE_REFERENCE');
    expect(out.needsResolution).toBe(true);
    expect(out.rulesFired).toContain('title_only_entity_guard');
  });

  it('keeps Professor Kim as PERSON', () => {
    const out = applyTitleOnlyGuardToSpan(baseSpan('Professor Kim'));
    expect(out.type).toBe('PERSON');
  });
});

describe('runLexicalIntelligence integration', () => {
  it('does not emit bare title tokens as PERSON in messy text', () => {
    const result = runLexicalIntelligence({
      text: 'The professor gave us homework. The promoter kicked me out. My uncle was there.',
      includeAnalyzerEntities: true,
      analyzerMode: 'lite',
      useCache: false,
    });

    const personSpans = result.spans.filter((s) => s.type === 'PERSON');
    const refSpans = result.spans.filter((s) =>
      ['TITLE_REFERENCE', 'ROLE_REFERENCE', 'FAMILY_REFERENCE', 'UNRESOLVED_PERSON_REFERENCE'].includes(s.type)
    );

    expect(personSpans.every((s) => isMinimumPersonEntity(s.text))).toBe(true);
    expect(refSpans.some((s) => /professor|promoter|uncle/i.test(s.text))).toBe(true);
  });
});
