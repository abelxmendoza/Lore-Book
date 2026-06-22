import type OpenAI from 'openai';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';

import { config } from '../../config';
import { normalizeOpenAIChatParams, openai } from '../../lib/openai';
import { withResponsesOptimizations } from '../../lib/openaiPlatformOptimizations';
import { logger } from '../../logger';
import { buildFileSearchTool } from '../openaiPlatform/openaiVectorStoreService';

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

export type LorekeeperChatStreamChunk = {
  choices: Array<{
    delta: {
      content?: string | null;
    };
  }>;
  /** Set on the terminal chunk when stream_options.include_usage is enabled. */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
  /** OpenAI Responses id — emitted on terminal chunk when chaining/store is on. */
  responseId?: string;
};

export type LorekeeperChatStream = AsyncIterable<LorekeeperChatStreamChunk>;

export type OpenAiChatStreamContext = {
  userId?: string;
  sessionId?: string;
  previousResponseId?: string;
  openAiConversationId?: string;
  vectorStoreId?: string;
};

function asChatDeltaChunk(content: string): LorekeeperChatStreamChunk {
  return {
    choices: [
      {
        delta: { content },
      },
    ],
  };
}

function usageFromResponse(response: { usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | null } | null | undefined): LorekeeperChatStreamChunk['usage'] {
  const u = response?.usage;
  if (!u) return null;
  return {
    prompt_tokens: u.input_tokens,
    completion_tokens: u.output_tokens,
    total_tokens: u.total_tokens,
  };
}

async function* normalizeResponsesStream(
  stream: AsyncIterable<ResponseStreamEvent>
): AsyncIterable<LorekeeperChatStreamChunk> {
  for await (const event of stream) {
    if (event.type === 'response.output_text.delta' && event.delta) {
      yield asChatDeltaChunk(event.delta);
    }
    if (event.type === 'response.completed') {
      const usage = usageFromResponse(event.response);
      yield {
        choices: [],
        usage,
        responseId: event.response?.id,
      };
    }
    if (event.type === 'response.failed') {
      const message = event.response?.error?.message || 'Responses API stream failed';
      throw new Error(message);
    }
    if (event.type === 'error') {
      throw new Error(event.message || 'Responses API stream error');
    }
  }
}

function toResponsesInput(messages: ChatMessage[]): Array<{ role: 'user' | 'assistant' | 'developer'; content: string }> {
  return messages
    .filter((message): message is Extract<ChatMessage, { role: 'user' | 'assistant' | 'developer' }> =>
      message.role === 'user' || message.role === 'assistant' || message.role === 'developer'
    )
    .map((message) => ({
      role: message.role,
      content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? ''),
    }));
}

function resolveResponsesInput(
  messages: ChatMessage[],
  previousResponseId?: string,
): OpenAI.Responses.ResponseCreateParams['input'] {
  if (!previousResponseId) {
    return toResponsesInput(messages.filter((message) => message.role !== 'system'));
  }

  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUser) {
    return toResponsesInput(messages.filter((message) => message.role !== 'system'));
  }

  return [
    {
      role: 'user' as const,
      content: typeof lastUser.content === 'string'
        ? lastUser.content
        : JSON.stringify(lastUser.content ?? ''),
    },
  ];
}

export async function createOpenAIChatStream(params: {
  model: string;
  temperature?: number;
  messages: ChatMessage[];
  userId?: string;
  sessionId?: string;
  previousResponseId?: string;
  openAiConversationId?: string;
  vectorStoreId?: string;
}): Promise<LorekeeperChatStream> {
  const { model, temperature } = normalizeOpenAIChatParams({
    model: params.model,
    temperature: params.temperature,
  });

  if (!config.useResponsesApiForChat) {
    // https://developers.openai.com/cookbook/examples/how_to_stream_completions
    return openai.chat.completions.create({
      model,
      ...(temperature != null ? { temperature } : {}),
      stream: true,
      stream_options: { include_usage: true },
      messages: params.messages,
    });
  }

  const systemPrompt = params.messages.find((message) => message.role === 'system');
  const useChaining = config.openAiResponseChaining && Boolean(params.previousResponseId);
  const storeAtOpenAi = config.openAiResponseChaining || config.openAiConversationsApi;
  const responseInput = resolveResponsesInput(
    params.messages,
    useChaining ? params.previousResponseId : undefined,
  );

  const tools: OpenAI.Responses.ResponseCreateParams['tools'] = [];
  if (config.openAiVectorStoreEnabled && params.vectorStoreId) {
    tools.push(buildFileSearchTool(params.vectorStoreId));
  }

  logger.debug(
    {
      model,
      inputMessages: Array.isArray(responseInput) ? responseInput.length : 1,
      userId: params.userId,
      sessionId: params.sessionId,
      chaining: useChaining,
      store: storeAtOpenAi,
      conversationId: params.openAiConversationId,
      vectorStore: params.vectorStoreId,
    },
    'openai.responses.stream'
  );

  const stream = await openai.responses.create(
    withResponsesOptimizations(
      {
        model,
        instructions: typeof systemPrompt?.content === 'string' ? systemPrompt.content : undefined,
        input: responseInput,
        ...(temperature != null ? { temperature } : {}),
        stream: true,
        store: storeAtOpenAi,
        ...(useChaining && params.previousResponseId
          ? { previous_response_id: params.previousResponseId }
          : {}),
        ...(params.openAiConversationId
          ? { conversation: params.openAiConversationId }
          : {}),
        ...(tools.length > 0 ? { tools } : {}),
        ...(params.userId ? { safety_identifier: params.userId } : {}),
      },
      { sessionId: params.sessionId, cacheKey: params.sessionId ? `chat:${params.sessionId}` : undefined },
    ),
  );

  return normalizeResponsesStream(stream);
}
