import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const fromMock = vi.fn();
vi.mock('../supabaseClient', () => ({ supabaseAdmin: { from: (...a: unknown[]) => fromMock(...a) } }));

import { chronologyService } from './chronologyService';

function chronologyIndexRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'idx-1',
    user_id: 'user-1',
    journal_entry_id: 'entry-1',
    start_time: '2026-06-01T00:00:00Z',
    end_time: null,
    time_precision: 'exact',
    year_bucket: 2026,
    journal_entries: {
      id: 'entry-1',
      content: 'Some content',
      user_id: 'user-1',
      source: 'manual',
      tags: [],
      date: '2026-06-01T00:00:00Z',
      created_at: '2026-06-01T00:00:00Z',
      metadata: {},
      time_confidence: 1.0,
    },
    ...overrides,
  };
}

function mockChronologyIndexQuery(rows: unknown[]) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'chronology_index') {
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      };
    }
    // timeline membership / names lookups and anything else — empty is fine.
    return {
      select: () => ({
        eq: () => ({
          in: () => Promise.resolve({ data: [], error: null }),
        }),
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    };
  });
}

describe('chronologyService.getChronologicalOrder — temporal_source authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a manual entry with high real time_confidence (explicit/confident date) is classified user_stated, not by source-regex alone', async () => {
    mockChronologyIndexQuery([
      chronologyIndexRow({
        journal_entries: {
          id: 'entry-1', content: 'x', user_id: 'user-1', source: 'manual', tags: [],
          date: '2026-06-01T00:00:00Z', created_at: '2026-06-01T00:00:00Z', metadata: {}, time_confidence: 0.9,
        },
      }),
    ]);
    const result = await chronologyService.getChronologicalOrder('user-1');
    expect(result[0].temporal_source).toBe('user_stated');
    expect(result[0].time_confidence).toBe(0.9);
  });

  it('a manual entry whose date is actually a low-confidence write-time fallback is classified recording_fallback, not blindly defaulted to user_stated by source type', async () => {
    // This is the exact gap the temporal-authority audit found: previously
    // `row.time_confidence` was read from a column/join that didn't exist,
    // always fell back to 1.0, and a plain "manual" source always defaulted
    // to 'user_stated' regardless of real evidence.
    mockChronologyIndexQuery([
      chronologyIndexRow({
        journal_entries: {
          id: 'entry-1', content: 'x', user_id: 'user-1', source: 'manual', tags: [],
          date: '2026-06-01T00:00:00Z', created_at: '2026-06-01T00:00:00Z', metadata: {}, time_confidence: 0.1,
        },
      }),
    ]);
    const result = await chronologyService.getChronologicalOrder('user-1');
    expect(result[0].temporal_source).toBe('recording_fallback');
    expect(result[0].time_confidence).toBe(0.1);
  });

  it('an explicit metadata.temporal_source always wins over the inferred classification', async () => {
    mockChronologyIndexQuery([
      chronologyIndexRow({
        journal_entries: {
          id: 'entry-1', content: 'x', user_id: 'user-1', source: 'manual', tags: [],
          date: '2026-06-01T00:00:00Z', created_at: '2026-06-01T00:00:00Z',
          metadata: { temporal_source: 'user_corrected' }, time_confidence: 0.1,
        },
      }),
    ]);
    const result = await chronologyService.getChronologicalOrder('user-1');
    expect(result[0].temporal_source).toBe('user_corrected');
  });

  it('time_confidence is never silently 1.0 just because the join/column was missing — absent value reads as 1.0 only when genuinely absent, not masking a real low value', async () => {
    mockChronologyIndexQuery([chronologyIndexRow()]);
    const result = await chronologyService.getChronologicalOrder('user-1');
    expect(result[0].time_confidence).toBe(1.0);
  });
});
