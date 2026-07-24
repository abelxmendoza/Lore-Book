/**
 * LoreBook ModelRouter
 *
 * Default: all capabilities → OpenAI (identical to pre-router behavior).
 * Optional: per-capability provider/model via env; failures fall back to OpenAI.
 *
 * Prefer completeFor() for structured workloads (extraction, nano, planner).
 *
 * @example
 *   import { completeFor } from '../services/llm';
 *   const result = await completeFor('extraction', {
 *     messages: [{ role: 'user', content: '...' }],
 *   });
 */

export type {
  ChatCompletionParams,
  EmbeddingParams,
  LlmCallMeta,
  LlmCapability,
  LlmChatResult,
  LlmEmbeddingResult,
  LlmProvider,
  LlmProviderId,
  LlmRoute,
} from './types';

export {
  baseUrlForProvider,
  defaultProviderId,
  describeModelRouterConfig,
  fallbackToOpenaiEnabled,
  openaiModelForCapability,
  resolveOpenaiFallbackModel,
  resolveRoute,
} from './modelRouterConfig';

export { ModelRouter, getModelRouter, resetModelRouterForTests } from './modelRouter';
export { completeFor, completeForWithMeta } from './completeFor';
export { buildProviderRegistry, OpenAiProvider, OpenAiCompatibleProvider } from './providers';
