/**
 * Concrete LLM providers. Phase 1:
 * - openai: existing singleton (budget, circuit breaker, responses bridge)
 * - ollama/lmstudio/mlx/vllm/custom: OpenAI-compatible HTTP API
 * - anthropic/grok: stubs that report unavailable → ModelRouter falls back to OpenAI
 */

import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';
import { openai as primaryOpenai, normalizeOpenAIChatParams } from '../../lib/openai';
import type {
  ChatCompletionParams,
  EmbeddingParams,
  LlmChatResult,
  LlmEmbeddingResult,
  LlmProvider,
  LlmProviderId,
  LlmRoute,
} from './types';

const compatibleClients = new Map<string, OpenAI>();

function getCompatibleClient(baseUrl: string, apiKey?: string): OpenAI {
  const key = `${baseUrl}::${apiKey ?? 'none'}`;
  let client = compatibleClients.get(key);
  if (!client) {
    client = new OpenAI({
      apiKey: apiKey || process.env.LLM_LOCAL_API_KEY || 'ollama',
      baseURL: baseUrl.replace(/\/$/, ''),
      maxRetries: 1,
      timeout: Number(process.env.LLM_LOCAL_TIMEOUT_MS ?? 60_000),
    });
    compatibleClients.set(key, client);
  }
  return client;
}

function asChatResult(raw: unknown): LlmChatResult {
  return raw as LlmChatResult;
}

function asEmbeddingResult(raw: unknown): LlmEmbeddingResult {
  return raw as LlmEmbeddingResult;
}

/** Production OpenAI path — reuses global singleton + existing guards. */
export class OpenAiProvider implements LlmProvider {
  readonly id: LlmProviderId = 'openai';

  isAvailable(): boolean {
    return Boolean(config.openAiKey && config.openAiKey.length > 8);
  }

  async chatCompletion(params: ChatCompletionParams, route: LlmRoute): Promise<LlmChatResult> {
    const normalized = normalizeOpenAIChatParams({
      ...params,
      model: params.model || route.model,
      stream: false,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await primaryOpenai.chat.completions.create(normalized as any);
    return asChatResult(result);
  }

  async embeddings(params: EmbeddingParams, route: LlmRoute): Promise<LlmEmbeddingResult> {
    const result = await primaryOpenai.embeddings.create({
      model: params.model || route.model,
      input: params.input,
      ...(params.dimensions != null ? { dimensions: params.dimensions } : {}),
    });
    return asEmbeddingResult(result);
  }
}

/** OpenAI-compatible local/cloud servers (Ollama, LM Studio, vLLM, MLX, custom). */
export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(
    readonly id: LlmProviderId,
    private readonly requireBaseUrl: boolean,
  ) {}

  isAvailable(): boolean {
    if (this.requireBaseUrl) {
      // base URL presence is checked at call time via route.baseUrl
      return true;
    }
    return true;
  }

  async chatCompletion(params: ChatCompletionParams, route: LlmRoute): Promise<LlmChatResult> {
    if (!route.baseUrl) {
      throw new Error(`Provider ${this.id} requires a base URL (set LLM_*_BASE_URL)`);
    }
    const client = getCompatibleClient(route.baseUrl);
    const normalized = normalizeOpenAIChatParams({
      ...params,
      model: params.model || route.model,
      stream: false,
    });
    // Local servers often reject response_format / max_completion_tokens quirks — strip gently
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = { ...normalized };
    if (body.max_completion_tokens != null && body.max_tokens == null) {
      body.max_tokens = body.max_completion_tokens;
      delete body.max_completion_tokens;
    }
    const result = await client.chat.completions.create(body);
    return asChatResult(result);
  }

  async embeddings(params: EmbeddingParams, route: LlmRoute): Promise<LlmEmbeddingResult> {
    if (!route.baseUrl) {
      throw new Error(`Provider ${this.id} requires a base URL for embeddings`);
    }
    const client = getCompatibleClient(route.baseUrl);
    const result = await client.embeddings.create({
      model: params.model || route.model,
      input: params.input,
    });
    return asEmbeddingResult(result);
  }
}

/** Stub — not implemented in Phase 1; router falls back to OpenAI. */
export class StubCloudProvider implements LlmProvider {
  constructor(readonly id: LlmProviderId) {}

  isAvailable(): boolean {
    return false;
  }

  async chatCompletion(): Promise<LlmChatResult> {
    throw new Error(`Provider ${this.id} is not implemented yet (Phase 1). Use OpenAI or a local OpenAI-compatible server.`);
  }

  async embeddings(): Promise<LlmEmbeddingResult> {
    throw new Error(`Provider ${this.id} embeddings not implemented yet.`);
  }
}

export function buildProviderRegistry(): Map<LlmProviderId, LlmProvider> {
  const map = new Map<LlmProviderId, LlmProvider>();
  map.set('openai', new OpenAiProvider());
  map.set('ollama', new OpenAiCompatibleProvider('ollama', true));
  map.set('lmstudio', new OpenAiCompatibleProvider('lmstudio', true));
  map.set('mlx', new OpenAiCompatibleProvider('mlx', true));
  map.set('vllm', new OpenAiCompatibleProvider('vllm', true));
  map.set('custom', new OpenAiCompatibleProvider('custom', true));
  map.set('anthropic', new StubCloudProvider('anthropic'));
  map.set('grok', new StubCloudProvider('grok'));
  return map;
}

export function logProviderInit(providers: Map<LlmProviderId, LlmProvider>): void {
  const openaiOk = providers.get('openai')?.isAvailable() ?? false;
  logger.info(
    {
      openaiConfigured: openaiOk,
      localBaseUrls: {
        ollama: process.env.LLM_OLLAMA_BASE_URL ?? process.env.LLM_LOCAL_BASE_URL ?? 'http://127.0.0.1:11434/v1',
        lmstudio: process.env.LLM_LMSTUDIO_BASE_URL ?? 'http://127.0.0.1:1234/v1',
      },
    },
    'llm.providers.ready',
  );
}
