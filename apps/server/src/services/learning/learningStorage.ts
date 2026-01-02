import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { v4 as uuid } from 'uuid';
import type {
  LearningRecord,
  LearningPattern,
  LearningType,
  ProficiencyLevel,
} from './types';

/**
 * Storage service for learning records
 */
export class LearningStorageService {
  /**
   * Save learning records to database
   */
  async saveLearningRecords(
    userId: string,
    learning: LearningRecord[]
  ): Promise<LearningRecord[]> {
    if (learning.length === 0) return [];

    try {
      const saved: LearningRecord[] = [];

      for (const l of learning) {
        // Check for existing learning with same name
        const existing = await this.findExistingLearning(userId, l.name, l.type);
        
        if (existing) {
          // Update existing learning (increment practice, update proficiency if improved)
          const updated = await this.updateLearningProgress(existing.id, l);
          if (updated) saved.push(updated);
        } else {
          // Create new learning record
          const newLearning = {
            ...l,
            id: uuid(),
            user_id: userId,
          };

          const { data, error } = await supabaseAdmin
            .from('learning_records')
            .insert({
              id: newLearning.id,
              user_id: newLearning.user_id,
              type: newLearning.type,
              name: newLearning.name,
              description: newLearning.description,
              proficiency: newLearning.proficiency,
              confidence: newLearning.confidence,
              source: newLearning.source,
              source_id: newLearning.source_id,
              source_date: newLearning.source_date,
              tags: newLearning.tags,
              related_experiences: newLearning.related_experiences,
              related_projects: newLearning.related_projects,
              first_mentioned: newLearning.first_mentioned,
              last_mentioned: newLearning.last_mentioned,
              progress_timeline: newLearning.progress_timeline,
              practice_count: newLearning.practice_count,
              mastery_indicators: newLearning.mastery_indicators,
              metadata: newLearning.metadata,
            })
            .select()
            .single();

          if (error) {
            logger.error({ error, learningId: newLearning.id }, 'Failed to save learning record');
          } else {
            saved.push(this.mapDbToLearning(data));
          }
        }
      }

      logger.debug({ userId, saved: saved.length }, 'Saved learning records');
      return saved;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to save learning records');
      return [];
    }
  }

  /**
   * Find existing learning record
   */
  private async findExistingLearning(
    userId: string,
    name: string,
    type: LearningType
  ): Promise<LearningRecord | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('learning_records')
        .select('*')
        .eq('user_id', userId)
        .eq('name', name)
        .eq('type', type)
        .single();

      if (error || !data) return null;

      return this.mapDbToLearning(data);
    } catch (error) {
      logger.warn({ error }, 'Failed to find existing learning');
      return null;
    }
  }

  /**
   * Update learning progress
   */
  private async updateLearningProgress(
    learningId: string,
    newLearning: LearningRecord
  ): Promise<LearningRecord | null> {
    try {
      // Get existing learning
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('learning_records')
        .select('*')
        .eq('id', learningId)
        .single();

      if (fetchError || !existing) return null;

      // Check if proficiency improved
      const proficiencyLevels: ProficiencyLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];
      const currentLevel = proficiencyLevels.indexOf(existing.proficiency);
      const newLevel = proficiencyLevels.indexOf(newLearning.proficiency);
      
      const proficiencyImproved = newLevel > currentLevel;
      const newProficiency = proficiencyImproved ? newLearning.proficiency : existing.proficiency;

      // Update progress timeline
      const progressTimeline = (existing.progress_timeline as any[]) || [];
      if (proficiencyImproved || newLearning.proficiency !== existing.proficiency) {
        progressTimeline.push({
          date: newLearning.source_date,
          proficiency: newLearning.proficiency,
          evidence: newLearning.description,
          source_id: newLearning.source_id,
        });
      }

      // Update learning record
      const { data, error } = await supabaseAdmin
        .from('learning_records')
        .update({
          proficiency: newProficiency,
          practice_count: existing.practice_count + 1,
          last_mentioned: newLearning.source_date,
          progress_timeline: progressTimeline,
          updated_at: new Date().toISOString(),
        })
        .eq('id', learningId)
        .select()
        .single();

      if (error) {
        logger.error({ error, learningId }, 'Failed to update learning progress');
        return null;
      }

      return this.mapDbToLearning(data);
    } catch (error) {
      logger.error({ error, learningId }, 'Failed to update learning progress');
      return null;
    }
  }

  /**
   * Get learning records for user
   */
  async getLearningRecords(
    userId: string,
    options?: {
      type?: LearningType;
      proficiency?: ProficiencyLevel;
      limit?: number;
      orderBy?: 'date' | 'practice' | 'proficiency';
    }
  ): Promise<LearningRecord[]> {
    try {
      let query = supabaseAdmin
        .from('learning_records')
        .select('*')
        .eq('user_id', userId);

      if (options?.type) {
        query = query.eq('type', options.type);
      }

      if (options?.proficiency) {
        query = query.eq('proficiency', options.proficiency);
      }

      const orderBy = options?.orderBy || 'date';
      if (orderBy === 'date') {
        query = query.order('source_date', { ascending: false });
      } else if (orderBy === 'practice') {
        query = query.order('practice_count', { ascending: false });
      } else if (orderBy === 'proficiency') {
        // Custom ordering for proficiency
        query = query.order('proficiency', { ascending: false });
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch learning records');
        return [];
      }

      return (data || []).map(this.mapDbToLearning);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to fetch learning records');
      return [];
    }
  }

  /**
   * Get learning patterns
   */
  async getLearningPatterns(userId: string): Promise<LearningPattern[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('learning_patterns')
        .select('*')
        .eq('user_id', userId)
        .order('growth_rate', { ascending: false });

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch learning patterns');
        return [];
      }

      return (data || []).map(this.mapDbToPattern);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to fetch learning patterns');
      return [];
    }
  }

  /**
   * Map database record to LearningRecord
   */
  private mapDbToLearning(record: any): LearningRecord {
    return {
      id: record.id,
      user_id: record.user_id,
      type: record.type,
      name: record.name,
      description: record.description || '',
      proficiency: record.proficiency,
      confidence: record.confidence,
      source: record.source,
      source_id: record.source_id,
      source_date: record.source_date,
      tags: record.tags || [],
      related_experiences: record.related_experiences || [],
      related_projects: record.related_projects || [],
      first_mentioned: record.first_mentioned,
      last_mentioned: record.last_mentioned,
      progress_timeline: record.progress_timeline || [],
      practice_count: record.practice_count || 1,
      mastery_indicators: record.mastery_indicators || [],
      metadata: record.metadata || {},
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }

  /**
   * Map database record to LearningPattern
   */
  private mapDbToPattern(record: any): LearningPattern {
    return {
      theme: record.theme,
      records: record.record_ids || [],
      total_skills: record.total_skills || 0,
      avg_proficiency: record.avg_proficiency || 0,
      first_learned: record.first_learned,
      last_learned: record.last_learned,
      growth_rate: record.growth_rate || 0,
    };
  }
}

export const learningStorageService = new LearningStorageService();

