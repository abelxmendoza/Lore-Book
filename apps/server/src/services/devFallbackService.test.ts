import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';

import { writeFallbackToOpenStream } from './devFallbackService';

function mockResponse(): Response & { writes: string[] } {
  const writes: string[] = [];
  return {
    writes,
    write: vi.fn((chunk: string) => {
      writes.push(chunk);
      return true;
    }),
    end: vi.fn(),
  } as unknown as Response & { writes: string[] };
}

function parseFrames(writes: string[]): Array<{ type: string; data?: unknown }> {
  return writes
    .join('')
    .split('\n\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line.replace(/^data: /, '')));
}

describe('writeFallbackToOpenStream — persistence confirmation', () => {
  it('emits a metadata frame reporting the user message as saved when a persisted id is provided', () => {
    const res = mockResponse();

    writeFallbackToOpenStream(res, 'hello', 'OpenAI circuit breaker open — retry after 67s', 'msg-123');

    const frames = parseFrames(res.writes);
    const metadataFrame = frames.find((f) => f.type === 'metadata');
    expect(metadataFrame).toBeDefined();
    expect((metadataFrame as any).data.persistence.user).toEqual({
      saved: true,
      id: 'msg-123',
      role: 'user',
    });

    // chunk + done must still follow, unchanged.
    expect(frames.some((f) => f.type === 'chunk')).toBe(true);
    expect(frames.some((f) => f.type === 'done')).toBe(true);
    expect(res.end).toHaveBeenCalled();
  });

  it('never reports a false "not persisted" when no id is available (message truly unsaved)', () => {
    const res = mockResponse();

    writeFallbackToOpenStream(res, 'hello', 'OpenAI circuit breaker open — retry after 67s');

    const frames = parseFrames(res.writes);
    const metadataFrame = frames.find((f) => f.type === 'metadata') as any;
    expect(metadataFrame.data.persistence.user.saved).toBe(false);
    expect(metadataFrame.data.persistence.user.error).toBe('user_message_not_persisted');
  });
});
