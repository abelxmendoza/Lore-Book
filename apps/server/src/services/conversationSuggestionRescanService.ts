/**
 * Unified conversation rescan — re-runs lexical intelligence and domain extractors
 * across chat + journal history for suggestion books (characters, quests, skills, etc.).
 *
 * Cost rules:
 * - Load the recent corpus once and share it.
 * - Seed every book from a single LoreBook lexical parse.
 * - Run only the requested domain extractors (no emotion/media/timeline side pipelines).
 * - Skip LLM nickname/extraction passes unless `fullRescan` is set.
 */

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import { characterConversationRescanService } from './characterConversationRescanService';
import { questExtractor } from './quests/questExtractor';
import { questSuggestionService } from './quests/questSuggestionService';
import { questStorage } from './quests/questStorage';
import { skillExtractionService } from './skills/skillExtractionService';
import { skillRelationshipService } from './skills/skillRelationshipService';
import { skillService } from './skills/skillService';
import { skillSuggestionService } from './skills/skillSuggestionService';
import { projectExtractor } from './projects/projectExtractor';
import { projectService } from './projectService';
import { projectSuggestionService } from './projects/projectSuggestionService';
import { locationSuggestionService } from './locationSuggestionService';
import { runCorpusParseAndApply } from './lorebook/parser/loreBookParseCorpusService';
import { mapSuggestionDomainsToApplyDomains } from './lorebook/suggestions/suggestionApplyDomains';
import { withSuggestionWriteContext } from './lorebook/suggestions/suggestionWriteContext';

export const SUGGESTION_DOMAINS = [
  'characters',
  'quests',
  'skills',
  'projects',
  'locations',
  'romantic',
  'organizations',
] as const;

export type SuggestionDomain = (typeof SUGGESTION_DOMAINS)[number];

export type SuggestionRescanOptions = {
  incremental?: boolean;
  cardCleanup?: boolean;
  cardAudit?: boolean;
  fullRescan?: boolean;
};

export type CorpusEntry = { id: string; content: string; date: string };

export type SuggestionRescanSummary = {
  domains: SuggestionDomain[];
  lorebookParse?: {
    linesParsed: number;
    operationsSeen: number;
    applied: number;
    skipped: number;
    byDomain: Record<string, number>;
  };
  results: Partial<
    Record<
      SuggestionDomain,
      {
        scanned?: boolean;
        count?: number;
        [key: string]: unknown;
      }
    >
  >;
};

const INCREMENTAL_GROUP_DAYS = 21;
const INCREMENTAL_GROUP_CAP = 80;
const FULL_GROUP_DAYS = 90;
const FULL_GROUP_CAP = 120;

export function corpusToParseLines(corpus: CorpusEntry[], limit = 80): string[] {
  const lines: string[] = [];
  for (const entry of corpus) {
    for (const line of entry.content.split(/\n+/)) {
      const trimmed = line.trim();
      if (trimmed.length >= 12) lines.push(trimmed);
    }
  }
  return [...new Set(lines)].slice(0, limit);
}

async function loadRecentCorpus(userId: string): Promise<CorpusEntry[]> {
  const [entriesRes, messagesRes] = await Promise.all([
    supabaseAdmin
      .from('journal_entries')
      .select('id, content, date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(40),
    supabaseAdmin
      .from('chat_messages')
      .select('id, content, created_at')
      .eq('user_id', userId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(60),
  ]);

  return [
    ...((messagesRes.data as Array<{ id: string; content: string; created_at: string }> | null) ?? []).map((m) => ({
      id: m.id,
      content: m.content,
      date: m.created_at,
    })),
    ...((entriesRes.data as Array<{ id: string; content: string; date: string }> | null) ?? []).map((e) => ({
      id: e.id,
      content: e.content,
      date: e.date,
    })),
  ]
    .filter((e) => e.content?.trim())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function rescanQuests(
  userId: string,
  corpus: CorpusEntry[],
): Promise<{ scanned: boolean; upserted: number }> {
  const existing = await questStorage.getQuests(userId, { status: ['active', 'paused'] });
  const haveTitles = new Set(existing.map((q) => q.title.trim().toLowerCase()));
  const extracted = await questExtractor.extractQuests(userId, corpus);
  let upserted = 0;
  for (const q of extracted) {
    if (!q.title?.trim() || haveTitles.has(q.title.trim().toLowerCase())) continue;
    const saved = await questSuggestionService.upsertFromExtraction(
      userId,
      {
        title: q.title,
        description: q.description,
        quest_type: q.quest_type,
        priority: q.priority,
        importance: q.importance,
        impact: q.impact,
        category: q.category,
        confidence: 0.72,
        reasoning: 'Detected from your recent journals and chats',
      },
      {
        source: 'llm_scan',
        sourceText:
          typeof q.metadata?.source_text === 'string' ? q.metadata.source_text : undefined,
      }
    );
    if (saved) upserted += 1;
  }
  return { scanned: true, upserted };
}

async function rescanSkills(
  userId: string,
  corpus: CorpusEntry[],
): Promise<{ scanned: boolean; upserted: number }> {
  const existing = await skillService.getSkills(userId, { active_only: false });
  const haveNames = new Set(existing.map((s) => s.skill_name.toLowerCase()));
  const text = corpus
    .map((e) => e.content)
    .filter(Boolean)
    .join('\n')
    .slice(0, 12000);
  let upserted = 0;
  if (text.trim()) {
    const detected = await skillExtractionService.extractSkillsFromEntry(userId, 'suggestions-rescan', text);
    for (const s of detected) {
      if (!s.skill_name?.trim() || haveNames.has(s.skill_name.toLowerCase())) continue;
      await skillSuggestionService.upsertFromExtraction(userId, s, { source: 'llm_scan' });
      upserted += 1;
    }
  }
  await skillRelationshipService.resolvePendingParentLinks(userId);
  return { scanned: true, upserted };
}

async function rescanProjects(
  userId: string,
  corpus: CorpusEntry[],
): Promise<{ scanned: boolean; upserted: number }> {
  const existing = await projectService.listProjects(userId);
  const haveNames = new Set(existing.map((p) => p.normalized_name ?? p.name.trim().toLowerCase()));
  const extracted = await projectExtractor.extractProjects(userId, corpus);
  const unseen = extracted
    .filter((p) => !haveNames.has(p.name.trim().toLowerCase().replace(/\s+/g, ' ')))
    .map((p) => ({ ...p, reasoning: p.reasoning ?? 'Detected from your recent journals and chats' }));
  await projectSuggestionService.upsertManyFromExtraction(userId, unseen, { source: 'llm_scan' });
  return { scanned: true, upserted: unseen.length };
}

async function rescanLocations(
  userId: string,
  opts: SuggestionRescanOptions,
): Promise<{ scanned: boolean; count: number; skipAi: boolean }> {
  const skipAi = opts.fullRescan !== true;
  const suggestions = await locationSuggestionService.rescanFromCorpus(userId, { skipAi });
  return { scanned: true, count: suggestions.length, skipAi };
}

async function rescanRomantic(userId: string): Promise<{ scanned: boolean; summary: unknown }> {
  const { romanticConversationRescanService } = await import('./romanticConversationRescanService');
  const summary = await romanticConversationRescanService.rescan(userId);
  return { scanned: true, summary };
}

async function rescanOrganizations(
  userId: string,
  corpus: CorpusEntry[],
  opts: SuggestionRescanOptions,
): Promise<{
  scanned: boolean;
  omegaPromoted: number;
  groupScanDays: number;
  inferenceUpserted: number;
}> {
  const { omegaOrgPromotionService } = await import('./entities/omegaOrgPromotionService');
  const omega = await omegaOrgPromotionService.backfillForUser(userId);

  const days = opts.fullRescan ? FULL_GROUP_DAYS : INCREMENTAL_GROUP_DAYS;
  const cap = opts.fullRescan ? FULL_GROUP_CAP : INCREMENTAL_GROUP_CAP;
  const { groupDetectionWorker } = await import('../workers/groupDetectionWorker');
  await groupDetectionWorker.runForUser(userId, days, cap);

  const { rescanOrganizationInference } = await import(
    './organizations/inference/organizationInferenceIntegrationService'
  );
  const inference = await rescanOrganizationInference(
    userId,
    corpus.map((e) => ({ id: e.id, text: e.content })),
  );

  return {
    scanned: true,
    omegaPromoted: omega.promoted,
    groupScanDays: days,
    inferenceUpserted: inference.suggestionsUpserted,
  };
}

class ConversationSuggestionRescanService {
  async rescan(
    userId: string,
    domains: SuggestionDomain[],
    opts: SuggestionRescanOptions = {},
  ): Promise<SuggestionRescanSummary> {
    const unique = [...new Set(domains)];
    const results: SuggestionRescanSummary['results'] = {};
    const corpus = await loadRecentCorpus(userId);

    return withSuggestionWriteContext(
      userId,
      async () => {
        let lorebookParse: SuggestionRescanSummary['lorebookParse'];
        try {
          const { apply } = await runCorpusParseAndApply(userId, {
            lines: corpusToParseLines(corpus),
            applyDomains: mapSuggestionDomainsToApplyDomains(unique),
          });
          lorebookParse = {
            linesParsed: apply.linesParsed,
            operationsSeen: apply.operationsSeen,
            applied: apply.applied,
            skipped: apply.skipped,
            byDomain: apply.byDomain as Record<string, number>,
          };
        } catch (err) {
          logger.warn({ err, userId }, 'LoreBook corpus parse failed (continuing domain rescans)');
        }

        await Promise.all(
          unique.map(async (domain) => {
            try {
              switch (domain) {
                case 'characters':
                  results.characters = await characterConversationRescanService.rescan(userId, {
                    incremental: opts.fullRescan ? false : opts.incremental !== false,
                    cardCleanup: opts.cardCleanup,
                    cardAudit: opts.fullRescan === true || opts.cardAudit === true,
                    fullRescan: opts.fullRescan,
                  });
                  break;
                case 'quests':
                  results.quests = await rescanQuests(userId, corpus);
                  break;
                case 'skills':
                  results.skills = await rescanSkills(userId, corpus);
                  break;
                case 'projects':
                  results.projects = await rescanProjects(userId, corpus);
                  break;
                case 'locations':
                  results.locations = await rescanLocations(userId, opts);
                  break;
                case 'romantic':
                  results.romantic = await rescanRomantic(userId);
                  break;
                case 'organizations':
                  results.organizations = await rescanOrganizations(userId, corpus, opts);
                  break;
                default:
                  break;
              }
            } catch (err) {
              logger.warn({ err, userId, domain }, 'Suggestion domain rescan failed');
              results[domain] = { scanned: false, error: err instanceof Error ? err.message : 'Rescan failed' };
            }
          }),
        );

        logger.info({ userId, domains: unique, results, lorebookParse }, 'Conversation suggestion rescan completed');
        return { domains: unique, lorebookParse, results };
      },
      { applyDomains: mapSuggestionDomainsToApplyDomains(unique) },
    );
  }
}

export const conversationSuggestionRescanService = new ConversationSuggestionRescanService();
