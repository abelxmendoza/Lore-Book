import { describe, it, expect } from 'vitest';
import {
  runWithMessageCost,
  recordLlmUsage,
  recordEmbeddingCall,
  summarizeMessageCost,
  getMessageCost,
} from '../../src/lib/messageCostTracker';

describe('messageCostTracker', () => {
  it('accumulates LLM calls, tokens and USD within a context', () => {
    const summary = runWithMessageCost({ label: 'chat', userId: 'u1' }, () => {
      recordLlmUsage('gpt-4o-mini', 1000, 500); // 1000*0.15 + 500*0.6 per 1M
      recordLlmUsage('gpt-4o-mini', 0, 0);
      return summarizeMessageCost();
    });
    expect(summary?.llmCalls).toBe(2);
    expect(summary?.inputTokens).toBe(1000);
    expect(summary?.outputTokens).toBe(500);
    // (1000*0.15 + 500*0.6) / 1e6 = 0.00045
    expect(summary?.usd).toBeCloseTo(0.00045, 6);
    expect(summary?.byModel['gpt-4o-mini'].calls).toBe(2);
  });

  it('counts embedding API calls and cache hits separately', () => {
    const summary = runWithMessageCost({ label: 'chat' }, () => {
      recordEmbeddingCall({ cacheHit: true });
      recordEmbeddingCall({ cacheHit: true });
      recordEmbeddingCall({ cacheHit: false, model: 'text-embedding-3-small', tokens: 100 });
      return summarizeMessageCost();
    });
    expect(summary?.embeddingCacheHits).toBe(2);
    expect(summary?.embeddingCalls).toBe(1);
    // 100 * 0.02 / 1e6
    expect(summary?.usd).toBeCloseTo(0.000002, 7);
  });

  it('is a safe no-op outside any context', () => {
    expect(() => recordLlmUsage('gpt-4o', 10, 10)).not.toThrow();
    expect(() => recordEmbeddingCall({ cacheHit: false })).not.toThrow();
    expect(getMessageCost()).toBeUndefined();
    expect(summarizeMessageCost()).toBeUndefined();
  });

  it('reports duration and carries identity metadata', () => {
    const summary = runWithMessageCost({ label: 'chat', userId: 'u9', messageId: 'm9' }, () => {
      recordLlmUsage('gpt-4o', 10, 10);
      return summarizeMessageCost();
    });
    expect(summary?.userId).toBe('u9');
    expect(summary?.messageId).toBe('m9');
    expect(summary?.durationMs).toBeGreaterThanOrEqual(0);
  });
});
