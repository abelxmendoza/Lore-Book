import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config', () => ({
  config: { monthlyOpenAiBudgetUsd: 5 },
}));

describe('openaiBudgetService', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.MONTHLY_OPENAI_BUDGET_USD = '5';
  });

  it('reports exhausted when spend meets limit', async () => {
    const mod = await import('../../src/services/openaiBudgetService');
    mod.resetOpenAiBudgetForTests();
    await mod.recordOpenAiTokenUsage({
      model: 'gpt-4o-mini',
      inputTokens: 30_000_000,
      outputTokens: 2_000_000,
    });
    const snapshot = await mod.getOpenAiBudgetSnapshot();
    expect(snapshot.exhausted).toBe(true);
  });
});
