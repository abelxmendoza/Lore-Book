import { logger } from '../../logger';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { questSuggestionService } from '../quests/questSuggestionService';
import type { QuestLogCandidate } from './inference/questLogInferenceTypes';

function mapQuestType(itemType: QuestLogCandidate['itemType']): string {
  switch (itemType) {
    case 'quest':
    case 'goal':
      return 'main';
    case 'task':
    case 'feature':
    case 'blocker':
      return 'daily';
    case 'habit':
      return 'side';
    case 'milestone':
      return 'achievement';
    default:
      return 'side';
  }
}

function mapCategory(candidate: QuestLogCandidate): string {
  return candidate.context.lifeArea ?? 'personal';
}

class QuestLogSuggestionService {
  async upsertFromInference(
    userId: string,
    candidate: QuestLogCandidate,
    opts: {
      sourceMessageId?: string;
      source?: 'chat' | 'journal' | 'llm_scan';
    } = {},
  ): Promise<boolean> {
    if (candidate.confidence < 0.45) return false;

    try {
      await questSuggestionService.upsertFromExtraction(
        userId,
        {
          title: candidate.displayName,
          description: candidate.evidencePhrases.join(' ').slice(0, 500),
          quest_type: mapQuestType(candidate.itemType),
          priority: candidate.context.urgency === 'now' ? 8 : 5,
          importance: candidate.itemType === 'quest' || candidate.itemType === 'goal' ? 7 : 5,
          impact: candidate.itemType === 'blocker' ? 8 : 5,
          category: mapCategory(candidate),
          confidence: candidate.confidence,
          reasoning: `Quest Log ${candidate.itemType} inferred from conversation`,
        },
        {
          sourceMessageId: opts.sourceMessageId,
          source: opts.source ?? 'chat',
        },
      );

      await this.enrichQuestLogMetadata(userId, candidate);
      return true;
    } catch (err) {
      logger.debug({ err, userId, title: candidate.displayName }, 'Quest log suggestion upsert failed');
      return false;
    }
  }

  private async enrichQuestLogMetadata(userId: string, candidate: QuestLogCandidate): Promise<void> {
    const { supabaseAdmin } = await import('../supabaseClient');
    const normalized = normalizeNameKey(candidate.displayName);

    const { error } = await supabaseAdmin
      .from('quest_suggestions')
      .update({
        item_type: candidate.itemType,
        context: candidate.context,
        parent_project_name: candidate.context.projectContext ?? null,
        promotion_status: candidate.promotionStatus,
        requires_review: candidate.requiresReview,
        normalized_title: normalized,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('title', candidate.displayName);

    if (error) {
      logger.debug({ error, userId, title: candidate.displayName }, 'Quest log metadata enrich failed');
    }
  }
}

export const questLogSuggestionService = new QuestLogSuggestionService();
