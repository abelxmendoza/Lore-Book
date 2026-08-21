import { describe, expect, it, vi } from 'vitest';

const { tablesQueried, makeChain } = vi.hoisted(() => {
  const tablesQueried: string[] = [];
  function makeChain(table: string) {
    tablesQueried.push(table);
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.limit = () => chain;
    chain.then = (resolve: (value: unknown) => void) => {
      if (table === 'resolved_events') {
        resolve({ data: [{ title: 'Maya started at MemoVault' }], error: null });
        return;
      }
      resolve({ data: [], error: null });
    };
    return chain;
  }
  return { tablesQueried, makeChain };
});

vi.mock('../../supabaseClient', () => ({
  supabaseAdmin: {
    from: (table: string) => makeChain(table),
  },
}));

import { buildCrossBookIndexForUser, guardCrossBookEntity } from './projectCrossBookGuard';

describe('projectCrossBookGuard lexical harvest', () => {
  it('harvests canonical event titles, not character_timeline_events', async () => {
    tablesQueried.length = 0;
    const index = await buildCrossBookIndexForUser('user-1');
    expect(tablesQueried).toContain('resolved_events');
    expect(tablesQueried).not.toContain('character_timeline_events');
    const result = guardCrossBookEntity(
      'Maya started at MemoVault',
      'working on Maya started at MemoVault',
      index,
    );
    expect(result.allowed).toBe(false);
    expect(result.rejectedAs).toBe('EVENT');
  });
});
