/**
 * Reflection Prompt System
 * Generates reflection prompts based on RPG stats
 */

import { logger } from '../../logger';
import { chapterEngine } from './chapterEngine';
import { challengeEngine } from './challengeEngine';
import { questChainEngine } from './questChainEngine';
import { supabaseAdmin } from '../supabaseClient';

export interface ReflectionPrompt {
  text: string;
  type: 'chapter' | 'challenge' | 'quest' | 'general';
  entityId?: string;
  entityName?: string;
  context?: string;
}

export class ReflectionPromptSystem {
  /**
   * Generate reflection prompts for a user
   */
  async generatePrompts(userId: string): Promise<ReflectionPrompt[]> {
    const prompts: ReflectionPrompt[] = [];

    // Chapter completion prompts
    const chapterPrompts = await this.generateChapterPrompts(userId);
    prompts.push(...chapterPrompts);

    // Challenge completion prompts
    const challengePrompts = await this.generateChallengePrompts(userId);
    prompts.push(...challengePrompts);

    // Quest completion prompts
    const questPrompts = await this.generateQuestPrompts(userId);
    prompts.push(...questPrompts);

    return prompts;
  }

  /**
   * Generate prompts for completed chapters
   */
  private async generateChapterPrompts(userId: string): Promise<ReflectionPrompt[]> {
    const prompts: ReflectionPrompt[] = [];

    try {
      const stats = await chapterEngine.getChapterStats(userId);
      const completedChapters = stats.filter(s => s.completion_status === 'completed' && s.reflection_bonus === 0);

      for (const chapter of completedChapters) {
        prompts.push({
          text: `Want to reflect on ${chapter.chapter_title || 'this chapter'}?`,
          type: 'chapter',
          entityId: chapter.chapter_id || undefined,
          entityName: chapter.chapter_title || undefined,
          context: 'Reflecting on completed chapters helps you understand your journey',
        });
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate chapter prompts');
    }

    return prompts;
  }

  /**
   * Generate prompts for completed challenges
   */
  private async generateChallengePrompts(userId: string): Promise<ReflectionPrompt[]> {
    const prompts: ReflectionPrompt[] = [];

    try {
      const stats = await challengeEngine.getChallengeStats(userId);
      const completedChallenges = stats.filter(s => s.outcome === 'victory' || s.outcome === 'defeat');

      for (const challenge of completedChallenges) {
        if (challenge.lessons_learned.length === 0) {
          prompts.push({
            text: `What did you learn from ${challenge.challenge_name}?`,
            type: 'challenge',
            entityName: challenge.challenge_name,
            context: 'Reflecting on challenges helps you grow',
          });
        }
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate challenge prompts');
    }

    return prompts;
  }

  /**
   * Generate prompts for completed quests
   */
  private async generateQuestPrompts(userId: string): Promise<ReflectionPrompt[]> {
    const prompts: ReflectionPrompt[] = [];

    try {
      const { data: completedQuests } = await supabaseAdmin
        .from('quests')
        .select('id, title, completion_notes')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .is('completion_notes', null)
        .order('completed_at', { ascending: false })
        .limit(5);

      if (!completedQuests) return prompts;

      for (const quest of completedQuests) {
        prompts.push({
          text: `How did ${quest.title} connect to your journey?`,
          type: 'quest',
          entityId: quest.id,
          entityName: quest.title,
          context: 'Reflecting on completed goals helps you see your progress',
        });
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate quest prompts');
    }

    return prompts;
  }
}

export const reflectionPromptSystem = new ReflectionPromptSystem();
