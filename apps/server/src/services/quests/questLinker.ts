import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { questStorage } from './questStorage';
import { questService } from './questService';
import type { Quest, CreateQuestInput } from './types';

/**
 * Links quests to existing goals and tasks
 */
export class QuestLinker {
  /**
   * Link quest to goal
   */
  async linkQuestToGoal(userId: string, questId: string, goalId: string): Promise<void> {
    try {
      await questStorage.updateQuest(userId, questId, { related_goal_id: goalId });
      logger.debug({ questId, goalId }, 'Linked quest to goal');
    } catch (error) {
      logger.error({ error, questId, goalId }, 'Failed to link quest to goal');
      throw error;
    }
  }

  /**
   * Link quest to task
   */
  async linkQuestToTask(userId: string, questId: string, taskId: string): Promise<void> {
    try {
      await questStorage.updateQuest(userId, questId, { related_task_id: taskId });
      logger.debug({ questId, taskId }, 'Linked quest to task');
    } catch (error) {
      logger.error({ error, questId, taskId }, 'Failed to link quest to task');
      throw error;
    }
  }

  /**
   * Convert goal to quest
   */
  async convertGoalToQuest(userId: string, goalId: string): Promise<Quest> {
    try {
      // Get goal
      const { data: goal, error } = await supabaseAdmin
        .from('goals')
        .select('*')
        .eq('id', goalId)
        .eq('user_id', userId)
        .single();

      if (error || !goal) {
        throw new Error('Goal not found');
      }

      // Determine quest type based on goal type
      let questType: 'main' | 'side' | 'daily' | 'achievement' = 'main';
      if (goal.goal_type === 'PERSONAL' || goal.goal_type === 'CAREER') {
        questType = 'main';
      } else {
        questType = 'side';
      }

      // Create quest from goal
      const questData: CreateQuestInput = {
        title: goal.title,
        description: goal.description,
        quest_type: questType,
        priority: 5, // Default, user can adjust
        importance: 7, // Goals are generally important
        impact: 6,
        related_goal_id: goalId,
        category: this.mapGoalTypeToCategory(goal.goal_type),
        source: 'imported',
      };

      const quest = await questService.createQuest(userId, questData);
      logger.debug({ goalId, questId: quest.id, userId }, 'Converted goal to quest');
      return quest;
    } catch (error) {
      logger.error({ error, userId, goalId }, 'Failed to convert goal to quest');
      throw error;
    }
  }

  /**
   * Convert task to quest
   */
  async convertTaskToQuest(userId: string, taskId: string): Promise<Quest> {
    try {
      // Get task
      const { data: task, error } = await supabaseAdmin
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .eq('user_id', userId)
        .single();

      if (error || !task) {
        throw new Error('Task not found');
      }

      // Determine quest type - high priority tasks become daily quests
      const questType: 'main' | 'side' | 'daily' | 'achievement' = 
        task.priority >= 8 ? 'daily' : 'side';

      // Create quest from task
      const questData: CreateQuestInput = {
        title: task.title,
        description: task.description || undefined,
        quest_type: questType,
        priority: task.priority || 5,
        importance: task.impact || 5,
        impact: task.impact || 5,
        difficulty: task.effort || undefined,
        related_task_id: taskId,
        category: task.category || undefined,
        estimated_completion_date: task.due_date || undefined,
        source: 'imported',
      };

      const quest = await questService.createQuest(userId, questData);
      logger.debug({ taskId, questId: quest.id, userId }, 'Converted task to quest');
      return quest;
    } catch (error) {
      logger.error({ error, userId, taskId }, 'Failed to convert task to quest');
      throw error;
    }
  }

  /**
   * Map goal type to quest category
   */
  private mapGoalTypeToCategory(goalType: string): string {
    const mapping: Record<string, string> = {
      'PERSONAL': 'personal_growth',
      'CAREER': 'career',
      'RELATIONSHIP': 'relationships',
      'HEALTH': 'health',
      'FINANCIAL': 'financial',
      'CREATIVE': 'creative',
    };
    return mapping[goalType] || 'other';
  }
}

export const questLinker = new QuestLinker();
