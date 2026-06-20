/**
 * LoreBook Parse Engine — converts Lexical Intelligence spans into book-aware operations.
 * Phase 0: read-only — no DB writes.
 */

import { runLexicalIntelligence } from '../../lexical/intelligence/lexicalIntelligenceService';
import {
  buildCanonIndexFromSeed,
  createCanonCrossBookIndex,
  type CanonSeed,
} from './canonIndexBuilder';
import { collectRulesFired, initParseDebug, mapSpansToOperations, partitionOperations } from './spanToOperationMapper';
import type { LoreBookParseOptions, LoreBookParseResult } from './loreBookParserTypes';

export type ParseLoreBookTextInput = LoreBookParseOptions & {
  userId: string;
  text: string;
  canonSeed?: CanonSeed;
};

/**
 * Parse text into LoreBook operations.
 * Lexical Intelligence → span mapping → LoreBookOperation[].
 */
export function parseLoreBookText(input: ParseLoreBookTextInput): LoreBookParseResult {
  const { userId, text, messageId, threadId, includeDebug = false, lexicalSpans, canonSeed } = input;
  const trimmed = text.trim();
  const warnings: string[] = [];

  if (!trimmed) {
    return {
      userId,
      text,
      lexicalSpans: [],
      operations: [],
      suppressed: [],
      redirects: [],
      warnings: ['empty_text'],
    };
  }

  const canon = input.canon ?? buildCanonIndexFromSeed(canonSeed);
  const crossBook = createCanonCrossBookIndex(canon);
  const debug = includeDebug ? initParseDebug() : undefined;

  const lexicalResult =
    lexicalSpans != null
      ? { spans: lexicalSpans, rulesFired: [], overlapsResolved: [], missedCandidates: [], warnings: [] }
      : runLexicalIntelligence({
          text: trimmed,
          userId,
          analyzerMode: 'lite',
          includeAnalyzerEntities: true,
          includeAlternatives: true,
        });

  if (lexicalResult.warnings?.length) {
    warnings.push(...lexicalResult.warnings.map((w) => `lexical:${w}`));
  }

  const ctx = {
    userId,
    text: trimmed,
    canon,
    crossBook,
    messageId,
    threadId,
    debug,
  };

  const allOps = mapSpansToOperations(lexicalResult.spans, ctx);
  const { active, suppressed, redirects } = partitionOperations(allOps);

  if (debug) {
    debug.rulesFired = collectRulesFired(active);
  }

  return {
    userId,
    text: trimmed,
    lexicalSpans: lexicalResult.spans,
    operations: active,
    suppressed,
    redirects,
    warnings,
    debug: includeDebug ? debug : undefined,
  };
}

/** Async entry — loads user canon from DB when no canon supplied. Read-only. */
export async function parseLoreBookTextForUser(
  userId: string,
  text: string,
  options: LoreBookParseOptions & { canonSeed?: CanonSeed } = {}
): Promise<LoreBookParseResult> {
  if (options.canon) {
    return parseLoreBookText({ userId, text, ...options });
  }

  const { buildCanonIndexForUser } = await import('./canonIndexBuilder');
  const canon = await buildCanonIndexForUser(userId, options.canonSeed);
  return parseLoreBookText({ userId, text, ...options, canon });
}

export { parseLoreBookText as loreBookParseEngine };
