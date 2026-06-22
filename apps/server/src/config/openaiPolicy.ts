import { config } from '../config';

/** Read-only snapshot of OpenAI integration + cost policy for runtime diagnostics. */
export function buildOpenAiPolicySnapshot() {
  const manualState = !config.openAiResponseChaining && !config.openAiConversationsApi;

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
