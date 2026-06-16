import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';
import { createSemaphore } from './semaphore';

/** gpt-5.x and o-series reasoning models only accept the default temperature (1). */
export function modelSupportsCustomTemperature(model: string): boolean {
  const m = model.toLowerCase();
  if (m.startsWith('gpt-5')) return false;
  if (/^o[0-9]/.test(m)) return false;
  return true;
}

type TokenParams = {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
};

/** Normalize params once at the SDK boundary (temperature, max_tokens). */
export function normalizeOpenAIChatParams<T extends TokenParams>(params: T): T {
  const normalized = { ...params };
  const model = normalized.model ?? '';

  if (model.startsWith('gpt-5') && normalized.max_tokens != null) {
    normalized.max_completion_tokens = normalized.max_tokens;
    delete normalized.max_tokens;
  }

  if (normalized.temperature != null && !modelSupportsCustomTemperature(model)) {
    delete normalized.temperature;
  }

  return normalized;
}

/**
 * gpt-5.x models reject the legacy `max_tokens` parameter and require
 * `max_completion_tokens`. ~30 call sites across the codebase still pass
 * `max_tokens`, so normalize once here instead of touching every caller.
 */
const normalizingFetch: typeof fetch = async (url, init) => {
  if (init?.body && typeof init.body === 'string') {
    const urlStr = String(url);
    if (urlStr.includes('/chat/completions') || urlStr.includes('/responses')) {
      try {
        const body = normalizeOpenAIChatParams(JSON.parse(init.body) as TokenParams);
        init = { ...init, body: JSON.stringify(body) };
      } catch { /* not JSON — pass through untouched */ }
    }
  }
  return fetch(url, init);
};

export const openai = new OpenAI({
  apiKey: config.openAiKey,
  // Lowered 3→2: a single chat turn fans out to ~20 detector calls; on a 429
  // burst, 3 retries each multiplied the storm ~4×. With the concurrency gate
  // below the burst is bounded, so fewer retries are both safe and necessary.
  maxRetries: 2,
  timeout: 30_000,
  fetch: normalizingFetch,
});

/**
 * Global OpenAI concurrency gate.
 *
 * Root cause of the "AI temporarily over capacity" (429) failures: the ingestion
 * pipeline fans a single message out to ~20 independent chat.completions calls
 * (one per conversationCentered detector) with NO concurrency limit. That burst
 * tripped OpenAI's rate limit, the SDK retried each call, and the user-facing
 * chat completion got 429'd in the storm.
 *
 * Fix: a process-wide semaphore around chat.completions.create — applied once at
 * the SDK boundary so every one of the ~30 call sites is bounded without edits.
 * Non-streaming calls (all the detectors) hold a slot for their full duration;
 * streaming calls (the user's chat response) initiate and release immediately,
 * so they are never starved by background ingestion.
 */
const MAX_CONCURRENT = Math.max(1, Number(process.env.OPENAI_MAX_CONCURRENCY ?? 5));
const openaiSemaphore = createSemaphore(MAX_CONCURRENT);

/** Current in-flight + queued OpenAI chat calls (observability/tests). */
export function getOpenAIConcurrency() {
  return openaiSemaphore.stats();
}

// Wrap chat.completions.create once, globally. Preserves streaming + non-streaming.
const _rawCreate = openai.chat.completions.create.bind(openai.chat.completions);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(openai.chat.completions as any).create = (...args: any[]) => {
  const [params, ...rest] = args;
  const normalized = normalizeOpenAIChatParams((params ?? {}) as TokenParams);
  return openaiSemaphore.run(() => _rawCreate(normalized, ...rest));
};

// Responses API chat path must share the same gate; otherwise flipping
// OPENAI_CHAT_USE_RESPONSES reintroduces the same detector fan-out 429 storm.
if (openai.responses?.create) {
  const _rawResponsesCreate = openai.responses.create.bind(openai.responses);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (openai.responses as any).create = (...args: any[]) => {
    const [params, ...rest] = args;
    const normalized = normalizeOpenAIChatParams((params ?? {}) as TokenParams);
    return openaiSemaphore.run(() => _rawResponsesCreate(normalized, ...rest));
  };
}

/**
 * Traced wrapper for chat completions. Logs model, token counts, and duration.
 * Use this in services that need cost/latency observability.
 */
export async function tracedCompletion(
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  context?: { service?: string; userId?: string }
): Promise<OpenAI.Chat.ChatCompletion> {
  const start = Date.now();
  try {
    const result = await openai.chat.completions.create(params);
    logger.debug(
      {
        service: context?.service,
        model: params.model,
        promptTokens: result.usage?.prompt_tokens,
        completionTokens: result.usage?.completion_tokens,
        durationMs: Date.now() - start,
      },
      'openai.completion'
    );
    return result;
  } catch (err) {
    logger.warn(
      { err, service: context?.service, model: params.model, durationMs: Date.now() - start },
      'openai.completion failed'
    );
    throw err;
  }
}
