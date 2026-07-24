import { config } from '../config';
import { describeModelRouterConfig, fallbackToOpenaiEnabled } from '../services/llm';

/** Read-only snapshot of OpenAI integration + cost policy for runtime diagnostics. */
export function buildOpenAiPolicySnapshot() {
  const manualState = !config.openAiResponseChaining && !config.openAiConversationsApi;

  // Capability routes (default openai). Safe: config-only, no network.
  let modelRouter: Record<string, { provider: string; model: string; fallbackToOpenai: boolean }> | undefined;
  try {
    const routes = describeModelRouterConfig();
    modelRouter = {};
    for (const [cap, route] of Object.entries(routes)) {
      modelRouter[cap] = {
        provider: route.provider,
        model: route.model,
        fallbackToOpenai: route.fallbackToOpenai,
      };
    }
  } catch {
    modelRouter = undefined;
  }

  return {
    conversationState: manualState
      ? 'manual_supabase'
      : config.openAiResponseChaining
        ? 'previous_response_id'
        : config.openAiConversationsApi
          ? 'conversations_api'
          : 'hybrid',
    storeAtOpenAi: config.openAiResponseChaining || config.openAiConversationsApi,
    models: {
      chat: config.chatModel,
      extraction: config.extractionModel,
      nano: config.nanoModel,
      embedding: config.embeddingModel,
      adminAgent: config.openAiAgentModel,
    },
    modelRouter: {
      fallbackToOpenai: fallbackToOpenaiEnabled(),
      routes: modelRouter,
    },
    responsesApi: {
      nonStreaming: config.useResponsesApi,
      chatStream: config.useResponsesApiForChat,
    },
    platformOptIn: {
      responseChaining: config.openAiResponseChaining,
      conversationsApi: config.openAiConversationsApi,
      backgroundResponses: config.openAiBackgroundResponses,
      vectorStore: config.openAiVectorStoreEnabled,
      compactApi: config.openAiUseCompactApi,
      serverCompactionThreshold: config.openAiServerCompactionThreshold,
      promptCacheRetention: config.openAiPromptCacheRetention,
      inputTokenCountApi: config.openAiUseInputTokenCountApi,
      webhooksConfigured: Boolean(config.openAiWebhookSecret),
    },
    costGuards: {
      shadowExtraction: config.enableShadowExtraction,
      mergedExtraction: config.enableMergedExtraction,
      engineScheduler: process.env.ENABLE_ENGINE_SCHEDULER === 'true',
      loreAgents: config.enableLoreAgents,
    },
    policy: manualState ? 'recommended_manual_state' : 'experimental_openai_state',
  };
}
