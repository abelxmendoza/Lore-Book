/**
 * Explicit Recall Service — Sprint AF
 *
 * Returns structured foundation data directly. Raw journal snippets are only
 * appended for biography/general queries — never for roster, family, or entity.
 */

import { routeRecallQuery, type RecallResult as RoutedRecall } from './recallQueryRouter';
import { isFoundationPrimaryIntent } from './recallIntentPatterns';
import type { RecallResult as JournalRecall } from '../memoryRecall/types';

export type ExplicitRecallResponse = {
  content: string;
  response_mode: string;
  confidence: number;
  metadata?: Record<string, unknown>;
};

export async function executeExplicitRecall(
  userId: string,
  message: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<ExplicitRecallResponse> {
  const routed = await routeRecallQuery(userId, message, conversationHistory);

  // Foundation-primary intents never fall back to journal snippets
  if (routed.foundationPrimary && hasFoundationContent(routed)) {
    return {
      content: formatFoundationForChat(routed),
      response_mode: 'RECALL',
      confidence: routed.confidence,
      metadata: {
        recall_intent: routed.intent,
        entity_name: routed.entityName,
        foundation_primary: true,
      },
    };
  }

  const { memoryRecallEngine } = await import('../memoryRecall/memoryRecallEngine');
  const journalRecall = await memoryRecallEngine.executeRecall({
    raw_text: message,
    user_id: userId,
    persona: 'ARCHIVIST',
  });

  if (journalRecall.silence && !hasFoundationContent(routed)) {
    return {
      content: journalRecall.silence.message,
      response_mode: 'SILENCE',
      confidence: 1.0,
      metadata: { reason: journalRecall.silence.reason },
    };
  }

  const content = buildCombinedContent(routed, journalRecall);

  if (!content) {
    return {
      content:
        "We haven't talked about that yet — tell me about it and it becomes part of your record.",
      response_mode: 'SILENCE',
      confidence: 0.3,
    };
  }

  return {
    content,
    response_mode: 'RECALL',
    confidence: Math.max(routed.confidence, journalRecall.confidence),
    metadata: {
      recall_intent: routed.intent,
      entity_name: routed.entityName,
      recall_sources: journalRecall.entries.map((entry) => ({
        entry_id: entry.id,
        timestamp: entry.date,
        summary: entry.content.substring(0, 200),
      })),
    },
  };
}

function hasFoundationContent(routed: RoutedRecall): boolean {
  const block = routed.contextBlock?.trim() ?? '';
  if (!block) return false;
  const emptyMarkers = [
    'No biography snapshot yet.',
    'No biography data available yet.',
    'No characters recorded yet.',
    'No family members recorded yet.',
    'No character record found for',
  ];
  return !emptyMarkers.some((m) => block.startsWith(m) || block === m);
}

function buildCombinedContent(routed: RoutedRecall, journalRecall: JournalRecall): string {
  const parts: string[] = [];

  const foundation = formatFoundationForChat(routed);
  if (foundation) parts.push(foundation);

  // Journal supplement only when foundation is not the primary surface
  if (!isFoundationPrimaryIntent(routed.intent) && !routed.foundationPrimary) {
    const journal = formatJournalArchivist(journalRecall);
    if (journal) parts.push(journal);
  }

  return parts.join('\n\n');
}

function formatFoundationForChat(routed: RoutedRecall): string {
  const block = routed.contextBlock?.trim() ?? '';
  if (!block || !hasFoundationContent(routed)) return block;

  // Character roster and family responses are already chat-formatted
  if (routed.intent === 'character_roster' || routed.intent === 'character_list' || routed.intent === 'family') {
    return block;
  }

  if (routed.intent === 'entity') {
    return block;
  }

  if (routed.intent === 'biography') {
    const cleaned = block.replace(/^## BIOGRAPHY\s*/i, '').trim();
    return cleaned ? `What I know about you:\n\n${cleaned}` : '';
  }

  return block.replace(/^##\s*/gm, '').trim();
}

function formatJournalArchivist(journalRecall: JournalRecall): string {
  if (journalRecall.entries.length === 0) return '';

  const entries = journalRecall.entries
    .slice(0, 5)
    .map((entry) => {
      const date = new Date(entry.date).toLocaleDateString();
      const preview = entry.content.substring(0, 120);
      return `• ${date} — ${preview}${entry.content.length > 120 ? '...' : ''}`;
    })
    .join('\n');

  return `Relevant past entries were found at the following times:\n\n${entries}`;
}
