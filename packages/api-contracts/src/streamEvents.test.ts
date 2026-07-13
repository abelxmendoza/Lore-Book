import { describe, it, expect } from 'vitest';
import {
  chatStreamEventSchema,
  formatSseDataLine,
  parseChatStreamEvent,
} from './chat/streamEvents';

describe('chat SSE contracts', () => {
  it('accepts metadata / chunk / done / error frames', () => {
    expect(chatStreamEventSchema.safeParse({ type: 'metadata', data: { sessionId: 's1' } }).success).toBe(
      true,
    );
    expect(chatStreamEventSchema.safeParse({ type: 'chunk', content: 'Hello' }).success).toBe(true);
    expect(chatStreamEventSchema.safeParse({ type: 'done' }).success).toBe(true);
    expect(
      chatStreamEventSchema.safeParse({
        type: 'error',
        error: 'failed',
        durability: { userMessage: { persisted: true } },
      }).success,
    ).toBe(true);
  });

  it('rejects unknown event types', () => {
    expect(chatStreamEventSchema.safeParse({ type: 'ping' }).success).toBe(false);
    expect(chatStreamEventSchema.safeParse({ type: 'chunk' }).success).toBe(false); // missing content
  });

  it('round-trips formatSseDataLine + parseChatStreamEvent', () => {
    const line = formatSseDataLine({ type: 'chunk', content: 'hi' });
    expect(line.startsWith('data: ')).toBe(true);
    const body = line.replace(/^data:\s*/, '').trim();
    const event = parseChatStreamEvent(body);
    expect(event).toEqual({ type: 'chunk', content: 'hi' });
  });

  it('returns null for garbage JSON', () => {
    expect(parseChatStreamEvent('not-json')).toBeNull();
    expect(parseChatStreamEvent('')).toBeNull();
  });
});
