/**
 * Environment → per-capability provider/model routes.
 *
 * Defaults preserve today's OpenAI behavior:
 *   chat/extraction/nano/embedding/planner → openai + existing OPENAI_* model env vars
 *
 * Overrides (optional):
 *   LLM_DEFAULT_PROVIDER / LLM_PROVIDER
 *   LLM_CHAT_PROVIDER, LLM_CHAT_MODEL
 *   LLM_EXTRACTION_PROVIDER, LLM_EXTRACTION_MODEL
 *   LLM_NANO_PROVIDER, LLM_NANO_MODEL
 *   LLM_EMBEDDING_PROVIDER, LLM_EMBEDDING_MODEL
 *   LLM_PLANNER_PROVIDER, LLM_PLANNER_MODEL
 *   LLM_LOCAL_BASE_URL / LLM_OLLAMA_BASE_URL / LLM_LMSTUDIO_BASE_URL / LLM_VLLM_BASE_URL / LLM_MLX_BASE_URL
 *   LLM_FALLBACK_TO_OPENAI=true|false (default true)
 */

import { config } from '../../config';
import type { LlmCapability, LlmProviderId, LlmRoute } from './types';

const PROVIDER_IDS: LlmProviderId[] = [
  'openai',
  'ollama',
  'lmstudio',
  'mlx',
  'vllm',
  'anthropic',
  'grok',
  'custom',
];

function parseProvider(raw: string | undefined, fallback: LlmProviderId): LlmProviderId {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return fallback;
  if ((PROVIDER_IDS as string[]).includes(v)) return v as LlmProviderId;
  // Common aliases
  if (v === 'local' || v === 'openai-compatible') return 'ollama';
  if (v === 'lm-studio' || v === 'lm_studio') return 'lmstudio';
  if (v === 'xai') return 'grok';
  return fallback;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v != null && String(v).trim() !== '' ? String(v).trim() : undefined;
}

function boolEnv(name: string, defaultValue: boolean): boolean {
  const v = env(name);
  if (v == null) return defaultValue;
  if (/^(0|false|no|off)$/i.test(v)) return false;
  if (/^(1|true|yes|on)$/i.test(v)) return true;
  return defaultValue;
}

export function defaultProviderId(): LlmProviderId {
  return parseProvider(env('LLM_DEFAULT_PROVIDER') ?? env('LLM_PROVIDER'), 'openai');
}

export function fallbackToOpenaiEnabled(): boolean {
  return boolEnv('LLM_FALLBACK_TO_OPENAI', true);
}

/** Base URL for OpenAI-compatible local servers. */
export function baseUrlForProvider(provider: LlmProviderId): string | undefined {
  switch (provider) {
    case 'ollama':
      return env('LLM_OLLAMA_BASE_URL') ?? env('LLM_LOCAL_BASE_URL') ?? 'http://127.0.0.1:11434/v1';
    case 'lmstudio':
      return env('LLM_LMSTUDIO_BASE_URL') ?? env('LLM_LOCAL_BASE_URL') ?? 'http://127.0.0.1:1234/v1';
    case 'vllm':
      return env('LLM_VLLM_BASE_URL') ?? env('LLM_LOCAL_BASE_URL');
    case 'mlx':
      return env('LLM_MLX_BASE_URL') ?? env('LLM_LOCAL_BASE_URL') ?? 'http://127.0.0.1:8080/v1';
    case 'custom':
      return env('LLM_CUSTOM_BASE_URL') ?? env('LLM_LOCAL_BASE_URL');
    case 'openai':
      return env('OPENAI_BASE_URL'); // optional proxy
    case 'anthropic':
    case 'grok':
      return undefined;
    default:
      return env('LLM_LOCAL_BASE_URL');
  }
}

function openaiDefaultModel(capability: LlmCapability): string {
  switch (capability) {
    case 'chat':
      return config.chatModel;
    case 'extraction':
      return config.extractionModel;
    case 'nano':
      return config.nanoModel;
    case 'embedding':
      return config.embeddingModel;
    case 'planner':
      return config.chatModel;
    case 'default':
    default:
      return config.defaultModel;
  }
}

function localDefaultModel(capability: LlmCapability): string {
  switch (capability) {
    case 'embedding':
      return env('LLM_LOCAL_EMBEDDING_MODEL') ?? 'nomic-embed-text';
    case 'extraction':
    case 'nano':
      return env('LLM_LOCAL_EXTRACTION_MODEL') ?? env('LLM_LOCAL_MODEL') ?? 'qwen2.5:7b';
    case 'chat':
    case 'planner':
    default:
      return env('LLM_LOCAL_CHAT_MODEL') ?? env('LLM_LOCAL_MODEL') ?? 'qwen2.5:14b';
  }
}

function capabilityProvider(capability: LlmCapability, defaultProv: LlmProviderId): LlmProviderId {
  const key =
    capability === 'chat'
      ? 'LLM_CHAT_PROVIDER'
      : capability === 'extraction'
        ? 'LLM_EXTRACTION_PROVIDER'
        : capability === 'nano'
          ? 'LLM_NANO_PROVIDER'
          : capability === 'embedding'
            ? 'LLM_EMBEDDING_PROVIDER'
            : capability === 'planner'
              ? 'LLM_PLANNER_PROVIDER'
              : 'LLM_DEFAULT_PROVIDER';
  return parseProvider(env(key), defaultProv);
}

function capabilityModel(capability: LlmCapability, provider: LlmProviderId): string {
  const key =
    capability === 'chat'
      ? 'LLM_CHAT_MODEL'
      : capability === 'extraction'
        ? 'LLM_EXTRACTION_MODEL'
        : capability === 'nano'
          ? 'LLM_NANO_MODEL'
          : capability === 'embedding'
            ? 'LLM_EMBEDDING_MODEL'
            : capability === 'planner'
              ? 'LLM_PLANNER_MODEL'
              : undefined;
  const override = key ? env(key) : undefined;
  if (override) return override;
  if (provider === 'openai') return openaiDefaultModel(capability);
  return localDefaultModel(capability);
}

export function resolveRoute(capability: LlmCapability): LlmRoute {
  const defaultProv = defaultProviderId();
  const provider = capabilityProvider(capability, defaultProv);
  const model = capabilityModel(capability, provider);
  const baseUrl = baseUrlForProvider(provider);
  // Only non-OpenAI primaries may fall back; OpenAI is the safety net itself.
  const fallbackToOpenai = fallbackToOpenaiEnabled() && provider !== 'openai';

  return {
    capability,
    provider,
    model,
    baseUrl,
    fallbackToOpenai,
  };
}

/**
 * OpenAI model id for a capability (config-backed).
 * Used when falling back from a local/stub provider so we never send
 * "qwen3:8b" style tags to the OpenAI API.
 */
export function openaiModelForCapability(capability: LlmCapability): string {
  return openaiDefaultModel(capability);
}

/**
 * Keep an explicit OpenAI-looking model override; otherwise use config tier.
 * Drops local tags (e.g. qwen3:8b, llama3.1:70b) on fallback.
 */
export function resolveOpenaiFallbackModel(
  capability: LlmCapability,
  override?: string,
): string {
  if (override && looksLikeOpenaiModelId(override)) {
    return override;
  }
  return openaiModelForCapability(capability);
}

function looksLikeOpenaiModelId(model: string): boolean {
  const m = model.trim().toLowerCase();
  if (!m || m.includes(':') || m.includes('/')) return false;
  return (
    m.startsWith('gpt')
    || m.startsWith('text-embedding')
    || m.startsWith('o1')
    || m.startsWith('o3')
    || m.startsWith('o4')
    || m.startsWith('chatgpt')
  );
}

export function describeModelRouterConfig(): Record<string, LlmRoute> {
  const caps: LlmCapability[] = ['chat', 'extraction', 'nano', 'embedding', 'planner', 'default'];
  const out: Record<string, LlmRoute> = {};
  for (const c of caps) out[c] = resolveRoute(c);
  return out;
}
