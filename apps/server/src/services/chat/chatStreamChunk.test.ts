import { describe, expect, it } from 'vitest';

import { parseChatCompletionStreamChunk } from './chatStreamChunk';
import type { LorekeeperChatStreamChunk } from './openaiChatStreamAdapter';

describe('parseChatCompletionStreamChunk', () => {
  it('extracts content deltas from standard chunks', () => {
    const chunk: LorekeeperChatStreamChunk = {
      choices: [{ delta: { content: 'Hello' } }],
    };
    expect(parseChatCompletionStreamChunk(chunk)).toEqual({
      contentDelta: 'Hello',
      usage: null,
    });
  });

  it('ignores empty-string deltas', () => {
    const chunk: LorekeeperChatStreamChunk = {
      choices: [{ delta: { content: '' } }],
    };
    expect(parseChatCompletionStreamChunk(chunk).contentDelta).toBeNull();
  });

  it('handles usage-only final chunk with empty choices (OpenAI include_usage)', () => {
    const chunk: LorekeeperChatStreamChunk = {
      choices: [],
      usage: {
        prompt_tokens: 36,
        completion_tokens: 298,
        total_tokens: 334,
      },
    };
    expect(parseChatCompletionStreamChunk(chunk)).toEqual({
      contentDelta: null,
      usage: {
        prompt_tokens: 36,
        completion_tokens: 298,
        total_tokens: 334,
      },
    });
  });

  it('handles missing choices array safely', () => {
    const chunk = { choices: [] } as LorekeeperChatStreamChunk;
    expect(parseChatCompletionStreamChunk(chunk)).toEqual({
      contentDelta: null,
      usage: null,
    });
  });
});
