/**
 * Golden temporal question audit — run with: npx vitest run tests/scripts/temporalGoldenQuestions.test.ts
 */
import { describe, expect, it } from 'vitest';
import { classifyTemporalQuery } from '../../src/services/temporal/temporalQueryService';

const GOLDEN = [
  { q: 'What did I do today?', intent: 'TODAY_QUERY' },
  { q: 'What happened yesterday?', intent: 'YESTERDAY_QUERY' },
  { q: 'What did I do this week?', intent: 'THIS_WEEK_QUERY' },
  { q: 'What happened this month?', intent: 'THIS_MONTH_QUERY' },
  { q: 'What happened before I met Sol?', intent: 'TEMPORAL_COMPARISON_QUERY' },
  { q: 'What was I doing in 2019?', intent: 'TIMELINE_QUERY' },
  { q: 'Show me last summer', intent: 'TIME_RANGE_QUERY' },
  { q: 'What did I do last week?', intent: 'TIME_RANGE_QUERY' },
] as const;

describe('temporal golden questions', () => {
  const now = new Date('2026-06-16T12:00:00Z');

  for (const { q, intent } of GOLDEN) {
    it(`classifies: ${q}`, () => {
      const result = classifyTemporalQuery(q, now);
      expect(result.intent).toBe(intent);
      if (intent !== 'TEMPORAL_COMPARISON_QUERY') {
        expect(result.window).not.toBeNull();
      }
    });
  }
});
