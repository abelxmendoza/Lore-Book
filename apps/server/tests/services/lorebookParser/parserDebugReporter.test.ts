import { describe, it, expect } from 'vitest';

import { parseLoreBookText } from '../../../src/services/lorebook/parser/loreBookParseEngine';
import {
  debugSpanTypes,
  formatOperation,
  summarizeParseResult,
} from '../../../src/services/lorebook/parser/parserDebugReporter';
import { FIXTURE_PROJECT_TRUE_POSITIVE_TEXT } from '../../../src/services/lorebook/parser/fixtures/loreBookParserFixtures';

describe('parserDebugReporter', () => {
  it('summarizeParseResult aggregates operation stats', () => {
    const result = parseLoreBookText({
      userId: 'user-1',
      text: FIXTURE_PROJECT_TRUE_POSITIVE_TEXT,
    });
    const summary = summarizeParseResult(result);
    expect(summary.operationCount).toBe(result.operations.length);
    expect(summary.spanCount).toBe(result.lexicalSpans.length);
    expect(summary.redirectCount).toBe(result.redirects.length);
    expect(summary.suppressedCount).toBe(result.suppressed.length);
    if (summary.operationCount > 0) {
      expect(summary.averageConfidence).toBeGreaterThan(0);
    }
  });

  it('formatOperation renders known operation kinds', () => {
    expect(formatOperation({ kind: 'suppress', name: 'Find My', reason: 'consumer', sourceSpans: [] })).toContain(
      'suppress'
    );
    expect(
      formatOperation({
        kind: 'redirect',
        fromDomain: 'characters',
        toDomain: 'locations',
        name: 'Gothicumbia',
        reason: 'cross_book_guard',
        confidence: 0.9,
      })
    ).toContain('redirect');
  });

  it('debugSpanTypes counts lexical span types', () => {
    const result = parseLoreBookText({
      userId: 'user-1',
      text: FIXTURE_PROJECT_TRUE_POSITIVE_TEXT,
    });
    const types = debugSpanTypes(result.lexicalSpans);
    expect(types.length).toBeGreaterThan(0);
    expect(types.every((t) => t.count > 0)).toBe(true);
  });
});
