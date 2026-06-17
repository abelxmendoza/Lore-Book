import { describe, it, expect } from 'vitest';
import { mapDbMessageRow } from './mapDbMessageRow';

describe('mapDbMessageRow', () => {
  it('hoists mentionedEntities from durable metadata onto the Message', () => {
    const message = mapDbMessageRow({
      id: 'asst-db-1',
      role: 'assistant',
      content: 'That sounds meaningful.',
      created_at: '2026-06-17T12:00:00.000Z',
      metadata: {
        saved_from_stream: true,
        stream_status: 'complete',
        mentionedEntities: [
          { id: 'c1', name: 'Tía Maria', type: 'character' },
          { id: 'l1', name: 'San Diego', type: 'location' },
        ],
      },
    });

    expect(message.mentionedEntities).toEqual([
      { id: 'c1', name: 'Tía Maria', type: 'character' },
      { id: 'l1', name: 'San Diego', type: 'location' },
    ]);
    expect(message.metadata?.mentionedEntities).toBeDefined();
  });

  it('omits mentionedEntities when metadata has none', () => {
    const message = mapDbMessageRow({
      id: 'asst-db-2',
      role: 'assistant',
      content: 'Hello',
      created_at: '2026-06-17T12:00:00.000Z',
      metadata: { saved_from_stream: true },
    });

    expect(message.mentionedEntities).toBeUndefined();
  });
});
