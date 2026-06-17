import { describe, it, expect } from 'vitest';
import { classifyTemporalQuery, occurredInWindow } from '../../src/services/temporal/temporalQueryService';

describe('temporalQueryService', () => {
  const now = new Date('2026-06-17T15:00:00.000Z');

  it('classifies TODAY_QUERY', () => {
    const r = classifyTemporalQuery('What did I do today?', now);
    expect(r.intent).toBe('TODAY_QUERY');
    expect(r.window?.label).toBe('today');
  });

  it('classifies YESTERDAY_QUERY', () => {
    const r = classifyTemporalQuery('What happened yesterday?', now);
    expect(r.intent).toBe('YESTERDAY_QUERY');
    expect(r.window?.label).toBe('yesterday');
  });

  it('classifies TIMELINE_QUERY for month references', () => {
    const r = classifyTemporalQuery('What was I doing in May?', now);
    expect(r.intent).toBe('TIMELINE_QUERY');
    expect(r.window).not.toBeNull();
  });

  it('occurredInWindow respects bounds', () => {
    const r = classifyTemporalQuery('What did I do today?', now);
    expect(r.window).not.toBeNull();
    expect(occurredInWindow('2026-06-17T10:00:00.000Z', r.window)).toBe(true);
    expect(occurredInWindow('2026-06-10T10:00:00.000Z', r.window)).toBe(false);
  });
});
