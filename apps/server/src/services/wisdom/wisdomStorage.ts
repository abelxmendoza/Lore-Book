import { v4 as uuid } from 'uuid';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type {
  WisdomStatement,
  WisdomPattern,
  WisdomCategory,
} from './types';

/**
 * Storage service for wisdom statements
 */
export class WisdomStorageService {
  /**
   * Save wisdom statements to database
   */
  async saveWisdomStatements(
    userId: string,
    wisdom: WisdomStatement[]
  ): Promise<WisdomStatement[]> {
    if (wisdom.length === 0) return [];

    try {
      const saved: WisdomStatement[] = [];

      for (const w of wisdom) {
        // Check for similar existing wisdom to avoid duplicates
        const existing = await this.findSimilarWisdom(userId, w.statement);
        
        if (existing) {
          // Update existing wisdom (increment recurrence, update last_seen)
          const updated = await this.updateWisdomRecurrence(existing.id, w);
          if (updated) saved.push(updated);
        } else {
          // Create new wisdom statement
          const newWisdom = {
            ...w,
            id: uuid(),
            user_id: userId,
          };

          const { data, error } = await supabaseAdmin
            .from('wisdom_statements')
            .insert({
              id: newWisdom.id,
              user_id: newWisdom.user_id,
              category: newWisdom.category,
              statement: newWisdom.statement,
              context: newWisdom.context,
              confidence: newWisdom.confidence,
              source: newWisdom.source,
              source_id: newWisdom.source_id,
              source_date: newWisdom.source_date,
              tags: newWisdom.tags,
              related_experiences: newWisdom.related_experiences,
              related_patterns: newWisdom.related_patterns,
              recurrence_count: newWisdom.recurrence_count,
              first_seen: newWisdom.first_seen,
              last_seen: newWisdom.last_seen,
              evolution: newWisdom.evolution,
              metadata: newWisdom.metadata,
            })
            .select()
            .single();

          if (error) {
            logger.error({ error, wisdomId: newWisdom.id }, 'Failed to save wisdom statement');
          } else {
            saved.push(this.mapDbToWisdom(data));
          }
        }
      }

      logger.debug({ userId, saved: saved.length }, 'Saved wisdom statements');
      return saved;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to save wisdom statements');
      return [];
    }
  }

  /**
   * Find similar existing wisdom
   */
  private async findSimilarWisdom(
    userId: string,
    statement: string
  ): Promise<WisdomStatement | null> {
    try {
      // Get all wisdom for user
      const { data, error } = await supabaseAdmin
        .from('wisdom_statements')
        .select('*')
        .eq('user_id', userId)
        .limit(1000);

      if (error || !data) return null;

      // Find similar using simple similarity check
      const lowerStatement = statement.toLowerCase();
      for (const w of data) {
        const existingLower = w.statement.toLowerCase();
        
        // Check for high similarity (same core message)
        const similarity = this.calculateSimilarity(lowerStatement, existingLower);
        if (similarity > 0.7) {
          return this.mapDbToWisdom(w);
        }
      }

      return null;
    } catch (error) {
      logger.warn({ error }, 'Failed to find similar wisdom');
      return null;
    }
  }

  /**
   * Calculate similarity between two strings
   */
  private calculateSimilarity(a: string, b: string): number {
    // Simple word overlap similarity
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    
    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    
    return intersection.size / union.size;
  }

  /**
   * Update wisdom recurrence count
   */
  private async updateWisdomRecurrence(
    wisdomId: string,
    newWisdom: WisdomStatement
  ): Promise<WisdomStatement | null> {
    try {
      // Get existing wisdom
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('wisdom_statements')
        .select('*')
        .eq('id', wisdomId)
        .single();

      if (fetchError || !existing) return null;

      // Update recurrence and evolution
      const evolution = (existing.evolution as any[]) || [];
      evolution.push({
        date: newWisdom.source_date,
        statement: newWisdom.statement,
        context: newWisdom.context,
        source_id: newWisdom.source_id,
      });

      const { data, error } = await supabaseAdmin
        .from('wisdom_statements')
        .update({
          recurrence_count: existing.recurrence_count + 1,
          last_seen: newWisdom.source_date,
          evolution,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wisdomId)
        .select()
        .single();

      if (error) {
        logger.error({ error, wisdomId }, 'Failed to update wisdom recurrence');
        return null;
      }

      return this.mapDbToWisdom(data);
    } catch (error) {
      logger.error({ error, wisdomId }, 'Failed to update wisdom recurrence');
      return null;
    }
  }

  /**
   * Get wisdom statements for user
   */
  async getWisdomStatements(
    userId: string,
    options?: {
      category?: WisdomCategory;
      limit?: number;
      orderBy?: 'date' | 'recurrence' | 'confidence';
    }
  ): Promise<WisdomStatement[]> {
    try {
      let query = supabaseAdmin
        .from('wisdom_statements')
        .select('*')
        .eq('user_id', userId);

      if (options?.category) {
        query = query.eq('category', options.category);
      }

      const orderBy = options?.orderBy || 'date';
      if (orderBy === 'date') {
        query = query.order('source_date', { ascending: false });
      } else if (orderBy === 'recurrence') {
        query = query.order('recurrence_count', { ascending: false });
      } else if (orderBy === 'confidence') {
        query = query.order('confidence', { ascending: false });
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch wisdom statements');
        return [];
      }

      return (data || []).map(this.mapDbToWisdom);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to fetch wisdom statements');
      return [];
    }
  }

  /**
   * Get wisdom patterns (recurring themes)
   */
  async getWisdomPatterns(userId: string): Promise<WisdomPattern[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('wisdom_patterns')
        .select('*')
        .eq('user_id', userId)
        .order('frequency', { ascending: false });

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch wisdom patterns');
        return [];
      }

      return (data || []).map(this.mapDbToPattern);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to fetch wisdom patterns');
      return [];
    }
  }

  /**
   * Map database record to WisdomStatement
   */
  private mapDbToWisdom(record: any): WisdomStatement {
    return {
      id: record.id,
      user_id: record.user_id,
      category: record.category,
      statement: record.statement,
      context: record.context,
      confidence: record.confidence,
      source: record.source,
      source_id: record.source_id,
      source_date: record.source_date,
      tags: record.tags || [],
      related_experiences: record.related_experiences || [],
      related_patterns: record.related_patterns || [],
      recurrence_count: record.recurrence_count || 1,
      first_seen: record.first_seen,
      last_seen: record.last_seen,
      evolution: record.evolution || [],
      metadata: record.metadata || {},
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }

  /**
   * Map database record to WisdomPattern
   */
  private mapDbToPattern(record: any): WisdomPattern {
    return {
      theme: record.theme,
      statements: record.statement_ids || [],
      frequency: record.frequency || 1,
      first_seen: record.first_seen,
      last_seen: record.last_seen,
      evolution_timeline: record.evolution_timeline || [],
    };
  }
}

export const wisdomStorageService = new WisdomStorageService();

