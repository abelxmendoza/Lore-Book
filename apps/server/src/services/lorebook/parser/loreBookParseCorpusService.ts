/**
 * Parse recent chat/journal corpus and apply LoreBookOperation seeds to suggestion pipelines.
 */

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';
import { omegaMemoryService } from '../../omegaMemoryService';
import { questSuggestionService } from '../../quests/questSuggestionService';
import { skillSuggestionService } from '../../skills/skillSuggestionService';
import { projectSuggestionService } from '../../projects/projectSuggestionService';
import { buildCanonIndexForUser } from './canonIndexBuilder';
import { parseLoreBookText } from './loreBookParseEngine';
import type {
  LoreBookDomain,
  LoreBookOperation,
  LoreBookParseResult,
} from './loreBookParserTypes';
import type { LoreBookAppliedItem } from './loreBookNoticeTypes';

export type CorpusApplySummary = {
  linesParsed: number;
  operationsSeen: number;
  applied: number;
  skipped: number;
  byDomain: Partial<Record<LoreBookDomain, number>>;
  appliedItems: LoreBookAppliedItem[];
};

export type ParseApplySource = 'corpus_rescan' | 'message_ingest';

const APPLY_SOURCE_LABEL: Record<ParseApplySource, string> = {
  corpus_rescan: 'LoreBook Parse Engine — corpus rescan',
  message_ingest: 'LoreBook Parse Engine — live chat message',
};

const APPLY_DOMAINS = new Set<LoreBookDomain>([
  'characters',
  'locations',
  'skills',
  'projects',
  'quests',
]);

export async function loadRecentCorpusLines(userId: string, limit = 80): Promise<string[]> {
  const [entriesRes, messagesRes] = await Promise.all([
    supabaseAdmin
      .from('journal_entries')
      .select('content')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(40),
    supabaseAdmin
      .from('chat_messages')
      .select('content')
      .eq('user_id', userId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(60),
  ]);

  const lines: string[] = [];
  for (const row of [...(messagesRes.data ?? []), ...(entriesRes.data ?? [])]) {
    const content = String((row as { content?: string }).content ?? '').trim();
    if (!content) continue;
    for (const line of content.split(/\n+/)) {
      const trimmed = line.trim();
      if (trimmed.length >= 12) lines.push(trimmed);
    }
  }

  return [...new Set(lines)].slice(0, limit);
}

export async function parseCorpusForUser(
  userId: string,
  lines?: string[]
): Promise<{ lines: string[]; results: LoreBookParseResult[]; merged: LoreBookOperation[] }> {
  const corpusLines = lines ?? (await loadRecentCorpusLines(userId));
  const canon = await buildCanonIndexForUser(userId);
  const results: LoreBookParseResult[] = [];
  const merged: LoreBookOperation[] = [];
  const seen = new Set<string>();

  for (const line of corpusLines) {
    const result = parseLoreBookText({ userId, text: line, canon });
    results.push(result);
    for (const op of [...result.operations, ...result.redirects]) {
      const key = JSON.stringify(op);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(op);
    }
  }

  return { lines: corpusLines, results, merged };
}

async function applySuggestAdd(
  userId: string,
  op: Extract<LoreBookOperation, { kind: 'suggest_add' }>,
  options: { source: ParseApplySource; messageId?: string }
): Promise<boolean> {
  if (op.gate === 'block') return false;
  if (!APPLY_DOMAINS.has(op.domain)) return false;

  const name = op.name.trim();
  if (!name) return false;

  const reasoning = APPLY_SOURCE_LABEL[options.source];

  try {
    switch (op.domain) {
      case 'quests':
        await questSuggestionService.upsertFromExtraction(
          userId,
          {
            title: name,
            description: op.evidence.quote,
            quest_type: 'side',
            confidence: op.confidence,
            reasoning,
          },
          { source: 'chat', sourceMessageId: options.messageId }
        );
        return true;
      case 'skills':
        await skillSuggestionService.upsertFromExtraction(
          userId,
          {
            skill_name: name,
            skill_category: 'other',
            skill_type: 'professional',
            monetization: 'unpaid',
            proficiency: 50,
            confidence: op.confidence,
            enjoyment: 50,
            usage_frequency: 'rarely',
            trajectory: 'unknown',
            description: op.evidence.quote,
            evidence: [op.evidence.quote],
          },
          { source: 'chat', sourceMessageId: options.messageId }
        );
        return true;
      case 'projects':
        await projectSuggestionService.upsertManyFromExtraction(
          userId,
          [
            {
              name,
              description: op.evidence.quote,
              type: 'project',
              confidence: op.confidence,
              reasoning,
              evidence: [op.evidence.quote],
            },
          ],
          { source: 'chat', sourceMessageId: options.messageId }
        );
        return true;
      case 'characters':
        await omegaMemoryService.createEntity(userId, name, 'PERSON');
        return true;
      case 'locations':
        await omegaMemoryService.createEntity(userId, name, 'LOCATION');
        return true;
      default:
        return false;
    }
  } catch (err) {
    logger.debug({ err, userId, domain: op.domain, name }, 'LoreBook parse apply failed (non-blocking)');
    return false;
  }
}

export async function applyParseOperations(
  userId: string,
  operations: LoreBookOperation[],
  options: { source?: ParseApplySource; messageId?: string } = {}
): Promise<CorpusApplySummary> {
  const source = options.source ?? 'corpus_rescan';
  const summary: CorpusApplySummary = {
    linesParsed: 0,
    operationsSeen: operations.length,
    applied: 0,
    skipped: 0,
    byDomain: {},
    appliedItems: [],
  };
  const seenApplied = new Set<string>();

  for (const op of operations) {
    if (op.kind !== 'suggest_add') {
      summary.skipped += 1;
      continue;
    }
    const applied = await applySuggestAdd(userId, op, { source, messageId: options.messageId });
    if (applied) {
      summary.applied += 1;
      summary.byDomain[op.domain] = (summary.byDomain[op.domain] ?? 0) + 1;
      const name = op.name.trim();
      const dedupeKey = `${op.domain}:${name.toLowerCase()}`;
      if (name && !seenApplied.has(dedupeKey)) {
        seenApplied.add(dedupeKey);
        summary.appliedItems.push({ domain: op.domain, name, confidence: op.confidence });
      }
    } else {
      summary.skipped += 1;
    }
  }

  return summary;
}

export async function runCorpusParseAndApply(userId: string): Promise<{
  parse: Awaited<ReturnType<typeof parseCorpusForUser>>;
  apply: CorpusApplySummary;
}> {
  const parse = await parseCorpusForUser(userId);
  const apply = await applyParseOperations(userId, parse.merged, { source: 'corpus_rescan' });
  apply.linesParsed = parse.lines.length;
  logger.info({ userId, apply, operationCount: parse.merged.length }, 'LoreBook corpus parse and apply');
  return { parse, apply };
}
