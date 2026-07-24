import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolveOpenaiFallbackModel,
  resolveRoute,
} from './modelRouterConfig';
import { ModelRouter, resetModelRouterForTests } from './modelRouter';
import type {
  ChatCompletionParams,
  EmbeddingParams,
  LlmChatResult,
  LlmEmbeddingResult,
  LlmProvider,
  LlmProviderId,
  LlmRoute,
} from './types';

const ENV_KEYS = [
  'LLM_PROVIDER',
  'LLM_DEFAULT_PROVIDER',
  'LLM_CHAT_PROVIDER',
  'LLM_CHAT_MODEL',
  'LLM_EXTRACTION_PROVIDER',
  'LLM_EXTRACTION_MODEL',
  'LLM_NANO_PROVIDER',
  'LLM_NANO_MODEL',
  'LLM_EMBEDDING_PROVIDER',
  'LLM_EMBEDDING_MODEL',
  'LLM_PLANNER_PROVIDER',
  'LLM_PLANNER_MODEL',
  'LLM_FALLBACK_TO_OPENAI',
  'LLM_OLLAMA_BASE_URL',
  'LLM_LOCAL_BASE_URL',
  'LLM_LOCAL_MODEL',
] as const;

const savedEnv: Record<string, string | undefined> = {};

function clearLlmEnv(): void {
  for (const k of ENV_KEYS) {
    delete process.env[k];
  }
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
  }
  clearLlmEnv();
  resetModelRouterForTests(undefined);
});

afterEach(() => {
  clearLlmEnv();
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  resetModelRouterForTests(undefined);
});

describe('resolveRoute (OpenAI default)', () => {
  it('defaults every capability to openai when no LLM_* env is set', () => {
    for (const cap of ['chat', 'extraction', 'nano', 'embedding', 'planner', 'default'] as const) {
      const route = resolveRoute(cap);
      expect(route.provider, cap).toBe('openai');
      expect(route.fallbackToOpenai, cap).toBe(false);
      expect(route.model, cap).toBeTruthy();
    }
  });

  it('uses LLM_PROVIDER as default for all capabilities', () => {
    process.env.LLM_PROVIDER = 'ollama';
    const chat = resolveRoute('chat');
    expect(chat.provider).toBe('ollama');
    expect(chat.fallbackToOpenai).toBe(true);
    expect(chat.baseUrl).toMatch(/11434/);
  });

  it('allows per-capability provider override without changing others', () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_EMBEDDING_PROVIDER = 'ollama';
    process.env.LLM_EMBEDDING_MODEL = 'nomic-embed-text';

    expect(resolveRoute('chat').provider).toBe('openai');
    expect(resolveRoute('extraction').provider).toBe('openai');
    const emb = resolveRoute('embedding');
    expect(emb.provider).toBe('ollama');
    expect(emb.model).toBe('nomic-embed-text');
    expect(emb.fallbackToOpenai).toBe(true);
  });

  it('disables OpenAI fallback when LLM_FALLBACK_TO_OPENAI=false', () => {
    process.env.LLM_EXTRACTION_PROVIDER = 'ollama';
    process.env.LLM_FALLBACK_TO_OPENAI = 'false';
    expect(resolveRoute('extraction').fallbackToOpenai).toBe(false);
  });

  it('parses provider aliases (local → ollama, xai → grok)', () => {
    process.env.LLM_CHAT_PROVIDER = 'local';
    expect(resolveRoute('chat').provider).toBe('ollama');
    process.env.LLM_CHAT_PROVIDER = 'xai';
    expect(resolveRoute('chat').provider).toBe('grok');
  });
});

describe('resolveOpenaiFallbackModel', () => {
  it('keeps OpenAI model ids', () => {
    expect(resolveOpenaiFallbackModel('chat', 'gpt-4o-mini')).toBe('gpt-4o-mini');
    expect(resolveOpenaiFallbackModel('embedding', 'text-embedding-3-small')).toBe(
      'text-embedding-3-small',
    );
  });

  it('drops local model tags so OpenAI never receives them', () => {
    const chat = resolveOpenaiFallbackModel('chat', 'qwen3:32b');
    expect(chat).not.toContain(':');
    expect(chat.startsWith('gpt') || chat.startsWith('o')).toBe(true);

    const emb = resolveOpenaiFallbackModel('embedding', 'nomic-embed-text');
    expect(emb).toMatch(/embedding|text-embedding/);
  });
});

function mockProvider(
  id: LlmProviderId,
  opts: {
    available?: boolean;
    chat?: (params: ChatCompletionParams, route: LlmRoute) => Promise<LlmChatResult>;
    embed?: (params: EmbeddingParams, route: LlmRoute) => Promise<LlmEmbeddingResult>;
  } = {},
): LlmProvider {
  return {
    id,
    isAvailable: () => opts.available ?? true,
    chatCompletion: opts.chat
      ?? (async () => {
        throw new Error(`${id} chat not mocked`);
      }),
    embeddings: opts.embed
      ?? (async () => {
        throw new Error(`${id} embed not mocked`);
      }),
  };
}

describe('ModelRouter fallbacks', () => {
  it('uses primary openai provider when available (no fallback flag)', async () => {
    const openaiChat = vi.fn(async (_p: ChatCompletionParams, route: LlmRoute) => ({
      choices: [{ message: { role: 'assistant', content: 'hi' } }],
      model: route.model,
    }));

    const registry = new Map<LlmProviderId, LlmProvider>([
      ['openai', mockProvider('openai', { chat: openaiChat })],
    ]);
    const router = new ModelRouter(registry);
    process.env.LLM_PROVIDER = 'openai';

    const { result, meta } = await router.chatCompletion('chat', {
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result.choices[0]?.message?.content).toBe('hi');
    expect(meta.usedFallback).toBe(false);
    expect(meta.provider).toBe('openai');
    expect(openaiChat).toHaveBeenCalledOnce();
  });

  it('falls back to OpenAI when local provider fails', async () => {
    process.env.LLM_EXTRACTION_PROVIDER = 'ollama';
    process.env.LLM_FALLBACK_TO_OPENAI = 'true';

    const ollamaChat = vi.fn(async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:11434');
    });
    const openaiChat = vi.fn(async (_p: ChatCompletionParams, route: LlmRoute) => ({
      choices: [{ message: { role: 'assistant', content: 'fallback-ok' } }],
      model: route.model,
    }));

    const registry = new Map<LlmProviderId, LlmProvider>([
      ['ollama', mockProvider('ollama', { chat: ollamaChat })],
      ['openai', mockProvider('openai', { chat: openaiChat })],
    ]);
    const router = new ModelRouter(registry);

    const { result, meta } = await router.chatCompletion('extraction', {
      messages: [{ role: 'user', content: 'extract entities' }],
    });

    expect(result.choices[0]?.message?.content).toBe('fallback-ok');
    expect(meta.usedFallback).toBe(true);
    expect(meta.provider).toBe('openai');
    expect(ollamaChat).toHaveBeenCalledOnce();
    expect(openaiChat).toHaveBeenCalledOnce();
    // Fallback must not forward local model tags
    const fallbackRoute = openaiChat.mock.calls[0][1] as LlmRoute;
    expect(fallbackRoute.provider).toBe('openai');
    expect(fallbackRoute.model).not.toContain(':');
  });

  it('does not fall back when LLM_FALLBACK_TO_OPENAI=false', async () => {
    process.env.LLM_CHAT_PROVIDER = 'ollama';
    process.env.LLM_FALLBACK_TO_OPENAI = 'false';

    const registry = new Map<LlmProviderId, LlmProvider>([
      [
        'ollama',
        mockProvider('ollama', {
          chat: async () => {
            throw new Error('local down');
          },
        }),
      ],
      [
        'openai',
        mockProvider('openai', {
          chat: async () => ({
            choices: [{ message: { content: 'should-not-run' } }],
          }),
        }),
      ],
    ]);
    const router = new ModelRouter(registry);

    await expect(
      router.chatCompletion('chat', { messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/local down/);
  });

  it('falls back on embeddings when local fails', async () => {
    process.env.LLM_EMBEDDING_PROVIDER = 'ollama';

    const registry = new Map<LlmProviderId, LlmProvider>([
      [
        'ollama',
        mockProvider('ollama', {
          embed: async () => {
            throw new Error('ollama embeddings offline');
          },
        }),
      ],
      [
        'openai',
        mockProvider('openai', {
          embed: async (_p, route) => ({
            data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
            model: route.model,
            usage: { total_tokens: 3 },
          }),
        }),
      ],
    ]);
    const router = new ModelRouter(registry);

    const { result, meta } = await router.embeddings('embedding', { input: 'hello world' });
    expect(result.data[0]?.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(meta.usedFallback).toBe(true);
    expect(meta.provider).toBe('openai');
  });

  it('throws when OpenAI itself fails (no infinite fallback)', async () => {
    process.env.LLM_PROVIDER = 'openai';
    const registry = new Map<LlmProviderId, LlmProvider>([
      [
        'openai',
        mockProvider('openai', {
          chat: async () => {
            throw new Error('OpenAI 429');
          },
        }),
      ],
    ]);
    const router = new ModelRouter(registry);
    await expect(
      router.chatCompletion('chat', { messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/OpenAI 429/);
  });
});
