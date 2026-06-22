import { describe, expect, it } from 'vitest';

import {
  chatCompletionParamsToResponses,
  chatResponseFormatToResponsesTextFormat,
  extractResponseText,
  responsesToChatCompletion,
  shouldRouteChatCompletionToResponses,
  splitMessagesForResponses,
} from '../../src/lib/openaiResponsesBridge';

describe('openaiResponsesBridge', () => {
  it('splits system messages into instructions', () => {
    const { instructions, input } = splitMessagesForResponses([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]);

    expect(instructions).toBe('You are helpful.');
    expect(input).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]);
  });

  it('maps json_schema response_format to text.format', () => {
    expect(
      chatResponseFormatToResponsesTextFormat({
        type: 'json_schema',
        json_schema: {
          name: 'person',
          strict: true,
          schema: { type: 'object', properties: { name: { type: 'string' } } },
        },
      }),
    ).toEqual({
      type: 'json_schema',
      name: 'person',
      strict: true,
      schema: { type: 'object', properties: { name: { type: 'string' } } },
    });
  });

  it('translates chat completion params to responses params', () => {
    const responses = chatCompletionParamsToResponses({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Extract JSON only.' },
        { role: 'user', content: 'Ada is 54' },
      ],
    });

    expect(responses).toMatchObject({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_output_tokens: 500,
      store: false,
      instructions: 'Extract JSON only.',
      input: [{ role: 'user', content: 'Ada is 54' }],
      text: { format: { type: 'json_object' } },
    });
  });

  it('does not route streaming or tool-call requests', () => {
    expect(shouldRouteChatCompletionToResponses({ model: 'gpt-4o-mini', messages: [], stream: true })).toBe(
      false,
    );
    expect(
      shouldRouteChatCompletionToResponses({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object' } } }],
      }),
    ).toBe(false);
  });

  it('shims responses output to chat completion shape', () => {
    const chat = responsesToChatCompletion(
      {
        id: 'resp_123',
        object: 'response',
        created_at: 1,
        status: 'completed',
        model: 'gpt-4o-mini',
        output: [
          {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: '{"name":"Ada"}', annotations: [] }],
          },
        ],
        usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
      } as any,
      'gpt-4o-mini',
    );

    expect(chat.choices[0]?.message?.content).toBe('{"name":"Ada"}');
    expect(chat.usage).toEqual({
      prompt_tokens: 12,
      completion_tokens: 8,
      total_tokens: 20,
    });
  });

  it('reads output_text helper when present', () => {
    expect(
      extractResponseText({
        output_text: 'hello',
        output: [],
      } as any),
    ).toBe('hello');
  });
});
