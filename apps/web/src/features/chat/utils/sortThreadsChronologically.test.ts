import { describe, it, expect } from 'vitest';
import {
  sortThreadsChronologically,
  sortThreadsByActivity,
  threadActivityMs,
} from './sortThreadsChronologically';
import type { ChatThread } from '../hooks/useChatThreads';

function thread(
  id: string,
  updatedAt: string,
  messages: ChatThread['messages'] = []
): ChatThread {
  return { id, title: 'Test', messages, updatedAt };
}

describe('threadActivityMs', () => {
  it('uses updatedAt when there are no messages', () => {
    expect(threadActivityMs({ updatedAt: '2026-06-01T12:00:00Z' })).toBe(
      Date.parse('2026-06-01T12:00:00Z')
    );
  });

  it('prefers the latest message timestamp over updatedAt', () => {
    const ms = threadActivityMs({
      updatedAt: '2026-06-01T00:00:00Z',
      messages: [
        { id: 'm1', role: 'user', content: 'hi', timestamp: new Date('2026-06-02T00:00:00Z') },
      ],
    });
    expect(ms).toBe(Date.parse('2026-06-02T00:00:00Z'));
  });
});

describe('sortThreadsChronologically', () => {
  it('orders newest activity first', () => {
    const threads = [
      thread('older', '2026-01-01T00:00:00Z'),
      thread('newer', '2026-06-01T00:00:00Z'),
    ];
    expect(sortThreadsChronologically(threads).map((t) => t.id)).toEqual(['newer', 'older']);
  });

  it('uses message timestamps when they are fresher than updatedAt', () => {
    const threads = [
      thread('a', '2026-06-01T00:00:00Z', [
        { id: 'm1', role: 'user', content: 'hi', timestamp: new Date('2026-06-03T00:00:00Z') },
      ]),
      thread('b', '2026-06-02T00:00:00Z'),
    ];
    expect(sortThreadsChronologically(threads).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('stable tie-breaks on id when activity is equal', () => {
    const ts = '2026-06-01T00:00:00Z';
    const threads = [thread('a', ts), thread('b', ts)];
    expect(sortThreadsChronologically(threads).map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('sortThreadsByActivity', () => {
  it('is an alias with the same ordering semantics', () => {
    const threads = [
      thread('older', '2026-01-01T00:00:00Z'),
      thread('newer', '2026-06-01T00:00:00Z'),
    ];
    expect(sortThreadsByActivity(threads).map((t) => t.id)).toEqual(['newer', 'older']);
  });
});
