import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock('./threadContentService', () => ({
  loadThreadMessages: vi.fn(),
  isThreadProtected: vi.fn(),
}));

import { findReusableEmptyDraft } from './threadDedupeService';

type CountResult = { count: number | null };

function queueTable(handlers: Record<string, () => Promise<unknown> | unknown>) {
  fromMock.mockImplementation((table: string) => {
    const handler = handlers[table];
    if (!handler) {
      throw new Error(`Unexpected table: ${table}`);
    }
    return handler();
  });
}

function selectChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of ['select', 'eq', 'order', 'limit', 'in', 'update', 'delete', 'insert']) {
    chain[method] = vi.fn(self);
  }
  // terminal thenable
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

describe('findReusableEmptyDraft', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('skips generic drafts that already have chat_messages', async () => {
    const sessions = [
      {
        id: 'mega-thread',
        title: 'Draft',
        metadata: {},
        updated_at: '2026-07-01T00:00:00Z',
      },
      {
        id: 'true-empty',
        title: 'New chat',
        metadata: {},
        updated_at: '2026-06-01T00:00:00Z',
      },
    ];

    let chatCountCalls = 0;
    let convoCountCalls = 0;

    queueTable({
      conversation_sessions: () => selectChain({ data: sessions, error: null }),
      chat_messages: () => {
        chatCountCalls += 1;
        const count: CountResult =
          chatCountCalls === 1 ? { count: 80 } : { count: 0 };
        return selectChain(count);
      },
      conversation_messages: () => {
        convoCountCalls += 1;
        return selectChain({ count: 0 });
      },
    });

    const reused = await findReusableEmptyDraft('user-1');
    expect(reused).toBe('true-empty');
    expect(chatCountCalls).toBe(2);
    expect(convoCountCalls).toBe(1);
  });

  it('returns null when every recent draft has durable chat', async () => {
    queueTable({
      conversation_sessions: () =>
        selectChain({
          data: [
            {
              id: 'a',
              title: 'Draft',
              metadata: {},
              updated_at: '2026-07-01T00:00:00Z',
            },
          ],
          error: null,
        }),
      chat_messages: () => selectChain({ count: 3 }),
      conversation_messages: () => selectChain({ count: 0 }),
    });

    await expect(findReusableEmptyDraft('user-1')).resolves.toBeNull();
  });
});
