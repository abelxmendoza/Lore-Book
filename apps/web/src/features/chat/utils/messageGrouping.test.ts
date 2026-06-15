import { describe, expect, it } from 'vitest';

import type { Message } from '../message/ChatMessage';

import { groupMessagesByDate } from './messageGrouping';

describe('groupMessagesByDate', () => {
  it('groups messages even when persisted timestamps are strings or invalid', () => {
    const messages = [
      {
        id: 'string-date',
        role: 'user',
        content: 'restored',
        timestamp: '2026-06-15T12:00:00.000Z' as unknown as Date,
      },
      {
        id: 'bad-date',
        role: 'assistant',
        content: 'fallback',
        timestamp: 'not-a-date' as unknown as Date,
      },
    ] satisfies Message[];

    const groups = groupMessagesByDate(messages);

    expect(groups.flatMap((group) => group.messages.map((message) => message.id))).toEqual([
      'string-date',
      'bad-date',
    ]);
  });
});
