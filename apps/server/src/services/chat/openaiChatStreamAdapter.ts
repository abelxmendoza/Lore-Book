import type OpenAI from 'openai';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';

import { config } from '../../config';
import { normalizeOpenAIChatParams, openai } from '../../lib/openai';
import { logger } from '../../logger';

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
};

export type LorekeeperChatStream = AsyncIterable<LorekeeperChatStreamChunk>;

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
      if (usage) {
        yield { choices: [], usage };
      }
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

export async function createOpenAIChatStream(params: {
  model: string;
  temperature?: number;
  messages: ChatMessage[];
  userId?: string;
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
  const responseInput = toResponsesInput(params.messages.filter((message) => message.role !== 'system'));

  logger.debug(
    {
      model,
      inputMessages: responseInput.length,
      userId: params.userId,
    },
    'openai.responses.stream'
  );

  // store: false — stateless like Anthropic Messages API; Lorekeeper persists turns.
  const stream = await openai.responses.create({
    model,
    instructions: typeof systemPrompt?.content === 'string' ? systemPrompt.content : undefined,
    input: responseInput,
    ...(temperature != null ? { temperature } : {}),
    stream: true,
    store: false,
    ...(params.userId ? { safety_identifier: params.userId } : {}),
  });

  return normalizeResponsesStream(stream);
}
