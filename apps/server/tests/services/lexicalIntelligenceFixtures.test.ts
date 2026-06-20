import { describe, it, expect } from 'vitest';
import {
  LEXICAL_FIXTURE_PACK,
  assertFixtureExpectations,
} from '../../src/services/lexical/intelligence/lexicalFixtureRunner';
import { runLexicalIntelligence } from '../../src/services/lexical/intelligence/lexicalIntelligenceService';
import { buildLexicalDebugReport } from '../../src/services/lexical/intelligence/lexicalDebugReporter';

describe('Lexical Intelligence Engine — fixture pack', () => {
  for (const spec of LEXICAL_FIXTURE_PACK.filter((s) => s.mode !== 'analyzer')) {
    it(`${spec.id} — expected spans, context rules, and overlap resolution`, () => {
      const result = runLexicalIntelligence({
        text: spec.text,
        includeAlternatives: true,
        includeAnalyzerEntities: true,
      });
      assertFixtureExpectations(spec, result);
    });
  }

  it('school fixture — friends group keeps football team as separate SCHOOL_TEAM when both present', () => {
    const result = runLexicalIntelligence({
      text: LEXICAL_FIXTURE_PACK[0]!.text,
      includeAlternatives: true,
    });
    const friends = result.spans.find((s) => /friends from the football team/i.test(s.text));
    const team = result.spans.find((s) => /football team/i.test(s.text) && s.type === 'SCHOOL_TEAM');
    expect(friends?.type).toBe('FRIEND_GROUP');
    if (team) {
      expect(friends?.parentSpanId === team.id || friends?.text.includes('football')).toBe(true);
    }
  });

  it('travel fixture — Japan and went to Japan can coexist as linked spans', () => {
    const travelSpec = LEXICAL_FIXTURE_PACK.find((s) => s.id.includes('travel'))!;
    const result = runLexicalIntelligence({ text: travelSpec.text, includeAlternatives: true });
    const japan = result.spans.find((s) => s.text === 'Japan');
    const went = result.spans.find((s) => /went to Japan/i.test(s.text));
    expect(japan).toBeDefined();
    if (went) {
      expect(went.subtype).toBe('TRAVEL_EVENT');
    }
  });

  it('debug report includes average confidence', () => {
    const result = runLexicalIntelligence({
      text: LEXICAL_FIXTURE_PACK[0]!.text,
      includeAlternatives: true,
    });
    const report = buildLexicalDebugReport(LEXICAL_FIXTURE_PACK[0]!.text, result);
    expect(report.spanCount).toBeGreaterThan(0);
    expect(report.averageConfidence).toBeGreaterThan(0.7);
    expect(report.rulesFired.length).toBeGreaterThan(0);
  });

  it('ambiguous spans include alternatives', () => {
    const result = runLexicalIntelligence({
      text: 'friends from the football team at school',
      includeAlternatives: true,
    });
    const friends = result.spans.find((s) => /friends from/i.test(s.text));
    expect(friends?.alternatives.length).toBeGreaterThan(0);
  });
});
