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

      // Calculate today's quests (mentioned today or due today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todaysQuests = allQuests.filter(q => {
        // Mentioned today
        if (q.last_activity_at) {
          const lastActivity = new Date(q.last_activity_at);
          lastActivity.setHours(0, 0, 0, 0);
          if (lastActivity.getTime() === today.getTime()) return true;
        }
        // Due today
        if (q.estimated_completion_date) {
          const dueDate = new Date(q.estimated_completion_date);
          dueDate.setHours(0, 0, 0, 0);
          if (dueDate.getTime() === today.getTime()) return true;
        }
        return false;
      }).sort((a, b) => this.calculateQuestScore(b) - this.calculateQuestScore(a));

      // Calculate this week's quests (due within 7 days)
      const weekEnd = new Date(today);
      weekEnd.setDate(today.getDate() + 7);
      const thisWeeksQuests = allQuests.filter(q => {
        if (q.estimated_completion_date && q.status !== 'completed' && q.status !== 'archived') {
          const dueDate = new Date(q.estimated_completion_date);
          dueDate.setHours(0, 0, 0, 0);
          return dueDate >= today && dueDate <= weekEnd;
        }
        return false;
      }).sort((a, b) => {
        const aDate = a.estimated_completion_date ? new Date(a.estimated_completion_date).getTime() : 0;
        const bDate = b.estimated_completion_date ? new Date(b.estimated_completion_date).getTime() : 0;
        return aDate - bDate; // Soonest first
      });

      return {
        todays_quests: todaysQuests,
        this_weeks_quests: thisWeeksQuests,
        main_quests: mainQuests,
        side_quests: sideQuests,
        daily_quests: dailyQuests, // Keep for backward compatibility
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

  /**
   * Update quest progress from extracted progress updates
   * Matches quest titles and updates progress automatically
   */
  async updateProgressFromExtraction(
    userId: string,
    progressUpdates: Array<{ questTitle: string; progress: number; confidence: number }>
  ): Promise<Array<{ questId: string; updated: boolean; reason: string }>> {
    const results: Array<{ questId: string; updated: boolean; reason: string }> = [];

    try {
      // Get all active quests for the user
      const allQuests = await questStorage.getQuests(userId, { status: 'active' });

      for (const update of progressUpdates) {
        if (update.confidence < 0.7) {
          // Skip low confidence updates
          continue;
        }

        // Find matching quest by title (fuzzy match)
        const matchingQuest = allQuests.find(q => {
          const questTitleLower = q.title.toLowerCase();
          const updateTitleLower = update.questTitle.toLowerCase();
          return questTitleLower.includes(updateTitleLower) || updateTitleLower.includes(questTitleLower);
        });

        if (matchingQuest) {
          try {
            await this.updateProgress(userId, matchingQuest.id, update.progress);
            results.push({
              questId: matchingQuest.id,
              updated: true,
              reason: `Progress updated to ${update.progress}% from chat message`,
            });
            logger.debug({ questId: matchingQuest.id, progress: update.progress, userId }, 'Auto-updated quest progress from chat');
          } catch (error) {
            logger.warn({ error, questId: matchingQuest.id, userId }, 'Failed to update quest progress from extraction');
            results.push({
              questId: matchingQuest.id,
              updated: false,
              reason: 'Failed to update progress',
            });
          }
        }
      }

      return results;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update progress from extraction');
      return results;
    }
  }

  /**
   * Abandon conflicting quests based on life changes
   * Matches quest titles and abandons them automatically
   */
  async abandonConflictingQuests(
    userId: string,
    abandonedQuests: Array<{ questTitle: string; reason: string; confidence: number }>
  ): Promise<Array<{ questId: string; abandoned: boolean; reason: string }>> {
    const results: Array<{ questId: string; abandoned: boolean; reason: string }> = [];

    try {
      // Get all active quests for the user
      const allQuests = await questStorage.getQuests(userId, { status: 'active' });

      for (const abandoned of abandonedQuests) {
        if (abandoned.confidence < 0.7) {
          // Skip low confidence detections
          continue;
        }

        // Find matching quest by title (fuzzy match)
        const matchingQuest = allQuests.find(q => {
          const questTitleLower = q.title.toLowerCase();
          const abandonedTitleLower = abandoned.questTitle.toLowerCase();
          return questTitleLower.includes(abandonedTitleLower) || abandonedTitleLower.includes(questTitleLower);
        });

        if (matchingQuest) {
          try {
            await this.abandonQuest(userId, matchingQuest.id, abandoned.reason);
            results.push({
              questId: matchingQuest.id,
              abandoned: true,
              reason: abandoned.reason,
            });
            logger.debug({ questId: matchingQuest.id, reason: abandoned.reason, userId }, 'Auto-abandoned quest due to life change');
          } catch (error) {
            logger.warn({ error, questId: matchingQuest.id, userId }, 'Failed to abandon quest');
            results.push({
              questId: matchingQuest.id,
              abandoned: false,
              reason: 'Failed to abandon quest',
            });
          }
        }
      }

      return results;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to abandon conflicting quests');
      return results;
    }
  }

  /**
   * Pause quests based on life changes
   */
  async pauseQuestsFromLifeChanges(
    userId: string,
    pausedQuests: Array<{ questTitle: string; reason: string; confidence: number }>
  ): Promise<Array<{ questId: string; paused: boolean; reason: string }>> {
    const results: Array<{ questId: string; paused: boolean; reason: string }> = [];

    try {
      // Get all active quests for the user
      const allQuests = await questStorage.getQuests(userId, { status: 'active' });

      for (const paused of pausedQuests) {
        if (paused.confidence < 0.7) {
          // Skip low confidence detections
          continue;
        }

        // Find matching quest by title (fuzzy match)
        const matchingQuest = allQuests.find(q => {
          const questTitleLower = q.title.toLowerCase();
          const pausedTitleLower = paused.questTitle.toLowerCase();
          return questTitleLower.includes(pausedTitleLower) || pausedTitleLower.includes(questTitleLower);
        });

        if (matchingQuest) {
          try {
            await this.pauseQuest(userId, matchingQuest.id);
            results.push({
              questId: matchingQuest.id,
              paused: true,
              reason: paused.reason,
            });
            logger.debug({ questId: matchingQuest.id, reason: paused.reason, userId }, 'Auto-paused quest due to life change');
          } catch (error) {
            logger.warn({ error, questId: matchingQuest.id, userId }, 'Failed to pause quest');
            results.push({
              questId: matchingQuest.id,
              paused: false,
              reason: 'Failed to pause quest',
            });
          }
        }
      }

      return results;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to pause quests from life changes');
      return results;
    }
  }

  /**
   * Convert abandoned quest to goal
   */
  async convertAbandonedQuestToGoal(userId: string, questId: string, chatContext?: string): Promise<string | null> {
    try {
      const quest = await questStorage.getQuest(userId, questId);
      if (!quest || quest.status !== 'abandoned') {
        logger.warn({ questId, userId, status: quest?.status }, 'Quest not found or not abandoned, cannot convert to goal');
        return null;
      }

      // Import goal storage dynamically to avoid circular dependencies
      const { GoalStorage } = await import('../goals/goalStorage');
      const { GoalStatus } = await import('../goals/types');
      const goalStorage = new GoalStorage();

      // Map quest category to goal type
      const goalTypeMap: Record<string, string> = {
        career: 'CAREER',
        health: 'HEALTH',
        relationships: 'RELATIONSHIP',
        creative: 'CREATIVE',
        financial: 'FINANCIAL',
        personal: 'PERSONAL',
        personal_growth: 'PERSONAL',
        education: 'PERSONAL',
      };

      const goalType = goalTypeMap[quest.category || ''] || 'PERSONAL';

      // Create abandoned goal
      const goal = {
        id: uuid(),
        user_id: userId,
        title: quest.title,
        description: quest.description || `Abandoned quest: ${quest.title}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_action_at: new Date().toISOString(),
        status: 'abandoned' as GoalStatus,
        milestones: quest.milestones?.map(m => ({
          id: uuid(),
          description: m.description,
          achieved: m.achieved,
          achieved_at: m.achieved_at,
        })) || [],
        probability: 0, // Abandoned goals have 0 probability
        dependencies: [],
        source: 'quest' as const,
        source_id: questId,
        metadata: {
          original_quest_id: questId,
          original_quest_type: quest.quest_type,
          original_priority: quest.priority,
          original_importance: quest.importance,
          original_impact: quest.impact,
          abandoned_at: quest.abandoned_at,
          chat_context: chatContext,
        },
      };

      await goalStorage.saveGoals([goal]);
      logger.debug({ questId, goalId: goal.id, userId }, 'Converted abandoned quest to goal');

      return goal.id;
    } catch (error) {
      logger.error({ error, questId, userId }, 'Failed to convert abandoned quest to goal');
      return null;
    }
  }
}

export const questService = new QuestService();
