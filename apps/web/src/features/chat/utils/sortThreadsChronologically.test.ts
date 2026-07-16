import { describe, it, expect } from 'vitest';
import {
  sortThreadsChronologically,
  threadActivityMs,
} from './sortThreadsChronologically';
import type { ChatThread } from '../hooks/useChatThreads';

function thread(
  id: string,
  updatedAt: string,
  messages: ChatThread['messages'] = []
): ChatThread {
  return { id, title: id, updatedAt, messages };
}

describe('sortThreadsChronologically', () => {
  it('orders newest activity first by updatedAt', () => {
    const sorted = sortThreadsChronologically([
      thread('old', '2026-01-01T00:00:00.000Z'),
      thread('mid', '2026-03-01T00:00:00.000Z'),
      thread('new', '2026-06-01T00:00:00.000Z'),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['new', 'mid', 'old']);
  });

  it('uses a newer last-message timestamp when updatedAt is stale', () => {
    const sorted = sortThreadsChronologically([
      thread('stale-meta', '2026-01-01T00:00:00.000Z', [
        {
          id: 'm1',
          role: 'user',
          content: 'just now',
          timestamp: new Date('2026-07-01T12:00:00.000Z'),
        },
      ]),
      thread('older-chat', '2026-06-01T00:00:00.000Z'),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['stale-meta', 'older-chat']);
    expect(threadActivityMs(sorted[0])).toBe(Date.parse('2026-07-01T12:00:00.000Z'));
  });

  it('keeps a stable order when timestamps match', () => {
    const stamp = '2026-05-01T00:00:00.000Z';
    const sorted = sortThreadsChronologically([
      thread('b', stamp),
      thread('a', stamp),
      thread('c', stamp),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['c', 'b', 'a']);
  });

  it('puts invalid timestamps at the bottom without crashing', () => {
    const sorted = sortThreadsChronologically([
      thread('bad', 'not-a-date'),
      thread('good', '2026-05-01T00:00:00.000Z'),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['good', 'bad']);
  });
});
