/**
 * Response Formatter
 * 
 * Converts mode handler responses to StreamingChatResponse format.
 * Ensures all modes return consistent structure.
 */

import type { ModeHandlerResponse } from './modeHandlers';
import type { StreamingChatResponse } from '../omegaChatService';

/**
 * Convert mode handler response to streaming response
 */
export function formatModeResponse(
  handlerResponse: ModeHandlerResponse,
  mode: string
): StreamingChatResponse {
  const content = handlerResponse.content;

  // Create text stream (single chunk for now)
  const stream = (async function* () {
    yield { choices: [{ delta: { content } }] };
  })();

  return {
    content,
    stream,
    metadata: {
      response_mode: handlerResponse.response_mode,
      mode,
      confidence: handlerResponse.confidence,
      ...handlerResponse.metadata,
    },
  };
}

/**
 * Create silence response (for "I don't know" cases)
 */
export function createSilenceResponse(
  message: string,
  reason?: string
): StreamingChatResponse {
  const stream = (async function* () {
    yield { choices: [{ delta: { content: message } }] };
  })();

  return {
    content: message,
    stream,
    metadata: {
      response_mode: 'SILENCE',
      confidence: 1.0,
      disclaimer: reason,
    },
  };
}
