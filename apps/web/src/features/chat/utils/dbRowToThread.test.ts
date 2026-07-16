import { describe, it, expect } from 'vitest';
import { dbRowToThread } from './dbRowToThread';

describe('dbRowToThread', () => {
  it('maps snake_case DB rows with real updated_at', () => {
    const thread = dbRowToThread({
      id: 't1',
      title: 'My chat',
      updated_at: '2026-03-15T10:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      message_count: 4,
      thread_number: 12,
      metadata: { subtitle: 'Planning', dominantEntities: ['Taylor'] },
    });

    expect(thread.id).toBe('t1');
    expect(thread.title).toBe('My chat');
    expect(thread.updatedAt).toBe('2026-03-15T10:00:00Z');
    expect(thread.messageCount).toBe(4);
    expect(thread.threadNumber).toBe(12);
    expect(thread.subtitle).toBe('Planning');
    expect(thread.dominantEntities).toEqual(['Taylor']);
    expect(thread.messages).toEqual([]);
  });

  it('maps camelCase API rows', () => {
    const thread = dbRowToThread({
      id: 't2',
      title: 'API thread',
      updatedAt: '2026-05-01T08:00:00Z',
      messageCount: 1,
      threadNumber: 3,
      subtitle: 'Follow-up',
      dominantEntities: ['Marcus'],
    });

    expect(thread.updatedAt).toBe('2026-05-01T08:00:00Z');
    expect(thread.messageCount).toBe(1);
    expect(thread.threadNumber).toBe(3);
    expect(thread.subtitle).toBe('Follow-up');
    expect(thread.dominantEntities).toEqual(['Marcus']);
  });

  it('falls back through created_at when updated_at is missing', () => {
    const thread = dbRowToThread({
      id: 't3',
      title: 'Draft',
      created_at: '2026-02-01T00:00:00Z',
    });

    expect(thread.updatedAt).toBe('2026-02-01T00:00:00Z');
    expect(thread.title).toBe('Draft');
  });
});
