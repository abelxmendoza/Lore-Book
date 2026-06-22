import type OpenAI from 'openai';

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;
type ChatParams = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
type ResponseFormat = NonNullable<ChatParams['response_format']>;

export type ResponsesTextFormat =
  | { type: 'json_object' }
  | {
      type: 'json_schema';
      name: string;
      strict?: boolean;
      schema: Record<string, unknown>;
    };

/** Split Chat Completions messages into Responses `instructions` + `input`. */
export function splitMessagesForResponses(messages: ChatMessage[]): {
  instructions?: string;
  input: OpenAI.Responses.ResponseCreateParams['input'];
} {
  const systemParts: string[] = [];
  const inputMessages: Array<{ role: 'user' | 'assistant' | 'developer'; content: string }> = [];

  for (const message of messages) {
    const content = messageContentToString(message.content);
    if (message.role === 'system') {
      if (content) systemParts.push(content);
      continue;
    }
    if (message.role === 'user' || message.role === 'assistant' || message.role === 'developer') {
      inputMessages.push({ role: message.role, content });
      continue;
    }
    // tool / function roles are not translated here — callers must use Chat Completions.
    if (content) {
      inputMessages.push({ role: 'user', content });
    }
  }

  return {
    instructions: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    input: inputMessages.length > 0 ? inputMessages : '',
  };
}

function messageContentToString(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  if (content == null) return '';
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if ('text' in part && typeof part.text === 'string') return part.text;
        return JSON.stringify(part);
      })
      .filter(Boolean)
      .join('\n');
  }
  return JSON.stringify(content);
}

/** Map Chat Completions `response_format` → Responses `text.format`. */
export function chatResponseFormatToResponsesTextFormat(
  responseFormat?: ResponseFormat,
): ResponsesTextFormat | undefined {
  if (!responseFormat) return undefined;
  if (responseFormat.type === 'json_object') {
    return { type: 'json_object' };
  }
  if (responseFormat.type === 'json_schema') {
    const jsonSchema = responseFormat.json_schema;
    return {
      type: 'json_schema',
      name: jsonSchema.name,
      strict: jsonSchema.strict,
      schema: jsonSchema.schema as Record<string, unknown>,
    };
  }
  return undefined;
}

/** True when this Chat Completions request can be served via Responses. */
export function shouldRouteChatCompletionToResponses(
  params: OpenAI.Chat.ChatCompletionCreateParams,
): boolean {
  if (params.stream) return false;
  if (params.n != null && params.n > 1) return false;
  if (params.tools?.length) return false;
  if ('functions' in params && Array.isArray(params.functions) && params.functions.length > 0) {
    return false;
  }
  if (params.messages?.some((message) => message.role === 'tool' || message.role === 'function')) {
    return false;
  }
  return true;
}

/** Translate a non-streaming Chat Completions body to Responses create params. */
export function chatCompletionParamsToResponses(
  params: ChatParams,
): OpenAI.Responses.ResponseCreateParamsNonStreaming {
  const { instructions, input } = splitMessagesForResponses(params.messages ?? []);
  const textFormat = chatResponseFormatToResponsesTextFormat(params.response_format);

  const maxOutput = params.max_completion_tokens ?? params.max_tokens;

  const responsesParams: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model: params.model,
    instructions,
    input,
    store: false,
  };

  if (params.temperature != null) responsesParams.temperature = params.temperature;
  if (maxOutput != null) responsesParams.max_output_tokens = maxOutput;
  if ('reasoning_effort' in params && params.reasoning_effort != null) {
    responsesParams.reasoning = { effort: params.reasoning_effort as 'low' | 'medium' | 'high' };
  }
  if (textFormat) {
    responsesParams.text = { format: textFormat };
  }

  return responsesParams;
}

/** Read assistant text from a Responses result (SDK helper or output items). */
export function extractResponseText(response: OpenAI.Responses.Response): string {
  const withHelper = response as OpenAI.Responses.Response & { output_text?: string };
  if (typeof withHelper.output_text === 'string' && withHelper.output_text.length > 0) {
    return withHelper.output_text;
  }

  for (const item of response.output ?? []) {
    if (item.type !== 'message' || item.role !== 'assistant') continue;
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && part.text) return part.text;
    }
  }
  return '';
}

/** Shim Responses output into the Chat Completions shape existing call sites expect. */
export function responsesToChatCompletion(
  response: OpenAI.Responses.Response,
  model: string,
): OpenAI.Chat.ChatCompletion {
  const content = extractResponseText(response);
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  return {
    id: response.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: response.model ?? model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content, refusal: null },
        finish_reason: response.status === 'completed' ? 'stop' : 'length',
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
    },
  };
}
