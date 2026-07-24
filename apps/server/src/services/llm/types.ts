/**
 * Provider-agnostic LLM types (Phase 1).
 * Application code should depend on capabilities + ModelRouter, not a vendor.
 */

export type LlmCapability =
  | 'chat'
  | 'extraction'
  | 'nano'
  | 'embedding'
  | 'planner'
  | 'default';

/** Named backends LoreBook can route to. */
export type LlmProviderId =
  | 'openai'
  | 'ollama'
  | 'lmstudio'
  | 'mlx'
  | 'vllm'
  | 'anthropic'
  | 'grok'
  | 'custom';

export type LlmRoute = {
  capability: LlmCapability;
  provider: LlmProviderId;
  model: string;
  /** OpenAI-compatible base URL when provider is local/custom */
  baseUrl?: string;
  /** Whether this route is allowed to fall back to OpenAI on failure */
  fallbackToOpenai: boolean;
};

export type ChatCompletionParams = {
  model?: string;
  messages: Array<{ role: string; content: string; [k: string]: unknown }>;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  response_format?: unknown;
  stream?: boolean;
  [k: string]: unknown;
};

export type EmbeddingParams = {
  model?: string;
  input: string | string[];
  dimensions?: number;
  [k: string]: unknown;
};

export type LlmChatResult = {
  id?: string;
  model?: string;
  choices: Array<{
    index?: number;
    message?: { role?: string; content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  [k: string]: unknown;
};

export type LlmEmbeddingResult = {
  data: Array<{ embedding: number[]; index?: number }>;
  model?: string;
  usage?: { prompt_tokens?: number; total_tokens?: number };
  [k: string]: unknown;
};

export type LlmCallMeta = {
  capability: LlmCapability;
  provider: LlmProviderId;
  model: string;
  usedFallback: boolean;
  durationMs: number;
};

export interface LlmProvider {
  readonly id: LlmProviderId;
  /** True if this provider can serve requests with current env (does not throw). */
  isAvailable(): boolean;
  chatCompletion(params: ChatCompletionParams, route: LlmRoute): Promise<LlmChatResult>;
  embeddings?(params: EmbeddingParams, route: LlmRoute): Promise<LlmEmbeddingResult>;
}
