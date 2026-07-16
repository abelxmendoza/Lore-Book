import { describe, it, expect } from 'vitest';
import { dbRowToThread } from './dbRowToThread';

describe('dbRowToThread', () => {
  it('reads camelCase updatedAt from the conversation API', () => {
    const row = dbRowToThread({
      id: '1',
      title: 'Hello',
      updatedAt: '2026-07-01T12:00:00.000Z',
      message_count: 4,
      thread_number: 12,
    });
    expect(row.updatedAt).toBe('2026-07-01T12:00:00.000Z');
    expect(row.messageCount).toBe(4);
    expect(row.threadNumber).toBe(12);
  });

  it('still accepts snake_case rows', () => {
    const row = dbRowToThread({
      id: '2',
      title: 'Legacy',
      updated_at: '2026-06-01T00:00:00.000Z',
      messageCount: 1,
      threadNumber: 3,
    });
    expect(row.updatedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(row.messageCount).toBe(1);
    expect(row.threadNumber).toBe(3);
  });

  it('does not invent a fresh timestamp when the server provided updatedAt', () => {
    const before = Date.now();
    const row = dbRowToThread({
      id: '3',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
    expect(row.updatedAt).toBe('2025-01-01T00:00:00.000Z');
    expect(new Date(row.updatedAt).getTime()).toBeLessThan(before);
  });
});
