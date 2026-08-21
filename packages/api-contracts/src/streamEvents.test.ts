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

  it('preserves non-sensitive generation failure classifiers', () => {
    const event = parseChatStreamEvent(JSON.stringify({
      type: 'error',
      error: 'Saved, but reply failed',
      code: 'openai_circuit_open',
      stage: 'response_generation',
      errorCategory: 'quota',
    }));

    expect(event).toMatchObject({
      type: 'error',
      code: 'openai_circuit_open',
      stage: 'response_generation',
      errorCategory: 'quota',
    });
  });

  it('preserves visible-response discipline fields on done', () => {
    const event = parseChatStreamEvent(JSON.stringify({
      type: 'done',
      verified: true,
      rewritten: true,
      unsupportedCount: 1,
      causalRewriteCount: 1,
      embellishmentRewriteCount: 0,
      epistemicRewriteCount: 1,
      content: 'The user believed jealousy may also have been involved.',
    }));

    expect(event).toMatchObject({
      type: 'done',
      verified: true,
      rewritten: true,
      unsupportedCount: 1,
      causalRewriteCount: 1,
      epistemicRewriteCount: 1,
      content: 'The user believed jealousy may also have been involved.',
    });
  });

  it('returns null for garbage JSON', () => {
    expect(parseChatStreamEvent('not-json')).toBeNull();
    expect(parseChatStreamEvent('')).toBeNull();
  });
});
