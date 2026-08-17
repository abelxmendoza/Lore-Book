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
  mode: string,
  extras?: Partial<StreamingChatResponse['metadata']>,
): StreamingChatResponse {
  const content = handlerResponse.content;
  const handlerSources = handlerResponse.metadata?.sources;
  const handlerRecallSources = handlerResponse.metadata?.recall_sources;
  const extraSources = extras?.sources;
  const extraRecallSources = extras?.recall_sources;
  const hasSupportingSources =
    (Array.isArray(handlerSources) && handlerSources.length > 0) ||
    (Array.isArray(handlerRecallSources) && handlerRecallSources.length > 0) ||
    (Array.isArray(extraSources) && extraSources.length > 0) ||
    (Array.isArray(extraRecallSources) && extraRecallSources.length > 0);
  // A recall label is an evidence contract, not a styling hint. Deterministic
  // projections may still answer without citations, but they are synthesis —
  // never claim that a source-backed recall happened when no source exists.
  const responseMode =
    handlerResponse.response_mode === 'FOCUSED_RECALL' && !hasSupportingSources
      ? 'PROJECTION_SYNTHESIS'
      : handlerResponse.response_mode;

  // Create text stream (single chunk for now)
  const stream = (async function* () {
    yield { choices: [{ delta: { content } }] };
  })();

  return {
    content,
    stream,
    metadata: {
      response_mode: responseMode,
      mode,
      confidence: handlerResponse.confidence,
      ...handlerResponse.metadata,
      ...extras,
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
