import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConfig, mockChatCreate, mockResponsesCreate } = vi.hoisted(() => ({
  mockConfig: {
    chatModel: 'gpt-5.5',
    useResponsesApiForChat: false,
    openAiResponseChaining: false,
    openAiConversationsApi: false,
    openAiVectorStoreEnabled: false,
  },
  mockChatCreate: vi.fn(),
  mockResponsesCreate: vi.fn(),
}));

vi.mock('../../config', () => ({
  config: mockConfig,
}));

vi.mock('../../lib/openai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/openai')>();
  return {
    ...actual,
    openai: {
      chat: {
        completions: {
          create: mockChatCreate,
        },
      },
      responses: {
        create: mockResponsesCreate,
      },
    },
  };
});

vi.mock('../../logger', () => ({
  logger: {
    debug: vi.fn(),
  },
}));

import { createOpenAIChatStream } from './openaiChatStreamAdapter';

async function* makeResponseEvents() {
  yield { type: 'response.output_text.delta', delta: 'Hello' };
  yield { type: 'response.output_text.delta', delta: ' there' };
  yield {
    type: 'response.completed',
    response: {
      id: 'resp_chain_1',
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    },
  };
}

describe('createOpenAIChatStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.useResponsesApiForChat = false;
    mockConfig.openAiResponseChaining = false;
    mockConfig.openAiConversationsApi = false;
    mockConfig.openAiVectorStoreEnabled = false;
  });

  it('uses Chat Completions by default', async () => {
    const chatStream = (async function* () {
      yield { choices: [{ delta: { content: 'chat' } }] };
    })();
    mockChatCreate.mockResolvedValueOnce(chatStream);

    const stream = await createOpenAIChatStream({
      model: 'gpt-5.5',
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Hi' },
      ],
      userId: 'u1',
    });

    expect(stream).toBe(chatStream);
    expect(mockChatCreate).toHaveBeenCalledWith({
      model: 'gpt-5.5',
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Hi' },
      ],
    });
    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });

  it('uses Responses API and normalizes text delta events when enabled', async () => {
    mockConfig.useResponsesApiForChat = true;
    mockResponsesCreate.mockResolvedValueOnce(makeResponseEvents());

    const stream = await createOpenAIChatStream({
      model: 'gpt-5.5',
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'System prompt' },
        { role: 'assistant', content: 'Earlier answer' },
        { role: 'user', content: 'Continue' },
      ],
      userId: 'user-123',
    });

    const chunks: Array<string | null | undefined> = [];
    let terminalUsage: unknown;
    for await (const chunk of stream) {
      if (chunk.choices.length === 0 && chunk.usage) {
        terminalUsage = chunk.usage;
      } else {
        chunks.push(chunk.choices[0]?.delta.content);
      }
    }

    expect(chunks).toEqual(['Hello', ' there']);
    expect(terminalUsage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
    expect(mockResponsesCreate).toHaveBeenCalledWith({
      model: 'gpt-5.5',
      instructions: 'System prompt',
      input: [
        { role: 'assistant', content: 'Earlier answer' },
        { role: 'user', content: 'Continue' },
      ],
      stream: true,
      store: false,
      safety_identifier: 'user-123',
    });
    expect(mockChatCreate).not.toHaveBeenCalled();
  });

  it('chains via previous_response_id when OPENAI_RESPONSE_CHAINING is enabled', async () => {
    mockConfig.useResponsesApiForChat = true;
    mockConfig.openAiResponseChaining = true;
    mockResponsesCreate.mockResolvedValueOnce(makeResponseEvents());

    const stream = await createOpenAIChatStream({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'System prompt' },
        { role: 'assistant', content: 'Earlier answer' },
        { role: 'user', content: 'Follow up' },
      ],
      userId: 'user-123',
      sessionId: 'sess-1',
      previousResponseId: 'resp_prev',
    });

    let responseId: string | undefined;
    for await (const chunk of stream) {
      if (chunk.responseId) responseId = chunk.responseId;
    }

    expect(responseId).toBe('resp_chain_1');
    expect(mockResponsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        store: true,
        previous_response_id: 'resp_prev',
        input: [{ role: 'user', content: 'Follow up' }],
      }),
    );
  });

  it('maps multimodal user content to Responses input_image parts', async () => {
    mockConfig.useResponsesApiForChat = true;
    mockResponsesCreate.mockResolvedValueOnce(makeResponseEvents());

    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ';
    await createOpenAIChatStream({
      model: 'gpt-5.5',
      messages: [
        { role: 'system', content: 'System prompt' },
        {
          role: 'user',
          content: [
            { type: 'text', text: "what's in this image?" },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
      userId: 'user-vision',
    });

    expect(mockResponsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: "what's in this image?" },
              { type: 'input_image', image_url: dataUrl, detail: 'high' },
            ],
          },
        ],
      }),
    );
  });
});
