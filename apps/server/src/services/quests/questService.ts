import { v4 as uuid } from 'uuid';

import { logger } from '../../logger';

import { questStorage } from './questStorage';
import type {
  Quest,
  QuestBoard,
  QuestAnalytics,
  QuestSuggestion,
  CreateQuestInput,
  UpdateQuestInput,
  QuestHistory,
  QuestHistoryEventType,
} from './types';

/**
 * Main Quest Service
 * Handles quest business logic and operations
 */
export class QuestService {
  /**
   * Calculate composite quest score
   */
  calculateQuestScore(quest: Quest): number {
    const compositeScore = (quest.priority * 0.3) + (quest.importance * 0.4) + (quest.impact * 0.3);
    const difficulty = quest.difficulty || 5;
    const difficultyAdjustedScore = compositeScore / (difficulty * 0.1 + 1);
    return Math.round(difficultyAdjustedScore * 100) / 100;
  }

  /**
   * Create a new quest
   */
  async createQuest(userId: string, questData: CreateQuestInput): Promise<Quest> {
    try {
      const quest: Quest = {
        id: uuid(),
        user_id: userId,
        title: questData.title,
        description: questData.description,
        quest_type: questData.quest_type,
        priority: questData.priority || 5,
        importance: questData.importance || 5,
        impact: questData.impact || 5,
        difficulty: questData.difficulty,
        effort_hours: questData.effort_hours,
        status: 'active',
        related_goal_id: questData.related_goal_id,
        related_task_id: questData.related_task_id,
        parent_quest_id: questData.parent_quest_id,
        quest_chain_id: questData.quest_chain_id,
        progress_percentage: 0,
        milestones: questData.milestones?.map(m => ({
          id: uuid(),
          description: m.description,
          achieved: false,
          target_date: m.target_date,
        })) || [],
        reward_description: questData.reward_description,
        motivation_notes: questData.motivation_notes,
        estimated_completion_date: questData.estimated_completion_date,
        tags: questData.tags || [],
        category: questData.category,
        source: 'manual',
        metadata: questData.metadata || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      };

      const savedQuest = await questStorage.saveQuest(quest);

      // Create history event
      await questStorage.saveHistoryEvent({
        id: uuid(),
        quest_id: savedQuest.id,
        user_id: userId,
        event_type: 'created',
        description: `Quest "${savedQuest.title}" created`,
        created_at: new Date().toISOString(),
      });

      logger.debug({ questId: savedQuest.id, userId }, 'Created quest');
      return savedQuest;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to create quest');
      throw error;
    }
  }

  /**
   * Update quest
   */
  async updateQuest(userId: string, questId: string, updates: UpdateQuestInput): Promise<Quest> {
    try {
      const existingQuest = await questStorage.getQuest(userId, questId);
      if (!existingQuest) {
        throw new Error('Quest not found');
      }

      const updatedQuest = await questStorage.updateQuest(userId, questId, updates);

      // Create history event if status changed
      if (updates.status && updates.status !== existingQuest.status) {
        await questStorage.saveHistoryEvent({
          id: uuid(),
          quest_id: questId,
          user_id: userId,
          event_type: updates.status === 'paused' ? 'paused' : 
                      updates.status === 'completed' ? 'completed' :
                      updates.status === 'abandoned' ? 'abandoned' : 'created',
          description: `Quest status changed to ${updates.status}`,
          progress_before: existingQuest.progress_percentage,
          progress_after: updatedQuest.progress_percentage,
          created_at: new Date().toISOString(),
        });
      }

      // Create history event if progress changed
      if (updates.progress_percentage !== undefined && 
          updates.progress_percentage !== existingQuest.progress_percentage) {
        await questStorage.saveHistoryEvent({
          id: uuid(),
          quest_id: questId,
          user_id: userId,
          event_type: 'progress_update',
          description: `Progress updated to ${updates.progress_percentage}%`,
          progress_before: existingQuest.progress_percentage,
          progress_after: updates.progress_percentage,
          created_at: new Date().toISOString(),
        });
      }

      return updatedQuest;
    } catch (error) {
      logger.error({ error, userId, questId }, 'Failed to update quest');
      throw error;
    }
  }

  /**
   * Start a quest
   */
  async startQuest(userId: string, questId: string): Promise<Quest> {
    try {
      const quest = await questStorage.getQuest(userId, questId);
      if (!quest) {
        throw new Error('Quest not found');
      }

      if (quest.status !== 'active' && quest.status !== 'paused') {
        throw new Error(`Cannot start quest with status: ${quest.status}`);
      }

      const updatedQuest = await questStorage.updateQuest(userId, questId, {
        status: 'active',
        started_at: quest.started_at || new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      });

      await questStorage.saveHistoryEvent({
        id: uuid(),
        quest_id: questId,
        user_id: userId,
        event_type: quest.started_at ? 'resumed' : 'started',
        description: quest.started_at ? 'Quest resumed' : 'Quest started',
        created_at: new Date().toISOString(),
      });

      return updatedQuest;
    } catch (error) {
      logger.error({ error, userId, questId }, 'Failed to start quest');
      throw error;
    }
  }

  /**
   * Complete a quest
   */
  async completeQuest(userId: string, questId: string, notes?: string): Promise<Quest> {
    try {
      const quest = await questStorage.getQuest(userId, questId);
      if (!quest) {
        throw new Error('Quest not found');
      }

      const now = new Date().toISOString();
      const updatedQuest = await questStorage.updateQuest(userId, questId, {
        status: 'completed',
        completed_at: now,
        actual_completion_date: now,
        progress_percentage: 100,
        completion_notes: notes || quest.completion_notes,
        last_activity_at: now,
      });

      await questStorage.saveHistoryEvent({
        id: uuid(),
        quest_id: questId,
        user_id: userId,
        event_type: 'completed',
        description: 'Quest completed',
        progress_before: quest.progress_percentage,
        progress_after: 100,
        notes: notes,
        created_at: now,
      });

      logger.debug({ questId, userId }, 'Quest completed');
      return updatedQuest;
    } catch (error) {
      logger.error({ error, userId, questId }, 'Failed to complete quest');
      throw error;
    }
  }

  /**
   * Abandon a quest
   */
  async abandonQuest(userId: string, questId: string, reason?: string): Promise<Quest> {
    try {
      const quest = await questStorage.getQuest(userId, questId);
      if (!quest) {
        throw new Error('Quest not found');
      }

      const now = new Date().toISOString();
      const updatedQuest = await questStorage.updateQuest(userId, questId, {
        status: 'abandoned',
        abandoned_at: now,
        last_activity_at: now,
      });

      await questStorage.saveHistoryEvent({
        id: uuid(),
        quest_id: questId,
        user_id: userId,
        event_type: 'abandoned',
        description: reason || 'Quest abandoned',
        progress_before: quest.progress_percentage,
        progress_after: quest.progress_percentage,
        notes: reason,
        created_at: now,
      });

      return updatedQuest;
    } catch (error) {
      logger.error({ error, userId, questId }, 'Failed to abandon quest');
      throw error;
    }
  }

  /**
   * Pause a quest
   */
  async pauseQuest(userId: string, questId: string): Promise<Quest> {
    try {
      const quest = await questStorage.getQuest(userId, questId);
      if (!quest) {
        throw new Error('Quest not found');
      }

      if (quest.status !== 'active') {
        throw new Error(`Cannot pause quest with status: ${quest.status}`);
      }

      const updatedQuest = await questStorage.updateQuest(userId, questId, {
        status: 'paused',
        last_activity_at: new Date().toISOString(),
      });

      await questStorage.saveHistoryEvent({
        id: uuid(),
        quest_id: questId,
        user_id: userId,
        event_type: 'paused',
        description: 'Quest paused',
        progress_before: quest.progress_percentage,
        progress_after: quest.progress_percentage,
        created_at: new Date().toISOString(),
      });

      return updatedQuest;
    } catch (error) {
      logger.error({ error, userId, questId }, 'Failed to pause quest');
      throw error;
    }
  }

  /**
   * Update progress
   */
  async updateProgress(userId: string, questId: string, progress: number): Promise<Quest> {
    try {
      if (progress < 0 || progress > 100) {
        throw new Error('Progress must be between 0 and 100');
      }

      const quest = await questStorage.getQuest(userId, questId);
      if (!quest) {
        throw new Error('Quest not found');
      }

      const updatedQuest = await questStorage.updateQuest(userId, questId, {
        progress_percentage: progress,
        last_activity_at: new Date().toISOString(),
      });

      await questStorage.saveHistoryEvent({
        id: uuid(),
        quest_id: questId,
        user_id: userId,
        event_type: 'progress_update',
        description: `Progress updated to ${progress}%`,
        progress_before: quest.progress_percentage,
        progress_after: progress,
        created_at: new Date().toISOString(),
      });

      return updatedQuest;
    } catch (error) {
      logger.error({ error, userId, questId }, 'Failed to update progress');
      throw error;
    }
  }

  /**
   * Add reflection
   */
  async addReflection(userId: string, questId: string, reflection: string): Promise<QuestHistory> {
    try {
      const quest = await questStorage.getQuest(userId, questId);
      if (!quest) {
        throw new Error('Quest not found');
      }

      const historyEvent = await questStorage.saveHistoryEvent({
        id: uuid(),
        quest_id: questId,
        user_id: userId,
        event_type: 'reflected',
        description: 'Reflection added',
        notes: reflection,
        created_at: new Date().toISOString(),
      });

      return historyEvent;
    } catch (error) {
      logger.error({ error, userId, questId }, 'Failed to add reflection');
      throw error;
    }
  }

  /**
   * Get quest board (organized view)
   */
  async getQuestBoard(userId: string): Promise<QuestBoard> {
    try {
      const allQuests = await questStorage.getQuests(userId, {});

      // Sort main quests by composite score
      const mainQuests = allQuests
        .filter(q => q.quest_type === 'main' && q.status !== 'completed' && q.status !== 'archived')
        .sort((a, b) => this.calculateQuestScore(b) - this.calculateQuestScore(a));

      // Group side quests by category
      const sideQuests = allQuests
        .filter(q => q.quest_type === 'side' && q.status !== 'completed' && q.status !== 'archived')
        .sort((a, b) => {
          // Sort by category first, then by score
          if (a.category !== b.category) {
            return (a.category || '').localeCompare(b.category || '');
          }
          return this.calculateQuestScore(b) - this.calculateQuestScore(a);
        });

      // Sort daily quests by due date
      const dailyQuests = allQuests
        .filter(q => q.quest_type === 'daily' && q.status !== 'completed' && q.status !== 'archived')
        .sort((a, b) => {
          const aDate = a.estimated_completion_date ? new Date(a.estimated_completion_date).getTime() : 0;
          const bDate = b.estimated_completion_date ? new Date(b.estimated_completion_date).getTime() : 0;
          return aDate - bDate;
        });

      // Completed quests sorted by completion date
      const completedQuests = allQuests
        .filter(q => q.status === 'completed')
        .sort((a, b) => {
          const aDate = a.completed_at ? new Date(a.completed_at).getTime() : 0;
          const bDate = b.completed_at ? new Date(b.completed_at).getTime() : 0;
          return bDate - aDate; // Most recent first
        });

      return {
        main_quests: mainQuests,
        side_quests: sideQuests,
        daily_quests: dailyQuests,
        completed_quests: completedQuests,
        total_count: allQuests.length,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get quest board');
      throw error;
    }
  }

  /**
   * Get quest analytics
   */
  async getQuestAnalytics(userId: string): Promise<QuestAnalytics> {
    try {
      const allQuests = await questStorage.getQuests(userId, {});

      const activeQuests = allQuests.filter(q => q.status === 'active');
      const completedQuests = allQuests.filter(q => q.status === 'completed');
      const abandonedQuests = allQuests.filter(q => q.status === 'abandoned');

      // Calculate by type
      const byType: Record<string, number> = {
        main: 0,
        side: 0,
        daily: 0,
        achievement: 0,
      };
      allQuests.forEach(q => {
        byType[q.quest_type] = (byType[q.quest_type] || 0) + 1;
      });

      // Calculate by status
      const byStatus: Record<string, number> = {
        active: 0,
        paused: 0,
        completed: 0,
        abandoned: 0,
        archived: 0,
      };
      allQuests.forEach(q => {
        byStatus[q.status] = (byStatus[q.status] || 0) + 1;
      });

      // Calculate average completion time
      const completedWithTime = completedQuests.filter(q => 
        q.started_at && q.completed_at
      );
      let averageCompletionTime: number | undefined;
      if (completedWithTime.length > 0) {
        const totalHours = completedWithTime.reduce((sum, q) => {
          const start = new Date(q.started_at!).getTime();
          const end = new Date(q.completed_at!).getTime();
          return sum + (end - start) / (1000 * 60 * 60);
        }, 0);
        averageCompletionTime = totalHours / completedWithTime.length;
      }

      // Calculate completion rate
      const completionRate = allQuests.length > 0 
        ? completedQuests.length / allQuests.length 
        : 0;

      // Calculate averages
      const totalPriority = allQuests.reduce((sum, q) => sum + q.priority, 0);
      const totalImportance = allQuests.reduce((sum, q) => sum + q.importance, 0);
      const totalImpact = allQuests.reduce((sum, q) => sum + q.impact, 0);
      const averagePriority = allQuests.length > 0 ? totalPriority / allQuests.length : 0;
      const averageImportance = allQuests.length > 0 ? totalImportance / allQuests.length : 0;
      const averageImpact = allQuests.length > 0 ? totalImpact / allQuests.length : 0;

      // Most impactful quests (by impact score, then by composite score)
      const mostImpactfulQuests = [...allQuests]
        .sort((a, b) => {
          if (b.impact !== a.impact) return b.impact - a.impact;
          return this.calculateQuestScore(b) - this.calculateQuestScore(a);
        })
        .slice(0, 10);

      // Quest activity timeline (last 30 days)
      const activityTimeline: { date: string; created: number; completed: number; abandoned: number }[] = [];
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const created = allQuests.filter(q => {
          const createdDate = new Date(q.created_at).toISOString().split('T')[0];
          return createdDate === dateStr;
        }).length;

        const completed = completedQuests.filter(q => {
          if (!q.completed_at) return false;
          const completedDate = new Date(q.completed_at).toISOString().split('T')[0];
          return completedDate === dateStr;
        }).length;

        const abandoned = abandonedQuests.filter(q => {
          if (!q.abandoned_at) return false;
          const abandonedDate = new Date(q.abandoned_at).toISOString().split('T')[0];
          return abandonedDate === dateStr;
        }).length;

        activityTimeline.push({ date: dateStr, created, completed, abandoned });
      }

      return {
        total_quests: allQuests.length,
        active_quests: activeQuests.length,
        completed_quests: completedQuests.length,
        abandoned_quests: abandonedQuests.length,
        by_type: byType,
        by_status: byStatus,
        average_completion_time_hours: averageCompletionTime,
        completion_rate: completionRate,
        average_priority: averagePriority,
        average_importance: averageImportance,
        average_impact: averageImpact,
        most_impactful_quests: mostImpactfulQuests,
        quest_activity_timeline: activityTimeline,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get quest analytics');
      throw error;
    }
  }

  /**
   * Get quest suggestions (placeholder - to be implemented with LLM)
   */
  async getQuestSuggestions(userId: string): Promise<QuestSuggestion[]> {
    // TODO: Implement LLM-based quest extraction from journal entries
    // For now, return empty array
    return [];
  }
}

export const questService = new QuestService();
