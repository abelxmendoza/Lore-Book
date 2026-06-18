/**
 * Integration: keyword lexical rescan over a (mocked) corpus of chat + journal
 * episodes. Verifies keyword normalization, episode scanning across both
 * sources, and hit extraction — without the promotion side-effects (promote:false).
 *
 * Complements `keywordLexicalRescan.test.ts` (empty/stop-word handling) with the
 * actual scan path against controlled episode data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { keywordLexicalRescanService } from '../../src/services/conversationCentered/keywordLexicalRescanService';

/** Minimal builder matching `.select().eq().order().limit()` → { data }. */
function selectChain(rows: unknown[]) {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = () => b;
  b.order = () => b;
  b.limit = async () => ({ data: rows, error: null });
  return b;
}

beforeEach(() => {
  fromMock.mockReset();
  fromMock.mockImplementation((table: string) => {
    if (table === 'journal_entries') {
      return selectChain([
        { id: 'j1', content: 'I love robotics and my cousin Marcus came over.', date: '2024-01-01' },
      ]);
    }
    if (table === 'chat_messages') {
      return selectChain([
        { id: 'c1', content: 'Robotics class was great today.', role: 'user', session_id: 's1', created_at: '2024-01-02' },
      ]);
    }
    return selectChain([]);
  });
});

describe('keywordLexicalRescanService (scan path)', () => {
  it('scans chat + journal episodes and surfaces keyword hits', async () => {
    const summary = await keywordLexicalRescanService.rescan('user-1', ['robotics'], { promote: false });

    expect(summary.keywords).toContain('robotics');
    expect(summary.scannedJournals).toBe(1);
    expect(summary.scannedMessages).toBe(1);
    expect(summary.hitCount).toBe(2); // one journal + one chat episode match
    expect(summary.hits.every((h) => h.keyword === 'robotics')).toBe(true);
    expect(summary.hits.every((h) => /robotics/i.test(h.excerpt))).toBe(true);
    expect(summary.hits.map((h) => h.source).sort()).toEqual(['chat', 'journal']);
  });

  it('normalizes and de-duplicates keywords (case-insensitive)', async () => {
    const summary = await keywordLexicalRescanService.rescan(
      'user-1',
      ['Robotics', 'robotics', 'ROBOTICS'],
      { promote: false }
    );
    expect(summary.keywords).toEqual(['robotics']);
  });

  it('returns an empty summary when no episodes match', async () => {
    const summary = await keywordLexicalRescanService.rescan('user-1', ['kubernetes'], { promote: false });
    expect(summary.hitCount).toBe(0);
    expect(summary.hits).toEqual([]);
    // Episodes were still scanned even though nothing matched.
    expect(summary.scannedJournals + summary.scannedMessages).toBe(2);
  });
});
