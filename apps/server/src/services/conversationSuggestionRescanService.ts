/**
 * Unified conversation rescan — re-runs lexical intelligence and domain extractors
 * across chat + journal history for suggestion books (characters, quests, skills, etc.).
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

export type SuggestionDomain =
  | 'characters'
  | 'quests'
  | 'skills'
  | 'projects'
  | 'locations'
  | 'romantic';

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

async function loadRecentCorpus(userId: string): Promise<Array<{ content: string; date: string }>> {
  const [entriesRes, messagesRes] = await Promise.all([
    supabaseAdmin
      .from('journal_entries')
      .select('content, date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(40),
    supabaseAdmin
      .from('chat_messages')
      .select('content, created_at')
      .eq('user_id', userId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(60),
  ]);

  return [
    ...((messagesRes.data as Array<{ content: string; created_at: string }> | null) ?? []).map((m) => ({
      content: m.content,
      date: m.created_at,
    })),
    ...((entriesRes.data as Array<{ content: string; date: string }> | null) ?? []).map((e) => ({
      content: e.content,
      date: e.date,
    })),
  ]
    .filter((e) => e.content?.trim())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function rescanQuests(userId: string): Promise<{ scanned: boolean; upserted: number }> {
  const existing = await questStorage.getQuests(userId, { status: ['active', 'paused'] });
  const haveTitles = new Set(existing.map((q) => q.title.trim().toLowerCase()));
  const combined = await loadRecentCorpus(userId);
  const extracted = await questExtractor.extractQuests(userId, combined);
  let upserted = 0;
  for (const q of extracted) {
    if (!q.title?.trim() || haveTitles.has(q.title.trim().toLowerCase())) continue;
    await questSuggestionService.upsertFromExtraction(
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
      { source: 'llm_scan' }
    );
    upserted += 1;
  }
  return { scanned: true, upserted };
}

async function rescanSkills(userId: string): Promise<{ scanned: boolean; upserted: number }> {
  const existing = await skillService.getSkills(userId, { active_only: false });
  const haveNames = new Set(existing.map((s) => s.skill_name.toLowerCase()));
  const combined = await loadRecentCorpus(userId);
  const text = combined
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
    await skillRelationshipService.resolvePendingParentLinks(userId);
  }
  return { scanned: true, upserted };
}

async function rescanProjects(userId: string): Promise<{ scanned: boolean; upserted: number }> {
  const existing = await projectService.listProjects(userId);
  const haveNames = new Set(existing.map((p) => p.normalized_name ?? p.name.trim().toLowerCase()));
  const combined = await loadRecentCorpus(userId);
  const extracted = await projectExtractor.extractProjects(userId, combined);
  const unseen = extracted
    .filter((p) => !haveNames.has(p.name.trim().toLowerCase().replace(/\s+/g, ' ')))
    .map((p) => ({ ...p, reasoning: p.reasoning ?? 'Detected from your recent journals and chats' }));
  await projectSuggestionService.upsertManyFromExtraction(userId, unseen, { source: 'llm_scan' });
  return { scanned: true, upserted: unseen.length };
}

async function rescanLocations(userId: string): Promise<{ scanned: boolean; count: number }> {
  const suggestions = await locationSuggestionService.rescanFromCorpus(userId);
  return { scanned: true, count: suggestions.length };
}

async function rescanRomantic(userId: string): Promise<{ scanned: boolean; summary: unknown }> {
  const { romanticConversationRescanService } = await import('./romanticConversationRescanService');
  const summary = await romanticConversationRescanService.rescan(userId);
  return { scanned: true, summary };
}

class ConversationSuggestionRescanService {
  async rescan(
    userId: string,
    domains: SuggestionDomain[],
    opts: { incremental?: boolean; cardCleanup?: boolean; cardAudit?: boolean; fullRescan?: boolean } = {},
  ): Promise<SuggestionRescanSummary> {
    const unique = [...new Set(domains)];
    const results: SuggestionRescanSummary['results'] = {};

    let lorebookParse: SuggestionRescanSummary['lorebookParse'];
    try {
      const { apply } = await runCorpusParseAndApply(userId);
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
                incremental: opts.incremental,
                cardCleanup: opts.cardCleanup,
                cardAudit: opts.cardAudit !== false,
                fullRescan: opts.fullRescan,
              });
              break;
            case 'quests':
              results.quests = await rescanQuests(userId);
              break;
            case 'skills':
              results.skills = await rescanSkills(userId);
              break;
            case 'projects':
              results.projects = await rescanProjects(userId);
              break;
            case 'locations':
              results.locations = await rescanLocations(userId);
              break;
            case 'romantic':
              results.romantic = await rescanRomantic(userId);
              break;
            default:
              break;
          }
        } catch (err) {
          logger.warn({ err, userId, domain }, 'Suggestion domain rescan failed');
          results[domain] = { scanned: false, error: err instanceof Error ? err.message : 'Rescan failed' };
        }
      })
    );

    logger.info({ userId, domains: unique, results, lorebookParse }, 'Conversation suggestion rescan completed');
    return { domains: unique, lorebookParse, results };
  }
}

export const conversationSuggestionRescanService = new ConversationSuggestionRescanService();
