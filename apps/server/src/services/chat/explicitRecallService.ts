/**
 * Explicit Recall Service — Sprint AF / AH
 *
 * Retrieval order:
 *   1. Current thread (threadRecallService)
 *   2. Structured foundation (recallQueryRouter)
 *   3. Journal semantic search (memoryRecallEngine)
 */

import { queryEngine } from '../../cognition/query/QueryEngine';
import type { QueryContext } from '../../cognition/query/QueryTypes';
import type { RecallResult as RoutedRecall } from './recallQueryRouter';
import { detectSyncRecallIntent, isFoundationPrimaryIntent } from './recallIntentPatterns';
import { VERIFIED_SILENCE_FALLBACK } from './verifiedMemoryLanguage';
import {
  buildThreadRecall,
  matchesThreadRecallQuery,
  THREAD_RECALL_RE,
} from './threadRecallService';
import type { RecallResult as JournalRecall } from '../memoryRecall/types';

export type ExplicitRecallResponse = {
  content: string;
  response_mode: string;
  confidence: number;
  metadata?: Record<string, unknown>;
};

type ThreadRecall = Awaited<ReturnType<typeof buildThreadRecall>>;

export async function executeExplicitRecall(
  userId: string,
  message: string,
  conversationHistory: Array<{ role: string; content: string }> = [],
  options: { threadId?: string } = {}
): Promise<ExplicitRecallResponse> {
  // All retrieval runs through the Query Engine's executors. The decision
  // tree below is unchanged — the engine is the execution layer, this
  // function remains the (legacy) answer policy.
  const engineInput = { userId, message, conversationHistory, threadId: options.threadId };
  const ctx: QueryContext = queryEngine.buildContext(engineInput, queryEngine.plan(engineInput));
  const runThread = async () => (await queryEngine.executeKind('thread', ctx)).raw as ThreadRecall;

  const isThreadQuery =
    matchesThreadRecallQuery(message) || THREAD_RECALL_RE.test(message.trim());
  const explicitFoundationIntent = detectSyncRecallIntent(message);

  // Thread context is useful for ordinary follow-ups, but it must never
  // outrank an explicit foundation request. In particular, "Who am I?" is a
  // longitudinal biography query even when asked in the middle of an active
  // conversation; returning the thread here collapses a life into recent chat.
  if (isThreadQuery || (conversationHistory.length > 0 && !explicitFoundationIntent)) {
    const thread = await runThread();

    if (thread.hasContent) {
      return {
        content: thread.content,
        response_mode: 'THREAD_RECALL',
        confidence: thread.confidence,
        metadata: { recall_intent: 'thread', thread_first: true },
      };
    }

    // Thread query with empty history — still return thread response, skip journal
    if (isThreadQuery) {
      return {
        content: thread.content,
        response_mode: 'THREAD_RECALL',
        confidence: thread.confidence,
        metadata: { recall_intent: 'thread', thread_first: true },
      };
    }
  }

  const routed = (await queryEngine.executeKind('structured', ctx)).raw as RoutedRecall;

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

  const journalRecall = (await queryEngine.executeKind('semantic', ctx)).raw as JournalRecall;

  // Never silence when thread had user messages
  const userTurns = conversationHistory.filter((m) => m.role === 'user');
  if (journalRecall.silence && !hasFoundationContent(routed)) {
    if (userTurns.length > 0) {
      const threadFallback = await runThread();
      return {
        content: threadFallback.content,
        response_mode: 'THREAD_RECALL',
        confidence: 0.85,
        metadata: { recall_intent: 'thread', fallback_from: 'journal_silence' },
      };
    }
    return {
      content: journalRecall.silence.message,
      response_mode: 'SILENCE',
      confidence: 1.0,
      metadata: { reason: journalRecall.silence.reason },
    };
  }

  const content = buildCombinedContent(routed, journalRecall);

  if (!content) {
    if (userTurns.length > 0) {
      const threadFallback = await runThread();
      return {
        content: threadFallback.content,
        response_mode: 'THREAD_RECALL',
        confidence: 0.8,
        metadata: { recall_intent: 'thread', fallback_from: 'empty_combined' },
      };
    }
    return {
      content: VERIFIED_SILENCE_FALLBACK,
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

  if (!isFoundationPrimaryIntent(routed.intent) && !routed.foundationPrimary) {
    const journal = formatJournalArchivist(journalRecall);
    if (journal) parts.push(journal);
  }

  return parts.join('\n\n');
}

function formatFoundationForChat(routed: RoutedRecall): string {
  const block = routed.contextBlock?.trim() ?? '';
  if (!block || !hasFoundationContent(routed)) return block;

  if (
    routed.intent === 'character_roster' ||
    routed.intent === 'character_list' ||
    routed.intent === 'family'
  ) {
    return block;
  }

  if (routed.intent === 'entity' || routed.intent === 'conversation' || routed.intent === 'thread') {
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
