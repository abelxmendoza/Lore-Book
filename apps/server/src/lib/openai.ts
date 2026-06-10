import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';

/**
 * gpt-5.x models reject the legacy `max_tokens` parameter and require
 * `max_completion_tokens`. ~30 call sites across the codebase still pass
 * `max_tokens`, so normalize once here instead of touching every caller.
 */
const normalizingFetch: typeof fetch = async (url, init) => {
  if (init?.body && typeof init.body === 'string' && String(url).includes('/chat/completions')) {
    try {
      const body = JSON.parse(init.body);
      if (typeof body.model === 'string' && body.model.startsWith('gpt-5') && body.max_tokens != null) {
        body.max_completion_tokens = body.max_tokens;
        delete body.max_tokens;
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch { /* not JSON — pass through untouched */ }
  }
  return fetch(url, init);
};

export const openai = new OpenAI({
  apiKey: config.openAiKey,
  maxRetries: 3,
  timeout: 30_000,
  fetch: normalizingFetch,
});

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
