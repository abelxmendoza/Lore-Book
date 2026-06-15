import type OpenAI from 'openai';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';

import { config } from '../../config';
import { openai } from '../../lib/openai';
import { logger } from '../../logger';

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

export type LorekeeperChatStreamChunk = {
  choices: Array<{
    delta: {
      content?: string | null;
    };
  }>;
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

async function* normalizeResponsesStream(
  stream: AsyncIterable<ResponseStreamEvent>
): AsyncIterable<LorekeeperChatStreamChunk> {
  for await (const event of stream) {
    if (event.type === 'response.output_text.delta' && event.delta) {
      yield asChatDeltaChunk(event.delta);
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
  if (!config.useResponsesApiForChat) {
    return openai.chat.completions.create({
      model: params.model,
      temperature: params.temperature,
      stream: true,
      messages: params.messages,
    });
  }

  const systemPrompt = params.messages.find((message) => message.role === 'system');
  const responseInput = toResponsesInput(params.messages.filter((message) => message.role !== 'system'));

  logger.debug(
    {
      model: params.model,
      inputMessages: responseInput.length,
      userId: params.userId,
    },
    'openai.responses.stream'
  );

  const stream = await openai.responses.create({
    model: params.model,
    instructions: typeof systemPrompt?.content === 'string' ? systemPrompt.content : undefined,
    input: responseInput,
    temperature: params.temperature,
    stream: true,
    store: false,
    ...(params.userId ? { safety_identifier: params.userId } : {}),
  });

  return normalizeResponsesStream(stream);
}
