import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('buildOpenAiPolicySnapshot', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_RESPONSE_CHAINING = 'false';
    process.env.OPENAI_CONVERSATIONS_API = 'false';
    process.env.ENABLE_SHADOW_EXTRACTION = 'false';
    process.env.ENABLE_MERGED_EXTRACTION = 'true';
    process.env.ENABLE_ENGINE_SCHEDULER = 'false';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('reports recommended manual state when platform flags are off', async () => {
    const { buildOpenAiPolicySnapshot } = await import('../../src/config/openaiPolicy');
    const snapshot = buildOpenAiPolicySnapshot();

    expect(snapshot.conversationState).toBe('manual_supabase');
    expect(snapshot.storeAtOpenAi).toBe(false);
    expect(snapshot.policy).toBe('recommended_manual_state');
    expect(snapshot.platformOptIn.responseChaining).toBe(false);
    expect(snapshot.costGuards.shadowExtraction).toBe(false);
    expect(snapshot.costGuards.mergedExtraction).toBe(true);
  });

  it('includes ModelRouter routes defaulting to openai', async () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_DEFAULT_PROVIDER;
    delete process.env.LLM_EXTRACTION_PROVIDER;
    const { buildOpenAiPolicySnapshot } = await import('../../src/config/openaiPolicy');
    const snapshot = buildOpenAiPolicySnapshot();

    expect(snapshot.modelRouter.fallbackToOpenai).toBe(true);
    expect(snapshot.modelRouter.routes?.extraction?.provider).toBe('openai');
    expect(snapshot.modelRouter.routes?.chat?.provider).toBe('openai');
    expect(snapshot.modelRouter.routes?.embedding?.provider).toBe('openai');
  });
});
