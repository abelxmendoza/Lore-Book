/**
 * Applies unified merged-extraction payloads to production tables (suggestions +
 * interests). Used when ENABLE_MERGED_EXTRACTION is on — replaces separate LLM
 * calls for the quest/skill/interest cluster.
 */
import { logger } from '../../logger';
import type { DetectedInterest } from '../conversationCentered/interestDetector';
import { interestTracker } from '../conversationCentered/interestTracker';
import { questSuggestionService } from '../quests/questSuggestionService';
import { skillSuggestionService } from '../skills/skillSuggestionService';
import { suggestionDismissalService } from '../suggestions/suggestionDismissalService';
import type { UnifiedExtractionPayload, UnifiedSkill, SkillProficiency } from './types/unifiedExtraction';
import type { ExtractedSkillProfile } from '../skills/skillProfile';

export type MergedExtractionApplyResult = {
  interests: number;
  quests: number;
  skills: number;
};

const QUEST_TYPE_MAP: Record<string, string> = {
  GOAL: 'goal',
  TASK: 'task',
  CHALLENGE: 'challenge',
  PROJECT: 'project',
  HABIT: 'habit',
};

function proficiencyToScore(proficiency?: SkillProficiency): number {
  switch (proficiency) {
    case 'beginner':
      return 25;
    case 'intermediate':
      return 50;
    case 'advanced':
      return 75;
    case 'expert':
      return 90;
    default:
      return 40;
  }
}

function toExtractedSkill(skill: UnifiedSkill): ExtractedSkillProfile {
  return {
    skill_name: skill.skill_name,
    skill_category: 'other',
    skill_type: 'hobby',
    monetization: 'unpaid',
    proficiency: proficiencyToScore(skill.proficiency),
    confidence: skill.confidence,
    enjoyment: 50,
    usage_frequency: 'rarely',
    trajectory: 'unknown',
    description: skill.evidence,
    evidence: skill.evidence ? [skill.evidence] : [],
  };
}

export async function applyMergedExtractionPayload(
  userId: string,
  messageId: string,
  rawText: string,
  payload: UnifiedExtractionPayload,
): Promise<MergedExtractionApplyResult> {
  const result: MergedExtractionApplyResult = { interests: 0, quests: 0, skills: 0 };
  const sourceThreadId = await suggestionDismissalService.resolveThreadIdFromMessageId(messageId);

  if (payload.interests.length > 0) {
    const { findCoMentionedCharacterIds } = await import('../characters/characterLoreProfileService');
    const coMentionedIds = await findCoMentionedCharacterIds(userId, rawText);
    for (const interest of payload.interests) {
      try {
        const detected: DetectedInterest = {
          interest_name: interest.name,
          interest_category: interest.category,
          confidence: interest.confidence,
          emotional_intensity: interest.emotional_intensity,
          sentiment: interest.sentiment,
          evidence: interest.evidence,
          context: rawText.slice(0, 500),
          action_taken: interest.action_taken,
          action_type: interest.action_type,
          knowledge_depth: interest.knowledge_depth,
          time_investment_minutes: interest.time_investment_minutes,
        };
        await interestTracker.saveInterest(userId, detected, undefined, messageId, coMentionedIds);
        result.interests += 1;
      } catch (err) {
        logger.warn({ err, interest: interest.name }, 'Merged extraction: interest apply failed');
      }
    }
  }

  for (const quest of payload.quest_signals) {
    try {
      await questSuggestionService.upsertFromExtraction(
        userId,
        {
          title: quest.title,
          description: quest.description,
          quest_type: QUEST_TYPE_MAP[quest.type] ?? 'goal',
          priority: quest.urgency === 'high' ? 0.85 : quest.urgency === 'medium' ? 0.65 : 0.45,
          confidence: quest.confidence,
          reasoning: quest.evidence || 'Detected from merged extraction',
        },
        { sourceMessageId: messageId, sourceThreadId, source: 'chat' },
      );
      result.quests += 1;
    } catch (err) {
      logger.warn({ err, title: quest.title }, 'Merged extraction: quest apply failed');
    }
  }

  for (const skill of payload.skills) {
    try {
      await skillSuggestionService.upsertFromExtraction(
        userId,
        toExtractedSkill(skill),
        { sourceMessageId: messageId, sourceThreadId, source: 'chat' },
      );
      result.skills += 1;
    } catch (err) {
      logger.warn({ err, skill: skill.skill_name }, 'Merged extraction: skill apply failed');
    }
  }

  if (result.interests + result.quests + result.skills > 0) {
    logger.debug({ userId, messageId, ...result }, 'Merged extraction applied to production');
  }

  return result;
}
