import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type {
  Quest,
  QuestHistory,
  QuestDependency,
  QuestAchievement,
  QuestFilters,
} from './types';

/**
 * Handles storage and retrieval of quests
 */
export class QuestStorage {
  /**
   * Save quest
   */
  async saveQuest(quest: Quest): Promise<Quest> {
    try {
      const { data, error } = await supabaseAdmin
        .from('quests')
        .upsert(
          {
            id: quest.id,
            user_id: quest.user_id,
            title: quest.title,
            description: quest.description,
            quest_type: quest.quest_type,
            priority: quest.priority,
            importance: quest.importance,
            impact: quest.impact,
            difficulty: quest.difficulty,
            effort_hours: quest.effort_hours,
            status: quest.status,
            started_at: quest.started_at,
            completed_at: quest.completed_at,
            abandoned_at: quest.abandoned_at,
            completion_notes: quest.completion_notes,
            parent_quest_id: quest.parent_quest_id,
            related_goal_id: quest.related_goal_id,
            related_task_id: quest.related_task_id,
            quest_chain_id: quest.quest_chain_id,
            progress_percentage: quest.progress_percentage,
            milestones: quest.milestones || [],
            reward_description: quest.reward_description,
            motivation_notes: quest.motivation_notes,
            estimated_completion_date: quest.estimated_completion_date,
            actual_completion_date: quest.actual_completion_date,
            time_spent_hours: quest.time_spent_hours,
            tags: quest.tags || [],
            category: quest.category,
            source: quest.source,
            metadata: quest.metadata || {},
            updated_at: new Date().toISOString(),
            last_activity_at: quest.last_activity_at || new Date().toISOString(),
          },
          {
            onConflict: 'id',
          }
        )
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to save quest');
        throw error;
      }

      logger.debug({ questId: data?.id }, 'Saved quest');
      return this.mapRowToQuest(data);
    } catch (error) {
      logger.error({ error }, 'Failed to save quest');
      throw error;
    }
  }

  /**
   * Get quest by ID
   */
  async getQuest(userId: string, questId: string): Promise<Quest | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('quests')
        .select('*')
        .eq('id', questId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not found
        }
        logger.error({ error }, 'Failed to get quest');
        throw error;
      }

      return this.mapRowToQuest(data);
    } catch (error) {
      logger.error({ error }, 'Failed to get quest');
      throw error;
    }
  }

  /**
   * Get quests with filters
   */
  async getQuests(userId: string, filters: QuestFilters = {}): Promise<Quest[]> {
    try {
      let query = supabaseAdmin
        .from('quests')
        .select('*')
        .eq('user_id', userId);

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters.quest_type) {
        if (Array.isArray(filters.quest_type)) {
          query = query.in('quest_type', filters.quest_type);
        } else {
          query = query.eq('quest_type', filters.quest_type);
        }
      }

      if (filters.category) {
        query = query.eq('category', filters.category);
      }

      if (filters.tags && filters.tags.length > 0) {
        query = query.contains('tags', filters.tags);
      }

      if (filters.min_priority) {
        query = query.gte('priority', filters.min_priority);
      }

      if (filters.min_importance) {
        query = query.gte('importance', filters.min_importance);
      }

      if (filters.min_impact) {
        query = query.gte('impact', filters.min_impact);
      }

      if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 100) - 1);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get quests');
        throw error;
      }

      return (data || []).map(row => this.mapRowToQuest(row));
    } catch (error) {
      logger.error({ error }, 'Failed to get quests');
      throw error;
    }
  }

  /**
   * Update quest
   */
  async updateQuest(userId: string, questId: string, updates: Partial<Quest>): Promise<Quest> {
    try {
      const updateData: any = {
        ...updates,
        updated_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from('quests')
        .update(updateData)
        .eq('id', questId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to update quest');
        throw error;
      }

      return this.mapRowToQuest(data);
    } catch (error) {
      logger.error({ error }, 'Failed to update quest');
      throw error;
    }
  }

  /**
   * Delete quest
   */
  async deleteQuest(userId: string, questId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('quests')
        .delete()
        .eq('id', questId)
        .eq('user_id', userId);

      if (error) {
        logger.error({ error }, 'Failed to delete quest');
        throw error;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to delete quest');
      throw error;
    }
  }

  /**
   * Save history event
   */
  async saveHistoryEvent(event: QuestHistory): Promise<QuestHistory> {
    try {
      const { data, error } = await supabaseAdmin
        .from('quest_history')
        .insert({
          quest_id: event.quest_id,
          user_id: event.user_id,
          event_type: event.event_type,
          description: event.description,
          progress_before: event.progress_before,
          progress_after: event.progress_after,
          notes: event.notes,
          journal_entry_id: event.journal_entry_id,
          related_quest_ids: event.related_quest_ids || [],
          metadata: event.metadata || {},
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to save quest history');
        throw error;
      }

      return this.mapRowToHistory(data);
    } catch (error) {
      logger.error({ error }, 'Failed to save quest history');
      throw error;
    }
  }

  /**
   * Get quest history
   */
  async getQuestHistory(userId: string, questId: string): Promise<QuestHistory[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('quest_history')
        .select('*')
        .eq('quest_id', questId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error }, 'Failed to get quest history');
        throw error;
      }

      return (data || []).map(row => this.mapRowToHistory(row));
    } catch (error) {
      logger.error({ error }, 'Failed to get quest history');
      throw error;
    }
  }

  /**
   * Add dependency
   */
  async addDependency(questId: string, dependsOnQuestId: string, type: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('quest_dependencies')
        .insert({
          quest_id: questId,
          depends_on_quest_id: dependsOnQuestId,
          dependency_type: type,
        });

      if (error) {
        logger.error({ error }, 'Failed to add quest dependency');
        throw error;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to add quest dependency');
      throw error;
    }
  }

  /**
   * Get dependencies
   */
  async getDependencies(questId: string): Promise<QuestDependency[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('quest_dependencies')
        .select('*')
        .eq('quest_id', questId);

      if (error) {
        logger.error({ error }, 'Failed to get quest dependencies');
        throw error;
      }

      return (data || []).map(row => ({
        id: row.id,
        quest_id: row.quest_id,
        depends_on_quest_id: row.depends_on_quest_id,
        dependency_type: row.dependency_type,
        created_at: row.created_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get quest dependencies');
      throw error;
    }
  }

  /**
   * Get dependent quests (quests that depend on this one)
   */
  async getDependentQuests(questId: string): Promise<QuestDependency[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('quest_dependencies')
        .select('*')
        .eq('depends_on_quest_id', questId);

      if (error) {
        logger.error({ error }, 'Failed to get dependent quests');
        throw error;
      }

      return (data || []).map(row => ({
        id: row.id,
        quest_id: row.quest_id,
        depends_on_quest_id: row.depends_on_quest_id,
        dependency_type: row.dependency_type,
        created_at: row.created_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get dependent quests');
      throw error;
    }
  }

  /**
   * Delete dependency
   */
  async deleteDependency(dependencyId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('quest_dependencies')
        .delete()
        .eq('id', dependencyId);

      if (error) {
        logger.error({ error }, 'Failed to delete quest dependency');
        throw error;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to delete quest dependency');
      throw error;
    }
  }

  /**
   * Map database row to Quest
   */
  private mapRowToQuest(row: any): Quest {
    return {
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      description: row.description,
      quest_type: row.quest_type,
      priority: row.priority,
      importance: row.importance,
      impact: row.impact,
      difficulty: row.difficulty,
      effort_hours: row.effort_hours ? parseFloat(row.effort_hours) : undefined,
      status: row.status,
      started_at: row.started_at,
      completed_at: row.completed_at,
      abandoned_at: row.abandoned_at,
      completion_notes: row.completion_notes,
      parent_quest_id: row.parent_quest_id,
      related_goal_id: row.related_goal_id,
      related_task_id: row.related_task_id,
      quest_chain_id: row.quest_chain_id,
      progress_percentage: row.progress_percentage ? parseFloat(row.progress_percentage) : 0,
      milestones: row.milestones || [],
      reward_description: row.reward_description,
      motivation_notes: row.motivation_notes,
      estimated_completion_date: row.estimated_completion_date,
      actual_completion_date: row.actual_completion_date,
      time_spent_hours: row.time_spent_hours ? parseFloat(row.time_spent_hours) : undefined,
      tags: row.tags || [],
      category: row.category,
      source: row.source,
      metadata: row.metadata || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_activity_at: row.last_activity_at,
    };
  }

  /**
   * Map database row to QuestHistory
   */
  private mapRowToHistory(row: any): QuestHistory {
    return {
      id: row.id,
      quest_id: row.quest_id,
      user_id: row.user_id,
      event_type: row.event_type,
      description: row.description,
      progress_before: row.progress_before ? parseFloat(row.progress_before) : undefined,
      progress_after: row.progress_after ? parseFloat(row.progress_after) : undefined,
      notes: row.notes,
      journal_entry_id: row.journal_entry_id,
      related_quest_ids: row.related_quest_ids || [],
      created_at: row.created_at,
      metadata: row.metadata || {},
    };
  }
}

export const questStorage = new QuestStorage();
