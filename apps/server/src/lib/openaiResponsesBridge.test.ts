import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { chatCompletionParamsToResponses } from './openaiResponsesBridge';

type ChatParams = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;

const inputText = (input: OpenAI.Responses.ResponseCreateParams['input']): string =>
  typeof input === 'string' ? input : JSON.stringify(input);

describe('chatCompletionParamsToResponses — json_object keyword guard', () => {
  it('injects the json keyword into INPUT when "JSON" is only in the system prompt', () => {
    // Regression: the Responses API checks `input` (not `instructions`) for the
    // word "json". A prompt with "JSON" only in the system message used to 400.
    const params: ChatParams = {
      model: 'gpt-5.4',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Extract entities. Return JSON: {"entities":[]}' },
        { role: 'user', content: 'Extract entities from this text: had a great day' },
      ],
    };
    const out = chatCompletionParamsToResponses(params);
    expect(out.text?.format?.type).toBe('json_object');
    expect(/json/i.test(inputText(out.input))).toBe(true);
  });

  it('does not modify input that already contains json', () => {
    const params: ChatParams = {
      model: 'gpt-5.4',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: 'reply in json please' }],
    };
    const out = chatCompletionParamsToResponses(params);
    // Already has json → no extra note message appended.
    expect(Array.isArray(out.input) ? out.input.length : 0).toBe(1);
    expect(/json/i.test(inputText(out.input))).toBe(true);
  });

  it('leaves input untouched when no json format is requested', () => {
    const params: ChatParams = {
      model: 'gpt-5.4',
      messages: [{ role: 'user', content: 'just chat' }],
    };
    const out = chatCompletionParamsToResponses(params);
    expect(/json/i.test(inputText(out.input))).toBe(false);
  });
});
