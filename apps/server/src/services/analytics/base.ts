/**
 * Base Analytics Module
 * Provides common functionality for all analytics modules
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { AnalyticsModuleType, AnalyticsPayload, MemoryData } from './types';

export abstract class BaseAnalyticsModule {
  protected abstract readonly moduleType: AnalyticsModuleType;
  protected readonly CACHE_TTL_HOURS = 6;

  /**
   * Main entry point - must be implemented by each module
   */
  abstract run(userId: string): Promise<AnalyticsPayload>;

  /**
   * Get cached result if available and not expired
   */
  protected async getCachedResult(userId: string): Promise<AnalyticsPayload | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('analytics_cache')
        .select('*')
        .eq('user_id', userId)
        .eq('type', this.moduleType)
        .single();

      if (error || !data) {
        return null;
      }

      // Check if expired
      const now = new Date();
      const updatedAt = new Date(data.updated_at);
      const expiresAt = data.expires_at ? new Date(data.expires_at) : null;

      if (expiresAt && now > expiresAt) {
        return null;
      }

      // Check TTL
      const hoursSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceUpdate > this.CACHE_TTL_HOURS) {
        return null;
      }

      return data.payload as AnalyticsPayload;
    } catch (error) {
      logger.error({ error, userId, moduleType: this.moduleType }, 'Error getting cached analytics');
      return null;
    }
  }

  /**
   * Store result in cache
   */
  protected async cacheResult(userId: string, payload: AnalyticsPayload): Promise<void> {
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.CACHE_TTL_HOURS);

      const { error } = await supabaseAdmin
        .from('analytics_cache')
        .upsert({
          user_id: userId,
          type: this.moduleType,
          payload,
          updated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        }, {
          onConflict: 'user_id,type'
        });

      if (error) {
        logger.error({ error, userId, moduleType: this.moduleType }, 'Error caching analytics result');
      }
    } catch (error) {
      logger.error({ error, userId, moduleType: this.moduleType }, 'Error caching analytics result');
    }
  }

  /**
   * Fetch all memories for a user
   */
  protected async fetchMemories(userId: string, limit: number = 1000): Promise<MemoryData[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, created_at, sentiment, mood, tags, people, embedding')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ error, userId }, 'Error fetching memories');
        return [];
      }

      return (data || []).map(entry => ({
        id: entry.id,
        text: entry.content,
        created_at: entry.created_at,
        sentiment: entry.sentiment,
        mood: entry.mood,
        topics: entry.tags || [],
        people: entry.people || [],
        embedding: entry.embedding as number[] | null,
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Error fetching memories');
      return [];
    }
  }

  /**
   * Cosine similarity between two vectors
   */
  protected cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Exponential Moving Average
   */
  protected ema(values: number[], alpha: number = 0.3): number[] {
    if (values.length === 0) return [];
    
    const result: number[] = [values[0]];
    for (let i = 1; i < values.length; i++) {
      result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
    }
    return result;
  }

  /**
   * Standard deviation
   */
  protected standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Rolling window statistics
   */
  protected rollingWindow<T>(
    data: T[],
    windowSize: number,
    fn: (window: T[]) => number
  ): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const window = data.slice(Math.max(0, i - windowSize + 1), i + 1);
      result.push(fn(window));
    }
    return result;
  }
}

