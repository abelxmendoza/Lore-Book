import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config', () => ({
  config: {
    openAiServerCompactionThreshold: undefined as number | undefined,
    openAiPromptCacheRetention: undefined as 'in-memory' | '24h' | undefined,
    openAiUseInputTokenCountApi: true,
  },
}));

const mockCount = vi.fn();

vi.mock('../../src/lib/openai', () => ({
  openai: {
    responses: {
      inputTokens: {
        count: (...args: unknown[]) => mockCount(...args),
      },
    },
  },
}));

import { config } from '../../src/config';
import {
  buildPromptCacheParams,
  buildServerSideCompaction,
  countResponsesInputTokens,
  withResponsesOptimizations,
} from '../../src/lib/openaiPlatformOptimizations';

describe('openaiPlatformOptimizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.openAiServerCompactionThreshold = undefined;
    config.openAiPromptCacheRetention = undefined;
    config.openAiUseInputTokenCountApi = true;
  });

  it('buildPromptCacheParams includes retention when configured', () => {
    config.openAiPromptCacheRetention = '24h';
    expect(buildPromptCacheParams('message-screenshot-analysis-v1')).toEqual({
      prompt_cache_key: 'message-screenshot-analysis-v1',
      prompt_cache_retention: '24h',
    });
  });

  it('buildServerSideCompaction returns threshold config', () => {
    config.openAiServerCompactionThreshold = 200_000;
    expect(buildServerSideCompaction()).toEqual([
      { type: 'compaction', compact_threshold: 200_000 },
    ]);
  });

  it('withResponsesOptimizations attaches cache and compaction', () => {
    config.openAiServerCompactionThreshold = 100_000;
    config.openAiPromptCacheRetention = '24h';

    const params = withResponsesOptimizations(
      { model: 'gpt-5.5', input: 'hello' },
      { sessionId: 'sess-1' },
    );

    expect(params).toMatchObject({
      model: 'gpt-5.5',
      prompt_cache_key: 'chat:sess-1',
      prompt_cache_retention: '24h',
      context_management: [{ type: 'compaction', compact_threshold: 100_000 }],
    });
  });

  it('countResponsesInputTokens returns API count', async () => {
    mockCount.mockResolvedValue({ input_tokens: 4321 });
    const count = await countResponsesInputTokens({ model: 'gpt-4o-mini', input: 'test' });
    expect(count).toBe(4321);
  });

  it('countResponsesInputTokens returns null when disabled', async () => {
    config.openAiUseInputTokenCountApi = false;
    const count = await countResponsesInputTokens({ model: 'gpt-4o-mini', input: 'test' });
    expect(count).toBeNull();
    expect(mockCount).not.toHaveBeenCalled();
  });
});
