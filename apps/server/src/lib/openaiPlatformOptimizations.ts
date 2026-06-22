import type OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';
import { openai } from './openai';

/** Static instructions first — maximizes prompt-cache prefix hits across screenshot uploads. */
export const MESSAGE_SCREENSHOT_STATIC_INSTRUCTIONS = `You analyze screenshots of text messages (iMessage, SMS, Instagram DMs, WhatsApp, etc.).
Extract every message line in order. Identify which side is the user ("me") vs the other person.

Return structured JSON matching the schema. Use empty strings for unknown speakerLabel/timestamp fields.
If the screenshot is unreadable or not a message thread, set confidence to 0, extractedText to "", messages to [], and summary explaining why.`;

export type PromptCacheParams = {
  prompt_cache_key?: string;
  prompt_cache_retention?: 'in-memory' | '24h' | null;
};

/** Shared prompt-cache settings for Responses API calls. */
export function buildPromptCacheParams(cacheKey: string): PromptCacheParams {
  const retention = config.openAiPromptCacheRetention;
  return {
    prompt_cache_key: cacheKey,
    ...(retention ? { prompt_cache_retention: retention } : {}),
  };
}

/** Server-side compaction — triggers when rendered context crosses threshold (Responses API). */
export type ContextManagementCompaction = {
  type: 'compaction';
  compact_threshold: number;
};

export function buildServerSideCompaction(): ContextManagementCompaction[] | undefined {
  const threshold = config.openAiServerCompactionThreshold;
  if (!threshold || threshold <= 0) return undefined;
  return [{ type: 'compaction', compact_threshold: threshold }];
}

/** Attach compaction + prompt cache to Responses create params when configured. */
export function withResponsesOptimizations<T extends Record<string, unknown>>(
  params: T,
  options: { cacheKey?: string; sessionId?: string } = {},
): T {
  const extended = { ...params } as T & {
    prompt_cache_key?: string;
    prompt_cache_retention?: 'in-memory' | '24h' | null;
    context_management?: ContextManagementCompaction[];
  };

  const cacheKey = options.cacheKey ?? (options.sessionId ? `chat:${options.sessionId}` : undefined);
  if (cacheKey) {
    Object.assign(extended, buildPromptCacheParams(cacheKey));
  }

  const compaction = buildServerSideCompaction();
  if (compaction) {
    extended.context_management = compaction;
  }

  return extended;
}

/** Accurate input token count via OpenAI (includes images, tools, schema formatting). */
export async function countResponsesInputTokens(
  params: OpenAI.Responses.InputTokens.InputTokenCountParams,
): Promise<number | null> {
  if (!config.openAiUseInputTokenCountApi) return null;
  if (!openai.responses?.inputTokens?.count) return null;

  try {
    const result = await openai.responses.inputTokens.count(params);
    return result.input_tokens;
  } catch (err) {
    logger.debug({ err, model: params.model }, 'input token count failed — using heuristic');
    return null;
  }
}

/** Log cached token hits from a Responses usage object when present. */
export function logPromptCacheUsage(
  usage: OpenAI.Responses.ResponseUsage | null | undefined,
  context: { service: string; model?: string },
): void {
  if (!usage) return;
  const details = usage.input_tokens_details as { cached_tokens?: number } | undefined;
  const cached = details?.cached_tokens ?? 0;
  if (cached > 0) {
    logger.debug(
      {
        service: context.service,
        model: context.model,
        inputTokens: usage.input_tokens,
        cachedTokens: cached,
      },
      'openai.prompt_cache_hit',
    );
  }
}
