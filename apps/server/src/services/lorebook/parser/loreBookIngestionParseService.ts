/**
 * LoreBook Parse Engine — per-message ingestion hook.
 * Deterministic parse + suggest_add seeds on each user chat message (non-blocking).
 */

import { logger } from '../../../logger';
import { buildCanonIndexForUser } from './canonIndexBuilder';
import { parseLoreBookText } from './loreBookParseEngine';
import type { LoreBookOperation, LoreBookParseResult } from './loreBookParserTypes';
import { applyParseOperations, type CorpusApplySummary } from './loreBookParseCorpusService';
import { publishLoreBookNotice } from './loreBookNoticeService';

export type IngestParseInput = {
  messageId: string;
  threadId?: string;
  /** chat_messages.id — used for client long-poll notice delivery */
  chatMessageId?: string;
};

export type IngestParseSummary = CorpusApplySummary & {
  linesParsed: number;
};

const MIN_INGEST_TEXT_LENGTH = 12;

function linesFromMessage(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lines = trimmed.split(/\n+/).map((l) => l.trim()).filter((l) => l.length >= MIN_INGEST_TEXT_LENGTH);
  return lines.length > 0 ? lines : trimmed.length >= MIN_INGEST_TEXT_LENGTH ? [trimmed] : [];
}

function mergeOperations(results: LoreBookParseResult[]): LoreBookOperation[] {
  const merged: LoreBookOperation[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    for (const op of [...result.operations, ...result.redirects]) {
      const key = JSON.stringify(op);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(op);
    }
  }
  return merged;
}

/**
 * Parse a user message and seed LoreBook suggestions (characters, places, skills, quests, projects).
 * Read-only parse; writes only through existing suggestion upsert paths.
 */
export async function ingestLoreBookParseFromMessage(
  userId: string,
  rawText: string,
  ctx: IngestParseInput
): Promise<IngestParseSummary> {
  const lines = linesFromMessage(rawText);
  if (lines.length === 0) {
    return { linesParsed: 0, operationsSeen: 0, applied: 0, skipped: 0, byDomain: {}, appliedItems: [] };
  }

  const canon = await buildCanonIndexForUser(userId).catch(() => undefined);
  const results: LoreBookParseResult[] = [];

  for (const line of lines) {
    results.push(
      parseLoreBookText({
        userId,
        text: line,
        canon,
        messageId: ctx.messageId,
        threadId: ctx.threadId,
      })
    );
  }

  const merged = mergeOperations(results);
  const apply = await applyParseOperations(userId, merged, {
    source: 'message_ingest',
    messageId: ctx.messageId,
  });

  const summary: IngestParseSummary = {
    ...apply,
    linesParsed: lines.length,
  };

  if (ctx.chatMessageId && summary.appliedItems.length > 0) {
    try {
      publishLoreBookNotice(ctx.chatMessageId, userId, summary.appliedItems);
    } catch (err) {
      logger.debug({ err, chatMessageId: ctx.chatMessageId }, 'LoreBook notice publish failed (non-blocking)');
    }
  }

  if (summary.applied > 0) {
    logger.info(
      { userId, messageId: ctx.messageId, summary, operationCount: merged.length },
      'LoreBook ingest parse applied suggestion seeds'
    );
  } else if (merged.length > 0) {
    logger.debug(
      { userId, messageId: ctx.messageId, operationsSeen: merged.length },
      'LoreBook ingest parse reviewed signals (none applied)'
    );
  }

  return summary;
}
