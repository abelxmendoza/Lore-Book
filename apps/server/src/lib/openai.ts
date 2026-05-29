import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';

export const openai = new OpenAI({
  apiKey: config.openAiKey,
  maxRetries: 3,
  timeout: 30_000,
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
