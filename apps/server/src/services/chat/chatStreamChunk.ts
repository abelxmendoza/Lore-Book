/**
 * Chat Completions stream chunk parsing aligned with OpenAI streaming guidance:
 * https://developers.openai.com/cookbook/examples/how_to_stream_completions
 *
 * With `stream_options: { include_usage: true }`, the final chunk has `choices: []`
 * and non-null `usage` — content must be read from `delta`, not `message`, and
 * persistence should run only after the stream completes (see Anthropic `message_stop`
 * equivalent in our route handler).
 */
import type { LorekeeperChatStreamChunk } from './openaiChatStreamAdapter';

export type ChatStreamTokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type ParsedChatStreamChunk = {
  /** Text delta for this chunk, if any. */
  contentDelta: string | null;
  /** Present on the terminal usage-only chunk when include_usage is enabled. */
  usage: ChatStreamTokenUsage | null;
};

export function parseChatCompletionStreamChunk(
  chunk: LorekeeperChatStreamChunk
): ParsedChatStreamChunk {
  const usage = chunk.usage
    ? {
        prompt_tokens: chunk.usage.prompt_tokens,
        completion_tokens: chunk.usage.completion_tokens,
        total_tokens: chunk.usage.total_tokens,
      }
    : null;

  // OpenAI: final chunk may have choices: [] when include_usage is true.
  const content = chunk.choices?.[0]?.delta?.content;
  const contentDelta = typeof content === 'string' && content.length > 0 ? content : null;

  return { contentDelta, usage };
}
