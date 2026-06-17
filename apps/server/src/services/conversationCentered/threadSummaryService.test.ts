import { describe, it, expect } from 'vitest';
import {
  isSummaryStale,
  deriveDeterministicSummaries,
  parseSummaryResponse,
  buildIncrementalInput,
  STALENESS_THRESHOLD,
} from './threadSummaryService';
import {
  emptyThreadMetadata,
  mergeThreadMetadata,
  buildContinuityCard,
  type ThreadMetadata,
} from './threadIntelligenceService';

const withSummary = (over: Partial<ThreadMetadata> = {}): ThreadMetadata => ({
  ...emptyThreadMetadata(),
  summary_short: 'a',
  summary_medium: 'b',
  summary_long: 'c',
  summary_message_count: 10,
  message_count: 10,
  ...over,
});

describe('threadSummaryService — staleness', () => {
  it('an empty thread (no messages) is never stale', () => {
    expect(isSummaryStale(emptyThreadMetadata())).toBe(false);
  });

  it('a thread with messages but no summary is stale (never built)', () => {
    expect(isSummaryStale({ ...emptyThreadMetadata(), message_count: 1 })).toBe(true);
  });

  it('is not stale below the threshold', () => {
    const meta = withSummary({ message_count: 10 + STALENESS_THRESHOLD - 1 });
    expect(isSummaryStale(meta)).toBe(false);
  });

  it('becomes stale at the threshold', () => {
    const meta = withSummary({ message_count: 10 + STALENESS_THRESHOLD });
    expect(isSummaryStale(meta)).toBe(true);
  });
});

describe('threadSummaryService — deterministic floor', () => {
  it('returns null summaries for a truly empty thread', () => {
    expect(deriveDeterministicSummaries(emptyThreadMetadata())).toEqual({ short: null, medium: null, long: null });
  });

  it('uses the title for the short summary when present', () => {
    const meta = { ...emptyThreadMetadata(), title: 'Costco With Grandma Rose', people: ['Grandma Rose'], message_count: 3 };
    const s = deriveDeterministicSummaries(meta);
    expect(s.short).toBe('Costco With Grandma Rose');
    expect(s.medium).toContain('Grandma Rose');
  });

  it('derives from people/places when no title', () => {
    const meta = { ...emptyThreadMetadata(), people: ['Juan'], places: ['Costco'], message_count: 2 };
    const s = deriveDeterministicSummaries(meta);
    expect(s.short).toContain('Juan');
    expect(s.short).toContain('Costco');
    expect(s.long).toBeTruthy();
  });

  it('never returns empty when there are messages but no structure', () => {
    const meta = { ...emptyThreadMetadata(), message_count: 5 };
    const s = deriveDeterministicSummaries(meta);
    expect(s.short).toMatch(/5 messages/);
  });
});

describe('threadSummaryService — response parsing', () => {
  it('parses clean JSON', () => {
    expect(parseSummaryResponse('{"short":"s","medium":"m","long":"l"}')).toEqual({ short: 's', medium: 'm', long: 'l' });
  });

  it('parses JSON embedded in prose/fences', () => {
    const raw = 'Here you go:\n```json\n{"short": "s", "long": "l"}\n```';
    expect(parseSummaryResponse(raw)).toEqual({ short: 's', medium: null, long: 'l' });
  });

  it('returns nulls on garbage', () => {
    expect(parseSummaryResponse('not json at all')).toEqual({ short: null, medium: null, long: null });
  });

  it('accepts the summary_* alias keys', () => {
    expect(parseSummaryResponse('{"summary_short":"s","summary_medium":"m"}')).toEqual({ short: 's', medium: 'm', long: null });
  });
});

describe('threadSummaryService — incremental input', () => {
  it('includes the prior summary and only the recent turns', () => {
    const input = buildIncrementalInput('prior recap', [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
    expect(input).toContain('PRIOR SUMMARY');
    expect(input).toContain('prior recap');
    expect(input).toContain('User: hi');
    expect(input).toContain('Assistant: hello');
  });

  it('omits the prior-summary block on a fresh thread', () => {
    const input = buildIncrementalInput(null, [{ role: 'user', content: 'first' }]);
    expect(input).not.toContain('PRIOR SUMMARY');
    expect(input).toContain('User: first');
  });
});

describe('threadIntelligence — extended merge keeps summaries + first_activity', () => {
  it('sets first_activity once and advances last_activity', () => {
    const m1 = mergeThreadMetadata(emptyThreadMetadata(), { people: ['A'], at: '2026-01-01T00:00:00Z' });
    expect(m1.first_activity).toBe('2026-01-01T00:00:00Z');
    const m2 = mergeThreadMetadata(m1, { people: ['B'], at: '2026-01-05T00:00:00Z' });
    expect(m2.first_activity).toBe('2026-01-01T00:00:00Z');
    expect(m2.last_activity).toBe('2026-01-05T00:00:00Z');
    expect(m2.people).toEqual(['A', 'B']);
  });

  it('a folded turn never clobbers existing summaries', () => {
    const base = withSummary({ summary_version: 3 });
    const next = mergeThreadMetadata(base, { people: ['C'], at: '2026-02-01T00:00:00Z' });
    expect(next.summary_short).toBe('a');
    expect(next.summary_version).toBe(3);
    expect(next.summary_message_count).toBe(10);
    expect(next.message_count).toBe(11);
  });

  it('carries a title forward and lets a new title override', () => {
    const m1 = mergeThreadMetadata(emptyThreadMetadata(), { title: 'First', at: '2026-01-01T00:00:00Z' });
    expect(m1.title).toBe('First');
    const m2 = mergeThreadMetadata(m1, { at: '2026-01-02T00:00:00Z' });
    expect(m2.title).toBe('First');
    const m3 = mergeThreadMetadata(m2, { title: 'Renamed', at: '2026-01-03T00:00:00Z' });
    expect(m3.title).toBe('Renamed');
  });
});

describe('threadIntelligence — continuity card surfaces title + summary', () => {
  it('leads with the title and medium summary when present', () => {
    const meta = withSummary({
      title: 'Blue Room Night',
      summary_medium: 'You went out with Daisy to Blue Room.',
      people: ['Daisy'],
      places: ['Blue Room'],
      last_activity: new Date().toISOString(),
    });
    const card = buildContinuityCard(meta);
    expect(card).toContain('Blue Room Night');
    expect(card).toContain('You went out with Daisy');
    expect(card).toContain('People: Daisy');
  });

  it('returns empty when nothing is known', () => {
    expect(buildContinuityCard(emptyThreadMetadata())).toBe('');
  });
});
