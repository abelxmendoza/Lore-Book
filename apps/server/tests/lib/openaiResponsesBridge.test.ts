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
      text: { format: { type: 'json_object' } },
    });
    // The Responses API checks `input` (not `instructions`) for the "json"
    // keyword. The system prompt's "JSON" lives in `instructions`, so the hint
    // must be injected into `input` to avoid a 400.
    expect(responses.input).toEqual([
      { role: 'user', content: 'Ada is 54' },
      { role: 'user', content: 'Respond with valid JSON.' },
    ]);
  });

  it('injects the json keyword into input (not instructions) for json_object', () => {
    const responses = chatCompletionParamsToResponses({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Return structured data.' },
        { role: 'user', content: 'Ada is 54' },
      ],
    });

    // instructions are left untouched; the keyword goes into input where the
    // Responses API actually enforces it.
    expect(responses.instructions).toBe('Return structured data.');
    expect(JSON.stringify(responses.input)).toMatch(/json/i);
  });

  it('does not modify input that already contains json', () => {
    const responses = chatCompletionParamsToResponses({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: 'reply in json please' }],
    });
    expect(responses.input).toEqual([{ role: 'user', content: 'reply in json please' }]);
  });

  it('leaves input untouched when no json format is requested', () => {
    const responses = chatCompletionParamsToResponses({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'just chat' }],
    });
    expect(JSON.stringify(responses.input)).not.toMatch(/json/i);
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

  it('does not route multimodal image_url requests through the text bridge', () => {
    expect(
      shouldRouteChatCompletionToResponses({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this photo.' },
              { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } },
            ],
          },
        ],
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
