import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { clampQuestScore, normalizeQuestType } from '../../utils/questNormalize';

import { questExtractor } from './questExtractor';
import { questService } from './questService';
import { questStorage } from './questStorage';
import type { CreateQuestInput, Quest, QuestType } from './types';

export type QuestSuggestionRow = {
  id: string;
  title: string;
  description?: string | null;
  quest_type: QuestType;
  priority: number;
  importance: number;
  impact: number;
  category?: string | null;
  confidence: number;
  reasoning?: string | null;
  evidence?: Array<{ text: string } | string>;
  source?: string;
  source_message_id?: string | null;
};

export type MaterializeQuestInput = {
  title: string;
  description?: string | null;
  quest_type: QuestType;
  priority?: number;
  importance?: number;
  impact?: number;
  category?: string | null;
  suggestionId?: string;
  sourceMessageId?: string | null;
};

function isTableMissing(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'PGRST205';
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

class QuestSuggestionService {
  async upsertFromExtraction(
    userId: string,
    extracted: {
      title: string;
      description?: string;
      quest_type?: string;
      priority?: number;
      importance?: number;
      impact?: number;
      category?: string;
      confidence?: number;
      reasoning?: string;
    },
    opts: { sourceMessageId?: string; source?: 'chat' | 'journal' | 'llm_scan' } = {}
  ): Promise<void> {
    const title = extracted.title?.trim();
    if (!title || (extracted.confidence ?? 0.72) < 0.45) return;

    const payload = {
      user_id: userId,
      title,
      description: extracted.description ?? null,
      quest_type: normalizeQuestType(extracted.quest_type ?? 'side'),
      priority: clampQuestScore(extracted.priority),
      importance: clampQuestScore(extracted.importance),
      impact: clampQuestScore(extracted.impact),
      category: extracted.category ?? null,
      confidence: Math.max(0, Math.min(1, Number(extracted.confidence ?? 0.72))),
      reasoning: extracted.reasoning ?? null,
      source_message_id: opts.sourceMessageId ?? null,
      source: opts.source ?? 'chat',
      status: 'pending',
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from('quest_suggestions')
      .upsert(payload, { onConflict: 'user_id,title' });

    if (error && !isTableMissing(error)) {
      logger.warn({ error, userId, title }, 'Failed to upsert quest suggestion');
    }
  }

  async getPendingSuggestions(userId: string): Promise<QuestSuggestionRow[]> {
    const { data, error } = await supabaseAdmin
      .from('quest_suggestions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('confidence', { ascending: false })
      .limit(24);

    if (error) {
      if (isTableMissing(error)) return [];
      logger.warn({ error, userId }, 'Failed to load quest suggestions');
      return [];
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      quest_type: normalizeQuestType(row.quest_type),
      priority: row.priority,
      importance: row.importance,
      impact: row.impact,
      category: row.category,
      confidence: Number(row.confidence),
      reasoning: row.reasoning,
      evidence: row.evidence ?? [],
      source: row.source ?? 'chat',
      source_message_id: row.source_message_id,
    }));
  }

  async hasAnySuggestions(userId: string): Promise<boolean> {
    const { count, error } = await supabaseAdmin
      .from('quest_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (error) {
      if (isTableMissing(error)) return false;
      return false;
    }
    return (count ?? 0) > 0;
  }

  async rejectSuggestion(userId: string, suggestionId: string): Promise<void> {
    await supabaseAdmin
      .from('quest_suggestions')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', suggestionId);
  }

  async rejectByTitle(userId: string, title: string): Promise<void> {
    const key = normalizeTitle(title);
    const pending = await this.getPendingSuggestions(userId);
    const match = pending.find((p) => normalizeTitle(p.title) === key);
    if (match) {
      await this.rejectSuggestion(userId, match.id);
      return;
    }
    const { error } = await supabaseAdmin.from('quest_suggestions').upsert(
      {
        user_id: userId,
        title: title.trim(),
        quest_type: 'side',
        status: 'rejected',
        confidence: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,title' }
    );
    if (error && !isTableMissing(error)) {
      logger.debug({ error, userId, title }, 'rejectByTitle upsert failed');
    }
  }

  async materializeQuest(userId: string, input: MaterializeQuestInput): Promise<Quest> {
    const existing = await questStorage.getQuests(userId, { status: ['active', 'paused'] });
    const duplicate = existing.find((q) => normalizeTitle(q.title) === normalizeTitle(input.title));
    if (duplicate) {
      if (input.suggestionId) {
        await supabaseAdmin
          .from('quest_suggestions')
          .update({ status: 'confirmed', updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('id', input.suggestionId);
      }
      return duplicate;
    }

    const questData: CreateQuestInput = {
      title: input.title.trim(),
      description: input.description ?? undefined,
      quest_type: input.quest_type,
      priority: clampQuestScore(input.priority),
      importance: clampQuestScore(input.importance),
      impact: clampQuestScore(input.impact),
      category: input.category ?? undefined,
      source: 'suggested',
      metadata: {
        suggestion_id: input.suggestionId,
        source_message_id: input.sourceMessageId,
        materialized_at: new Date().toISOString(),
      },
    };

    const quest = await questService.createQuest(userId, questData);

    if (input.suggestionId) {
      await supabaseAdmin
        .from('quest_suggestions')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', input.suggestionId);
    } else {
      try {
        await supabaseAdmin
          .from('quest_suggestions')
          .update({ status: 'confirmed', updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .ilike('title', input.title.trim());
      } catch {
        /* non-blocking */
      }
    }

    return quest;
  }

  async confirmSuggestion(userId: string, suggestionId: string): Promise<Quest> {
    const { data: suggestion } = await supabaseAdmin
      .from('quest_suggestions')
      .select('*')
      .eq('user_id', userId)
      .eq('id', suggestionId)
      .single();

    if (!suggestion) throw new Error('Suggestion not found');

    return this.materializeQuest(userId, {
      title: suggestion.title,
      description: suggestion.description,
      quest_type: normalizeQuestType(suggestion.quest_type),
      priority: suggestion.priority,
      importance: suggestion.importance,
      impact: suggestion.impact,
      category: suggestion.category,
      suggestionId,
      sourceMessageId: suggestion.source_message_id,
    });
  }

  /** Chat messages → pending suggestions (user confirms in Quest Board). */
  async processChatMessageForQuestSuggestions(
    userId: string,
    messageId: string,
    content: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<number> {
    const extracted = await questExtractor.extractQuestsFromMessage(userId, content, conversationHistory);
    const existing = await questStorage.getQuests(userId, { status: ['active', 'paused'] });
    const have = new Set(existing.map((q) => normalizeTitle(q.title)));

    let saved = 0;
    for (const quest of extracted) {
      if (!quest.title?.trim() || have.has(normalizeTitle(quest.title))) continue;
      await this.upsertFromExtraction(
        userId,
        {
          title: quest.title,
          description: quest.description,
          quest_type: quest.quest_type,
          priority: quest.priority,
          importance: quest.importance,
          impact: quest.impact,
          category: quest.category,
          confidence: 0.72,
          reasoning: 'Detected from your conversation',
        },
        { sourceMessageId: messageId, source: 'chat' }
      );
      saved++;
    }
    return saved;
  }

  /** Journal entries → pending suggestions when confidence is below auto-create threshold. */
  async processEntryForQuestSuggestions(userId: string, entryId: string, content: string): Promise<number> {
    const extracted = await questExtractor.extractQuests(userId, [{ content, date: new Date().toISOString() }]);
    const existing = await questStorage.getQuests(userId, { status: ['active', 'paused'] });
    const have = new Set(existing.map((q) => normalizeTitle(q.title)));

    let saved = 0;
    for (const quest of extracted) {
      if (!quest.title?.trim() || have.has(normalizeTitle(quest.title))) continue;
      await this.upsertFromExtraction(
        userId,
        {
          title: quest.title,
          description: quest.description,
          quest_type: quest.quest_type,
          priority: quest.priority,
          importance: quest.importance,
          impact: quest.impact,
          category: quest.category,
          confidence: 0.72,
          reasoning: 'Detected from your journal',
        },
        { sourceMessageId: entryId, source: 'journal' }
      );
      saved++;
    }
    return saved;
  }
}

export const questSuggestionService = new QuestSuggestionService();
