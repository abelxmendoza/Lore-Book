/**
 * Recall Chat Formatter
 * 
 * Formats Memory Recall Engine results for chat display
 */

import type { ChatResponse } from '../../types/conversationalOrchestration';

import type { RecallResult, PersonaMode } from './types';

/**
 * Format recall result for chat response
 */
export function formatRecallChatResponse(
  recall: RecallResult,
  persona?: PersonaMode
): ChatResponse {
  const isLowConfidence = recall.confidence < 0.5;

  let messageText: string;
  let responseMode: ChatResponse['response_mode'] = 'RECALL';

  if (persona === 'ARCHIVIST') {
    messageText = buildArchivistRecallText(recall);
    responseMode = 'RECALL';
  } else if (recall.silence) {
    messageText = recall.silence.message;
    responseMode = 'SILENCE';
  } else if (isLowConfidence) {
    messageText =
      'This appears loosely similar to a few past moments, though the match is tentative.';
  } else {
    messageText =
      'This closely resembles a few past moments that share similar context.';
  }

  // Add entry summaries if available
  if (recall.entries.length > 0 && persona !== 'ARCHIVIST') {
    const summaries = recall.entries
      .slice(0, 3)
      .map((entry, index) => {
        const date = new Date(entry.date).toLocaleDateString();
        const preview = entry.content.substring(0, 80);
        return `${index + 1}. [${date}] ${preview}${entry.content.length > 80 ? '...' : ''}`;
      })
      .join('\n');

    if (summaries) {
      messageText += '\n\n**Relevant moments:**\n' + summaries;
    }
  }

  return {
    content: messageText,
    response_mode: responseMode,
    confidence: recall.confidence,
    confidence_label: isLowConfidence ? 'Tentative' : 'Strong match',
    disclaimer: recall.explanation,
    recall_sources: recall.entries.map((entry) => ({
      entry_id: entry.id,
      timestamp: entry.date,
      summary: entry.content.substring(0, 200),
      emotions: entry.emotions,
      themes: entry.themes,
      entities: entry.people,
    })),
    recall_meta: {
      persona: persona || 'DEFAULT',
      recall_type: recall.silence ? 'SILENCE' : 'RECALL',
    },
  };
}

/**
 * Build Archivist-safe recall text (factual only)
 */
function buildArchivistRecallText(recall: RecallResult): string {
  if (recall.entries.length === 0) {
    return 'No prior entries matching this query were found.';
  }

  const entries = recall.entries
    .map((entry) => {
      const date = new Date(entry.date).toLocaleDateString();
      const preview = entry.content.substring(0, 100);
      return `• ${date} — ${preview}${entry.content.length > 100 ? '...' : ''}`;
    })
    .join('\n');

  return `Relevant past entries were found at the following times:\n\n${entries}`;
}

