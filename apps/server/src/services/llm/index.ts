/**
 * LoreBook ModelRouter (Phase 1)
 *
 * Default: all capabilities → OpenAI (identical to pre-router behavior).
 * Optional: per-capability provider/model via env; failures fall back to OpenAI.
 *
 * @example
 *   import { getModelRouter } from '../services/llm';
 *   const { result } = await getModelRouter().chatCompletion('extraction', {
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
export { buildProviderRegistry, OpenAiProvider, OpenAiCompatibleProvider } from './providers';
