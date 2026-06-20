import { describe, it, expect } from 'vitest';
import {
  PREVIEW_PATTERNS,
  validatePreviewPattern,
} from '../../src/services/lexical/lexicalPreviewPatterns';
import {
  patternEngineStats,
  rebuildPatternEngineForTests,
  extractPatternCandidates,
} from '../../src/services/lexical/intelligence/lexicalPatternRegistry';
import { MESSY_REAL_USER_FIXTURES } from '../fixtures/lexical/messyRealUserFixtures';
import {
  assertFixtureExpectations,
} from '../../src/services/lexical/intelligence/lexicalFixtureRunner';
import { runLexicalIntelligence } from '../../src/services/lexical/intelligence/lexicalIntelligenceService';

describe('PreviewPattern explicit literals', () => {
  it('every pattern has id and literal or regex', () => {
    for (const p of PREVIEW_PATTERNS) {
      expect(() => validatePreviewPattern(p)).not.toThrow();
      expect(p.literal || p.regex).toBeTruthy();
      expect(!(p.literal && p.regex)).toBe(true);
    }
  });

  it('registers literals in AC without regex-source inference', () => {
    rebuildPatternEngineForTests();
    const stats = patternEngineStats();
    expect(stats.literalPhrases).toBeGreaterThan(20);
    expect(stats.regexPatterns).toBeGreaterThan(10);
    expect(stats.literalPhrases + stats.regexPatterns).toBeGreaterThanOrEqual(stats.totalPatterns);
  });

  it('literal and regex patterns both produce candidates', () => {
    const text = 'best friend worked at Armstrong Robotics yesterday';
    const candidates = extractPatternCandidates(text);
    expect(candidates.some((c) => c.patternLiteral === 'best friend')).toBe(true);
    expect(candidates.some((c) => c.patternRegexSource?.includes('worked'))).toBe(true);
  });

  it('throws when pattern has neither literal nor regex', () => {
    expect(() =>
      validatePreviewPattern({
        id: 'bad',
        type: 'PERSON',
        colorKey: 'person',
        confidenceBase: 0.5,
        priority: 1,
      })
    ).toThrow(/requires literal or regex/);
  });
});

describe('Messy real-user fixture pack', () => {
  for (const spec of MESSY_REAL_USER_FIXTURES) {
    it(`${spec.id} passes intelligence expectations`, () => {
      const result = runLexicalIntelligence({
        text: spec.text,
        includeAlternatives: true,
        analyzerMode: 'lite',
      });
      assertFixtureExpectations(spec, result);
    });
  }
});
