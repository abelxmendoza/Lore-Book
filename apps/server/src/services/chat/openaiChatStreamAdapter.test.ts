import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConfig, mockChatCreate, mockResponsesCreate } = vi.hoisted(() => ({
  mockConfig: {
    chatModel: 'gpt-5.5',
    useResponsesApiForChat: false,
  },
  mockChatCreate: vi.fn(),
  mockResponsesCreate: vi.fn(),
}));

vi.mock('../../config', () => ({
  config: mockConfig,
}));

vi.mock('../../lib/openai', () => ({
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
}));

vi.mock('../../logger', () => ({
  logger: {
    debug: vi.fn(),
  },
}));

import { createOpenAIChatStream } from './openaiChatStreamAdapter';

async function* makeResponseEvents() {
  yield { type: 'response.output_text.delta', delta: 'Hello' };
  yield { type: 'response.output_text.delta', delta: ' there' };
  yield { type: 'response.completed' };
}

describe('createOpenAIChatStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.useResponsesApiForChat = false;
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
      temperature: 0.7,
      stream: true,
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
    for await (const chunk of stream) chunks.push(chunk.choices[0]?.delta.content);

    expect(chunks).toEqual(['Hello', ' there']);
    expect(mockResponsesCreate).toHaveBeenCalledWith({
      model: 'gpt-5.5',
      instructions: 'System prompt',
      input: [
        { role: 'assistant', content: 'Earlier answer' },
        { role: 'user', content: 'Continue' },
      ],
      temperature: 0.7,
      stream: true,
      store: false,
      safety_identifier: 'user-123',
    });
    expect(mockChatCreate).not.toHaveBeenCalled();
  });
});
