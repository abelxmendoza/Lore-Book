/**
 * Capability-scoped chat completion.
 *
 * Prefer this over `openai.chat.completions.create` for structured workloads
 * (extraction, nano, planner) so provider/model can be swapped via env without
 * touching call sites. Chat UX paths can keep using the OpenAI singleton until
 * intentionally migrated.
 *
 * Default (no LLM_* env): identical to today's OpenAI path.
 * Local failure: falls back to OpenAI when LLM_FALLBACK_TO_OPENAI=true.
 *
 * @example
 *   const completion = await completeFor('extraction', {
 *     messages: [{ role: 'user', content: '...' }],
 *     temperature: 0.1,
 *     response_format: { type: 'json_object' },
 *   });
 *   // Do not pass `model` unless you intentionally override the route;
 *   // the router injects the capability's configured model.
 */

import { getModelRouter } from './modelRouter';
import type {
  ChatCompletionParams,
  LlmCallMeta,
  LlmCapability,
  LlmChatResult,
} from './types';

export async function completeFor(
  capability: LlmCapability,
  params: ChatCompletionParams,
): Promise<LlmChatResult> {
  const { result } = await getModelRouter().chatCompletion(capability, params);
  return result;
}

export async function completeForWithMeta(
  capability: LlmCapability,
  params: ChatCompletionParams,
): Promise<{ result: LlmChatResult; meta: LlmCallMeta }> {
  return getModelRouter().chatCompletion(capability, params);
}
