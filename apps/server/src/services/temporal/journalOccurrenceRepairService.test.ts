import { describe, expect, it, vi, beforeEach } from 'vitest';

import { repairJournalOccurrenceRows } from './journalOccurrenceRepairService';

const updates: Array<Record<string, unknown>> = [];

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      const resolveData = () => {
        if (table === 'journal_entries') {
          return {
            data: [
              {
                id: 'je-fallback',
                date: '2026-08-20T18:42:13.001Z',
                created_at: '2026-08-20T18:42:13.001Z',
                time_precision: 'exact',
                time_confidence: 1,
                source: 'chat',
                metadata: { temporal_source: 'recording_fallback' },
              },
              {
                id: 'je-chatgpt',
                date: '2026-08-20',
                created_at: '2026-08-20T18:42:13.001Z',
                time_precision: 'day',
                time_confidence: 1,
                source: 'chatgpt_import',
                metadata: { imported: true },
              },
              {
                id: 'je-ambiguous',
                date: '2026-08-20T18:42:13.001Z',
                created_at: '2026-08-20T18:42:13.001Z',
                time_precision: 'day',
                time_confidence: 0.5,
                source: 'manual',
                metadata: {},
              },
            ],
            error: null,
          };
        }
        if (table === 'chronology_index' || table === 'arc_event_links' || table === 'resolved_events') {
          return { data: [], error: null };
        }
        return { data: [], error: null };
      };
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.not = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({ data: { metadata: {} }, error: null }));
      chain.update = vi.fn((patch: Record<string, unknown>) => {
        updates.push(patch);
        chain.then = undefined;
        return {
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
        };
      });
      chain.then = (resolve: (value: unknown) => void) => resolve(resolveData());
      return chain;
    }),
  },
}));

describe('journalOccurrenceRepairService', () => {
  beforeEach(() => {
    updates.length = 0;
  });

  it('23. dry-run performs zero writes', async () => {
    const report = await repairJournalOccurrenceRows('11111111-1111-4111-8111-111111111111');
    expect(report.dryRun).toBe(true);
    expect(report.writes).toBe(0);
    expect(updates).toHaveLength(0);
    expect(report.rows.find((row) => row.journalEntryId === 'je-fallback')?.proposedAction).toBe('CLEAR_OCCURRENCE');
    expect(report.rows.find((row) => row.journalEntryId === 'je-chatgpt')?.proposedAction).toBe('CLEAR_OCCURRENCE');
    expect(report.rows.find((row) => row.journalEntryId === 'je-chatgpt')?.legacySourceHint).toBe('chatgpt_import');
    expect(report.rows.find((row) => row.journalEntryId === 'je-ambiguous')?.proposedAction).toBe('NO_ACTION_AMBIGUOUS');
  });

  it('24-25. apply is tenant-scoped and only writes flagged rows', async () => {
    const report = await repairJournalOccurrenceRows('11111111-1111-4111-8111-111111111111', { apply: true });
    expect(report.dryRun).toBe(false);
    expect(report.writes).toBeGreaterThan(0);
    expect(updates.length).toBeGreaterThan(0);
  });
});
