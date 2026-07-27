import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

const { getThreadsForEntityMock } = vi.hoisted(() => ({
  getThreadsForEntityMock: vi.fn(),
}));

vi.mock('../conversationCentered/entityConversationLinkService', () => ({
  entityConversationLinkService: {
    getThreadsForEntity: getThreadsForEntityMock,
  },
}));

type Row = {
  id: string;
  content: string;
  created_at: string;
  session_id: string;
  metadata?: unknown;
};

/**
 * Each query in loadCharacterChatMentions ends in `.limit(n)`, so a queue of
 * results — consumed in call order — is enough to stub every query shape
 * (`.eq().eq().in().order().limit()` and `.eq().eq().ilike().order().limit()`)
 * without hand-nesting a shape per branch.
 */
function mockChatMessagesQueue(resultsInOrder: Row[][]) {
  const queue = [...resultsInOrder];
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    ilike: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: queue.shift() ?? [], error: null }),
  };
  return vi.fn(() => chain);
}

describe('loadCharacterChatMentions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes mentions from every linked thread, not just the first 8', async () => {
    const links = Array.from({ length: 10 }, (_, i) => ({
      sessionId: `session-${i + 1}`,
      sessionTitle: `Thread ${i + 1}`,
      entityType: 'character' as const,
      entityId: 'char-1',
      linkKind: 'mention' as const,
      mentionCount: 1,
      firstLinkedAt: new Date(2024, 0, i + 1).toISOString(),
      lastLinkedAt: new Date(2024, 0, i + 1).toISOString(),
    }));
    getThreadsForEntityMock.mockResolvedValue(links);

    const threadScopedRows: Row[] = links.map((l, i) => ({
      id: `msg-${i + 1}`,
      content: `Talked about Jamie in thread ${i + 1}`,
      created_at: new Date(2024, 0, i + 1).toISOString(),
      session_id: l.sessionId,
      metadata: { entity_ids: ['char-1'] },
    }));

    const { supabaseAdmin } = await import('../supabaseClient');
    (supabaseAdmin as any).from = mockChatMessagesQueue([threadScopedRows, []]);

    const { loadCharacterChatMentions } = await import('./characterChatMentions');
    const mentions = await loadCharacterChatMentions('user-1', 'char-1', 'Jamie');

    expect(mentions).toHaveLength(10);
    // The 9th and 10th threads would have been dropped by the old .slice(0, 8) cap.
    expect(mentions.some((m) => m.sessionId === 'session-9')).toBe(true);
    expect(mentions.some((m) => m.sessionId === 'session-10')).toBe(true);
  });

  it('matches a mention by alias even when the primary name is absent', async () => {
    getThreadsForEntityMock.mockResolvedValue([]);

    const aliasRow: Row[] = [
      {
        id: 'msg-alias-1',
        content: 'Grabbed coffee with Jimmy earlier',
        created_at: new Date(2024, 1, 1).toISOString(),
        session_id: 'session-alias',
        metadata: {},
      },
    ];

    const { supabaseAdmin } = await import('../supabaseClient');
    // No linked threads → only the name/alias sweep runs: one call for "Jamie" (no match), one for "Jimmy".
    (supabaseAdmin as any).from = mockChatMessagesQueue([[], aliasRow]);

    const { loadCharacterChatMentions } = await import('./characterChatMentions');
    const mentions = await loadCharacterChatMentions('user-1', 'char-1', 'Jamie', ['Jimmy']);

    expect(mentions).toHaveLength(1);
    expect(mentions[0].messageId).toBe('msg-alias-1');
  });

  it('caps the returned list at a generous ceiling without erroring on very chatty characters', async () => {
    getThreadsForEntityMock.mockResolvedValue([
      { sessionId: 'session-1', sessionTitle: 'Big thread', entityType: 'character', entityId: 'char-1', linkKind: 'mention', mentionCount: 200, firstLinkedAt: '2024-01-01', lastLinkedAt: '2024-01-01' },
    ]);

    const manyRows: Row[] = Array.from({ length: 250 }, (_, i) => ({
      id: `msg-${i + 1}`,
      content: 'Mentioned Jamie again',
      created_at: new Date(2024, 0, 1, 0, i).toISOString(),
      session_id: 'session-1',
      metadata: { entity_ids: ['char-1'] },
    }));

    const { supabaseAdmin } = await import('../supabaseClient');
    (supabaseAdmin as any).from = mockChatMessagesQueue([manyRows, []]);

    const { loadCharacterChatMentions } = await import('./characterChatMentions');
    const mentions = await loadCharacterChatMentions('user-1', 'char-1', 'Jamie');

    expect(mentions.length).toBe(200);
  });

  it('rejects short-name substring false positives without word boundaries', async () => {
    getThreadsForEntityMock.mockResolvedValue([]);

    const falsePositive: Row[] = [
      {
        id: 'msg-ann',
        content: 'Annual review at Vanguard Robotics went well',
        created_at: new Date(2024, 1, 1).toISOString(),
        session_id: 'session-ann',
        metadata: {},
      },
    ];
    const realHit: Row[] = [
      {
        id: 'msg-ann-real',
        content: 'Had lunch with Ann yesterday',
        created_at: new Date(2024, 1, 2).toISOString(),
        session_id: 'session-ann-2',
        metadata: {},
      },
    ];

    const { supabaseAdmin } = await import('../supabaseClient');
    // name sweep for "Ann" then title lookup for missing titles
    (supabaseAdmin as any).from = mockChatMessagesQueue([falsePositive.concat(realHit), []]);

    const { loadCharacterChatMentions } = await import('./characterChatMentions');
    const mentions = await loadCharacterChatMentions('user-1', 'char-ann', 'Ann');

    expect(mentions.map((m) => m.messageId)).toEqual(['msg-ann-real']);
  });
});
