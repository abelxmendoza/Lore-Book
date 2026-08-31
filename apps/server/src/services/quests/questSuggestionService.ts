import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { clampQuestScore, normalizeQuestType } from '../../utils/questNormalize';

import { questExtractor } from './questExtractor';
import { questService } from './questService';
import { questStorage } from './questStorage';
import type { CreateQuestInput, Quest, QuestType } from './types';
import { suggestionDismissalService } from '../suggestionDismissalService';
import { evaluateEntityQuality, passesEntityQualityGate, resolveDisplayName } from '../lorebook/quality/entityQualityGateService';
import { applySuggestionCandidate } from '../lorebook/suggestions/applySuggestionCandidate';
import { hasQuestSignal } from '../conversationCentered/extractionSignals';
import { goalCognitionEngine } from '../goals/goalCognitionEngine';
import { explainGoalEvidence } from '../goals/goalEvidenceService';
import type { GoalKind, GoalSourceType } from '../goals/goalTypes';
import {
  canonicalQuestIntentKey,
  isQuestCandidateTextAllowed,
  questTitlesSemanticallyMatch,
} from './questCandidateBoundary';

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
  evidence?: Array<{ text: string; source_message_id?: string; observed_at?: string } | string>;
  source?: string;
  source_message_id?: string | null;
  item_type?: string | null;
  context?: Record<string, unknown>;
  requires_review?: boolean;
  created_at?: string;
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
    opts: {
      sourceMessageId?: string;
      sourceThreadId?: string | null;
      source?: 'chat' | 'journal' | 'llm_scan';
      sourceText?: string;
      sourceQuote?: string;
      authorRole?: 'user' | 'assistant' | 'system';
      userConfirmed?: boolean;
    } = {}
  ): Promise<boolean> {
    const title = extracted.title?.trim();
    if (!title || (extracted.confidence ?? 0.72) < 0.45) return false;

    const sourceText = opts.sourceText?.trim();
    if (!sourceText) {
      logger.debug({ userId, title }, 'Goal cognition rejected suggestion without direct source text');
      return false;
    }
    if (!isQuestCandidateTextAllowed(sourceText, title)) return false;
    const proposedKind: GoalKind =
      extracted.quest_type === 'daily' ? 'TASK'
        : extracted.quest_type === 'achievement' ? 'MILESTONE'
          : extracted.quest_type === 'main' ? 'QUEST'
            : 'INTENTION';
    const cognition = goalCognitionEngine.evaluate({
      ownerEntityId: userId,
      sourceText,
      proposedTitle: title,
      proposedKind,
      sourceMessageId: opts.sourceMessageId,
      sourceType: (opts.source ?? 'chat') as GoalSourceType,
      authorRole: opts.authorRole ?? 'user',
      userConfirmed: opts.userConfirmed,
    });
    if (cognition.decision === 'REJECT' || !cognition.eligibility.eligible) {
      logger.debug(
        { userId, title, diagnostic: cognition.diagnostic },
        'Goal cognition rejected quest suggestion',
      );
      return false;
    }

    const suppressed = await suggestionDismissalService.shouldSuppress(userId, 'quests', title, {
      sourceMessageId: opts.sourceMessageId,
      threadId: opts.sourceThreadId,
    });
    if (suppressed.suppressed) return false;

    const evidenceText = cognition.candidate.originalText;
    const sourceQuote = opts.sourceQuote?.trim() || evidenceText;
    if (!sourceText.replace(/\s+/g, ' ').toLocaleLowerCase().includes(sourceQuote.replace(/\s+/g, ' ').toLocaleLowerCase())) return false;
    const quality = evaluateEntityQuality({
      name: title,
      domain: 'quests',
      contextText: evidenceText,
      evidence: evidenceText,
      confidence: extracted.confidence ?? 0.72,
      sourceMessageId: opts.sourceMessageId,
      sourceThreadId: opts.sourceThreadId ?? undefined,
    });
    if (!passesEntityQualityGate(quality)) return false;
    const safeTitle = resolveDisplayName(
      { name: cognition.candidate.canonicalTitle, domain: 'quests' },
      quality,
    );

    const payload = {
      user_id: userId,
      title: safeTitle,
      description: extracted.description ?? cognition.candidate.desiredOutcome ?? null,
      quest_type: normalizeQuestType(extracted.quest_type ?? 'side'),
      priority: clampQuestScore(extracted.priority),
      importance: clampQuestScore(extracted.importance),
      impact: clampQuestScore(extracted.impact),
      category: extracted.category ?? null,
      confidence: cognition.candidate.confidence,
      reasoning: explainGoalEvidence(cognition.candidate.originalText, cognition.candidate.kind),
      evidence: [{ text: sourceQuote, source_message_id: opts.sourceMessageId, observed_at: new Date().toISOString() }],
      source_message_id: opts.sourceMessageId ?? null,
      source: opts.source ?? 'chat',
      status: 'pending',
      updated_at: new Date().toISOString(),
    };

    const persist = async () => {
      const { data: pendingRows } = await supabaseAdmin
        .from('quest_suggestions')
        .select('id, title, evidence, description, confidence, source_message_id')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .limit(100);
      const duplicate = (pendingRows ?? []).find((row) =>
        row.title !== safeTitle && questTitlesSemanticallyMatch(String(row.title ?? ''), safeTitle));
      if (duplicate?.id) {
        const currentEvidence = Array.isArray(duplicate.evidence) ? duplicate.evidence : [];
        const mergedEvidence = [...currentEvidence, { text: sourceQuote, source_message_id: opts.sourceMessageId, observed_at: new Date().toISOString() }]
          .filter((item, index, all) => {
            const text = typeof item === 'string' ? item : item?.text;
            return all.findIndex((candidate) => (typeof candidate === 'string' ? candidate : candidate?.text)?.toLocaleLowerCase() === String(text ?? '').toLocaleLowerCase()) === index;
          });
        const { error: duplicateError } = await supabaseAdmin.from('quest_suggestions').update({
          evidence: mergedEvidence,
          description: duplicate.description || payload.description,
          confidence: Math.max(Number(duplicate.confidence ?? 0), Number(payload.confidence ?? 0)),
          source_message_id: duplicate.source_message_id || payload.source_message_id,
          normalized_title: canonicalQuestIntentKey(String(duplicate.title)),
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId).eq('id', duplicate.id);
        if (duplicateError && !isTableMissing(duplicateError)) logger.warn({ duplicateError, userId }, 'Failed to merge duplicate quest suggestion');
        return;
      }
      const { error } = await supabaseAdmin
        .from('quest_suggestions')
        .upsert(payload, { onConflict: 'user_id,title' });

      if (error && !isTableMissing(error)) {
        logger.warn({ error, userId, title }, 'Failed to upsert quest suggestion');
        return;
      }
      const { error: metadataError } = await supabaseAdmin
      .from('quest_suggestions')
      .update({
        item_type: cognition.candidate.kind.toLowerCase(),
        context: {
          domain: cognition.candidate.domain,
          temporal_state: cognition.candidate.temporalState,
          status: cognition.candidate.status,
          decision: cognition.decision,
        },
        promotion_status:
          cognition.decision === 'ACCEPT' ? 'suggested_quest_log_item' : 'candidate',
        requires_review: cognition.decision === 'REVIEW',
        normalized_title: canonicalQuestIntentKey(safeTitle),
      })
      .eq('user_id', userId)
      .eq('title', safeTitle);
    if (metadataError && !isTableMissing(metadataError)) {
      logger.debug(
        { metadataError, userId, title: safeTitle },
        'Quest cognition metadata unavailable; core suggestion was preserved',
      );
    }
    };

    const write = await applySuggestionCandidate({
      userId,
      domain: 'quests',
      name: safeTitle,
      evidence: evidenceText,
      sourceMessageId: opts.sourceMessageId,
      extractor: 'quest_suggestion',
      source: opts.source,
      onCreate: persist,
      onReview: persist,
    });
    return write.outcome === 'CREATED' || write.outcome === 'REVIEW' || write.outcome === 'ATTACHED';
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

    return this.filterPendingRows(userId, data ?? []);
  }

  private async filterPendingRows(userId: string, rows: Array<Record<string, unknown>>): Promise<QuestSuggestionRow[]> {
    const filtered: QuestSuggestionRow[] = [];
    for (const row of rows) {
      const evidence = (row.evidence as QuestSuggestionRow['evidence']) ?? [];
      const firstEvidence = evidence[0];
      const sourceText = typeof firstEvidence === 'string' ? firstEvidence : firstEvidence?.text;
      const cognition = sourceText
        ? goalCognitionEngine.evaluate({
            ownerEntityId: userId,
            sourceText,
            proposedTitle: String(row.title ?? ''),
            proposedKind: typeof row.item_type === 'string' ? row.item_type : undefined,
            sourceMessageId: row.source_message_id as string | undefined,
            sourceType: ((row.source as GoalSourceType) ?? 'chat'),
            authorRole: 'user',
          })
        : null;
      if (!cognition || cognition.decision === 'REJECT' || !cognition.eligibility.eligible) {
        await this.archiveInvalidSuggestion(userId, row, sourceText, cognition);
        continue;
      }
      const suppressed = await suggestionDismissalService.shouldSuppress(userId, 'quests', String(row.title ?? ''), {
        sourceMessageId: row.source_message_id as string | null | undefined,
      });
      if (suppressed.suppressed) continue;
      filtered.push({
        id: row.id as string,
        title: row.title as string,
        description: row.description as string | null | undefined,
        quest_type: normalizeQuestType(row.quest_type as string),
        priority: row.priority as number,
        importance: row.importance as number,
        impact: row.impact as number,
        category: row.category as string | null | undefined,
        confidence: Number(row.confidence),
        reasoning: row.reasoning as string | null | undefined,
        evidence,
        source: (row.source as string) ?? 'chat',
        source_message_id: row.source_message_id as string | null | undefined,
        item_type: row.item_type as string | null | undefined,
        context: (row.context as Record<string, unknown>) ?? {},
        requires_review: Boolean(row.requires_review),
        created_at: row.created_at as string | undefined,
      });
    }
    const clustered = new Map<string, QuestSuggestionRow>();
    for (const item of filtered) {
      const key = canonicalQuestIntentKey(item.title);
      const current = clustered.get(key);
      if (!current) {
        clustered.set(key, item);
        continue;
      }
      const evidence = [...(current.evidence ?? []), ...(item.evidence ?? [])].filter((entry, index, all) => {
        const text = typeof entry === 'string' ? entry : entry.text;
        return all.findIndex((candidate) => (typeof candidate === 'string' ? candidate : candidate.text).toLocaleLowerCase() === text.toLocaleLowerCase()) === index;
      });
      clustered.set(key, {
        ...current,
        evidence,
        confidence: Math.max(current.confidence, item.confidence),
        description: current.description || item.description,
      });
    }
    return [...clustered.values()];
  }

  private async archiveInvalidSuggestion(
    userId: string,
    row: Record<string, unknown>,
    sourceText: string | undefined,
    cognition: ReturnType<typeof goalCognitionEngine.evaluate> | null,
  ): Promise<void> {
    const reasons = cognition?.diagnostic.reasons ?? ['missing_direct_supporting_evidence'];
    await supabaseAdmin
      .from('quest_suggestions')
      .update({
        status: 'rejected',
        reasoning: `Rejected by Goal Cognition Engine: ${reasons.join(', ')}`,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('id', row.id);

    const { error } = await supabaseAdmin.from('goal_cognition_audit').insert({
      user_id: userId,
      suggestion_id: row.id,
      prior_title: String(row.title ?? ''),
      source_message_id: row.source_message_id ?? null,
      source_text: sourceText ?? null,
      prior_payload: row,
      decision: cognition?.decision ?? 'REJECT',
      reasons,
    });
    if (error && !isTableMissing(error)) {
      logger.debug({ error, userId, suggestionId: row.id }, 'Goal cognition audit insert failed');
    }
  }

  async hasAnySuggestions(userId: string): Promise<boolean> {
    const { count, error } = await supabaseAdmin
      .from('quest_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending');
    if (error) {
      if (isTableMissing(error)) return false;
      return false;
    }
    return (count ?? 0) > 0;
  }

  async rejectSuggestion(
    userId: string,
    suggestionId: string,
    opts?: { threadId?: string | null; reason?: import('../suggestionDismissalService').DismissSuggestionReason }
  ) {
    const { data: row } = await supabaseAdmin
      .from('quest_suggestions')
      .select('id, title, source_message_id')
      .eq('user_id', userId)
      .eq('id', suggestionId)
      .maybeSingle();

    if (!row?.title) return null;

    const result = await suggestionDismissalService.recordDismissal(userId, 'quests', {
      name: row.title,
      sourceMessageId: row.source_message_id,
      sourceSuggestionId: suggestionId,
      threadId: opts?.threadId,
      reason: opts?.reason,
    });

    if (result.isPermanent) {
      await supabaseAdmin
        .from('quest_suggestions')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', suggestionId);
      return result;
    }

    await supabaseAdmin.from('quest_suggestions').delete().eq('user_id', userId).eq('id', suggestionId);
    return result;
  }

  async rejectByTitle(
    userId: string,
    title: string,
    opts?: {
      threadId?: string | null;
      sourceMessageId?: string | null;
      suggestionId?: string;
      reason?: import('../suggestionDismissalService').DismissSuggestionReason;
    }
  ) {
    const { data: existing } = await supabaseAdmin
      .from('quest_suggestions')
      .select('id, title, source_message_id')
      .eq('user_id', userId)
      .eq('title', title.trim())
      .maybeSingle();

    const result = await suggestionDismissalService.recordDismissal(userId, 'quests', {
      name: title,
      sourceMessageId: opts?.sourceMessageId ?? existing?.source_message_id,
      sourceSuggestionId: opts?.suggestionId ?? existing?.id,
      threadId: opts?.threadId,
      reason: opts?.reason,
    });

    if (result.isPermanent) {
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
        logger.debug({ error, userId, title }, 'rejectByTitle permanent upsert failed');
      }
      return result;
    }

    if (existing?.id) {
      await supabaseAdmin.from('quest_suggestions').delete().eq('user_id', userId).eq('id', existing.id);
    }
    return result;
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

  async mergeSuggestionIntoQuest(userId: string, suggestionId: string, questId: string): Promise<Quest> {
    const [{ data: suggestion }, target] = await Promise.all([
      supabaseAdmin.from('quest_suggestions').select('*').eq('user_id', userId).eq('id', suggestionId).single(),
      questStorage.getQuest(userId, questId),
    ]);
    if (!suggestion) throw new Error('Suggestion not found');
    if (!target) throw new Error('Quest not found');

    const existingEvidence = Array.isArray(target.metadata?.suggestion_evidence)
      ? target.metadata.suggestion_evidence
      : [];
    const suggestionEvidence = Array.isArray(suggestion.evidence) ? suggestion.evidence : [];
    const mergedEvidence = [...existingEvidence, ...suggestionEvidence].filter((entry, index, all) => {
      const text = typeof entry === 'string' ? entry : entry?.text;
      return all.findIndex((candidate) => (typeof candidate === 'string' ? candidate : candidate?.text)?.toLocaleLowerCase() === String(text ?? '').toLocaleLowerCase()) === index;
    });
    const merged = await questStorage.updateQuest(userId, questId, {
      metadata: {
        ...(target.metadata ?? {}),
        suggestion_evidence: mergedEvidence,
        merged_suggestion_ids: [...new Set([
          ...(Array.isArray(target.metadata?.merged_suggestion_ids) ? target.metadata.merged_suggestion_ids : []),
          suggestionId,
        ])],
      },
    });
    await supabaseAdmin.from('quest_suggestions').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('user_id', userId).eq('id', suggestionId);
    return merged;
  }

  /** Chat messages → pending suggestions (user confirms in Quest Board). */
  async processChatMessageForQuestSuggestions(
    userId: string,
    messageId: string,
    content: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<number> {
    // Defense in depth: Character Book intros ("tell you about X") must not
    // spend an LLM call or land in Suggested Quests.
    if (!hasQuestSignal(content)) return 0;

    const sourceThreadId = await suggestionDismissalService.resolveThreadIdFromMessageId(messageId);
    const extracted = await questExtractor.extractQuestsFromMessage(userId, content, conversationHistory);
    const existing = await questStorage.getQuests(userId, { status: ['active', 'paused'] });

    let saved = 0;
    for (const quest of extracted) {
      if (!quest.title?.trim() || existing.some((item) => questTitlesSemanticallyMatch(item.title, quest.title))) continue;
      const upserted = await this.upsertFromExtraction(
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
        {
          sourceMessageId: messageId,
          sourceThreadId,
          source: 'chat',
          sourceText: content,
          sourceQuote: typeof quest.metadata?.source_text === 'string' ? quest.metadata.source_text : undefined,
        }
      );
      if (upserted) saved++;
    }
    return saved;
  }

  /** Journal entries → pending suggestions when confidence is below auto-create threshold. */
  async processEntryForQuestSuggestions(userId: string, entryId: string, content: string): Promise<number> {
    const extracted = await questExtractor.extractQuests(userId, [{ content, date: new Date().toISOString() }]);
    const existing = await questStorage.getQuests(userId, { status: ['active', 'paused'] });

    let saved = 0;
    for (const quest of extracted) {
      if (!quest.title?.trim() || existing.some((item) => questTitlesSemanticallyMatch(item.title, quest.title))) continue;
      const upserted = await this.upsertFromExtraction(
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
        {
          sourceMessageId: entryId,
          source: 'journal',
          sourceText: content,
          sourceQuote: typeof quest.metadata?.source_text === 'string' ? quest.metadata.source_text : undefined,
        }
      );
      if (upserted) saved++;
    }
    return saved;
  }
}

export const questSuggestionService = new QuestSuggestionService();
