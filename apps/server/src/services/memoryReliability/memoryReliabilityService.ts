/**
 * Memory Reliability Service
 * 
 * Scores memory reliability based on:
 * - Temporal distance (days between event and recording)
 * - Emotional state at time of recording
 * - Retelling count (how many times story was retold)
 * - Cross-reference consistency (agreement with other entries)
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { MemoryEntry } from '../../types';

export interface MemoryReliabilityScore {
  id: string;
  user_id: string;
  entry_id: string;
  reliability_score: number; // 0-1
  temporal_distance_days: number;
  emotional_state: 'trauma' | 'stress' | 'calm' | 'euphoria' | 'neutral' | 'unknown';
  retelling_count: number;
  cross_references: string[]; // Entry IDs
  consistency_score: number; // 0-1
  factors: {
    temporal_penalty: number;
    emotional_penalty: number;
    retelling_penalty: number;
    consistency_bonus: number;
  };
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

class MemoryReliabilityService {
  /**
   * Calculate and store reliability score for an entry
   */
  async calculateReliability(
    userId: string,
    entry: MemoryEntry
  ): Promise<MemoryReliabilityScore> {
    try {
      // 1. Calculate temporal distance
      const entryDate = new Date(entry.date);
      const writtenDate = new Date(entry.created_at || entry.date);
      const temporalDistance = Math.floor(
        (writtenDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // 2. Determine emotional state
      const emotionalState = this.determineEmotionalState(entry);

      // 3. Count retellings
      const retellingCount = await this.countRetellings(userId, entry);

      // 4. Find cross-references
      const crossReferences = await this.findCrossReferences(userId, entry);

      // 5. Calculate consistency with cross-references
      const consistencyScore = await this.calculateConsistency(
        userId,
        entry,
        crossReferences
      );

      // 6. Calculate reliability score
      const factors = this.calculateFactors(
        temporalDistance,
        emotionalState,
        retellingCount,
        consistencyScore
      );

      const reliabilityScore = Math.max(0, Math.min(1,
        1.0 - factors.temporal_penalty - factors.emotional_penalty
        - factors.retelling_penalty + factors.consistency_bonus
      ));

      // 7. Store or update score
      const score: Partial<MemoryReliabilityScore> = {
        user_id: userId,
        entry_id: entry.id,
        reliability_score: reliabilityScore,
        temporal_distance_days: temporalDistance,
        emotional_state: emotionalState,
        retelling_count: retellingCount,
        cross_references: crossReferences,
        consistency_score: consistencyScore,
        factors,
        metadata: {},
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await supabaseAdmin
        .from('memory_reliability_scores')
        .select('id')
        .eq('user_id', userId)
        .eq('entry_id', entry.id)
        .single();

      let result;
      if (existing) {
        // Update
        const { data, error } = await supabaseAdmin
          .from('memory_reliability_scores')
          .update(score)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Insert
        const { data, error } = await supabaseAdmin
          .from('memory_reliability_scores')
          .insert(score)
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      return result as MemoryReliabilityScore;
    } catch (error) {
      logger.error({ err: error, userId, entryId: entry.id }, 'Failed to calculate reliability');
      throw error;
    }
  }

  /**
   * Determine emotional state from entry
   */
  private determineEmotionalState(entry: MemoryEntry): MemoryReliabilityScore['emotional_state'] {
    const mood = entry.mood?.toLowerCase() || '';
    const content = entry.content.toLowerCase();

    // Trauma indicators
    if (mood.includes('trauma') || content.includes('trauma') || content.includes('ptsd')) {
      return 'trauma';
    }

    // Stress indicators
    if (mood.includes('stress') || mood.includes('anxious') || mood.includes('worried')) {
      return 'stress';
    }

    // Euphoria indicators
    if (mood.includes('euphoria') || mood.includes('ecstatic') || mood.includes('manic')) {
      return 'euphoria';
    }

    // Calm indicators
    if (mood.includes('calm') || mood.includes('peaceful') || mood.includes('content')) {
      return 'calm';
    }

    return 'neutral';
  }

  /**
   * Count how many times this event has been retold
   */
  private async countRetellings(
    userId: string,
    entry: MemoryEntry
  ): Promise<number> {
    try {
      // Check retelling groups
      const { data } = await supabaseAdmin
        .from('retelling_groups')
        .select('retelling_count')
        .eq('user_id', userId)
        .contains('entry_ids', [entry.id])
        .single();

      return data?.retelling_count || 0;
    } catch (error) {
      // No retelling group found
      return 0;
    }
  }

  /**
   * Find entries that mention the same event
   */
  private async findCrossReferences(
    userId: string,
    entry: MemoryEntry
  ): Promise<string[]> {
    try {
      // Use semantic similarity to find related entries
      // For now, use simple keyword matching
      const keywords = this.extractKeywords(entry.content);
      
      if (keywords.length === 0) return [];

      // Find entries with similar keywords
      const { data } = await supabaseAdmin
        .from('journal_entries')
        .select('id')
        .eq('user_id', userId)
        .neq('id', entry.id)
        .limit(20);

      if (!data) return [];

      // Filter by keyword overlap (simplified)
      const crossRefs = data
        .filter(e => {
          // Would use semantic similarity in production
          return true; // Placeholder
        })
        .map(e => e.id);

      return crossRefs;
    } catch (error) {
      logger.warn({ err: error }, 'Failed to find cross-references');
      return [];
    }
  }

  /**
   * Extract keywords from content
   */
  private extractKeywords(content: string): string[] {
    // Simple keyword extraction (would use NLP in production)
    const words = content.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'i', 'you', 'he', 'she', 'it', 'we', 'they']);
    return words.filter(w => w.length > 4 && !stopWords.has(w)).slice(0, 10);
  }

  /**
   * Calculate consistency with cross-referenced entries
   */
  private async calculateConsistency(
    userId: string,
    entry: MemoryEntry,
    crossReferences: string[]
  ): Promise<number> {
    if (crossReferences.length === 0) return 0.5; // Neutral if no references

    try {
      // Get cross-referenced entries
      const { data: refEntries } = await supabaseAdmin
        .from('journal_entries')
        .select('content')
        .eq('user_id', userId)
        .in('id', crossReferences);

      if (!refEntries || refEntries.length === 0) return 0.5;

      // Calculate semantic similarity (simplified)
      // In production, would use embeddings
      const entryKeywords = new Set(this.extractKeywords(entry.content));
      let totalSimilarity = 0;

      for (const ref of refEntries) {
        const refKeywords = new Set(this.extractKeywords(ref.content));
        const intersection = new Set([...entryKeywords].filter(x => refKeywords.has(x)));
        const union = new Set([...entryKeywords, ...refKeywords]);
        const similarity = intersection.size / union.size;
        totalSimilarity += similarity;
      }

      return totalSimilarity / refEntries.length;
    } catch (error) {
      logger.warn({ err: error }, 'Failed to calculate consistency');
      return 0.5;
    }
  }

  /**
   * Calculate reliability factors
   */
  private calculateFactors(
    temporalDistance: number,
    emotionalState: MemoryReliabilityScore['emotional_state'],
    retellingCount: number,
    consistencyScore: number
  ): MemoryReliabilityScore['factors'] {
    // Temporal penalty: increases with time
    const temporalPenalty = Math.min(0.4, temporalDistance / 3650); // Max 40% penalty after 10 years

    // Emotional penalty
    const emotionalPenalties: Record<MemoryReliabilityScore['emotional_state'], number> = {
      trauma: 0.3,
      stress: 0.15,
      euphoria: 0.2,
      calm: 0.0,
      neutral: 0.05,
      unknown: 0.1,
    };
    const emotionalPenalty = emotionalPenalties[emotionalState] || 0.1;

    // Retelling penalty: increases with retelling count
    const retellingPenalty = Math.min(0.2, retellingCount * 0.05); // Max 20% penalty

    // Consistency bonus: increases with agreement
    const consistencyBonus = (consistencyScore - 0.5) * 0.2; // Up to 10% bonus

    return {
      temporal_penalty: temporalPenalty,
      emotional_penalty: emotionalPenalty,
      retelling_penalty: retellingPenalty,
      consistency_bonus: consistencyBonus,
    };
  }

  /**
   * Get reliability score for an entry
   */
  async getReliabilityScore(
    userId: string,
    entryId: string
  ): Promise<MemoryReliabilityScore | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('memory_reliability_scores')
        .select('*')
        .eq('user_id', userId)
        .eq('entry_id', entryId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data as MemoryReliabilityScore;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get reliability score');
      return null;
    }
  }
}

export const memoryReliabilityService = new MemoryReliabilityService();
