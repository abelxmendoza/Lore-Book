/**
 * Chapter Progression Engine
 * Tracks chapter completion and generates ratings
 * All stats are hidden - only used for generating natural language insights
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export interface ChapterStats {
  id: string;
  user_id: string;
  chapter_id: string | null;
  chapter_title: string | null;
  chapter_period_start: string | null;
  chapter_period_end: string | null;
  completion_status: 'active' | 'completed' | 'paused';
  xp_earned: number;
  quests_completed: number;
  skills_gained: string[];
  difficulty_rating: number | null;
  enjoyment_rating: number | null;
  growth_rating: number | null;
  reflection_bonus: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export class ChapterEngine {
  /**
   * Calculate or update chapter stats
   */
  async calculateChapterStats(userId: string, chapterId: string): Promise<ChapterStats> {
    try {
      // Get chapter data
      const { data: chapter, error: chapterError } = await supabaseAdmin
        .from('chapters')
        .select('*')
        .eq('id', chapterId)
        .eq('user_id', userId)
        .single();

      if (chapterError || !chapter) {
        logger.error({ error: chapterError, userId, chapterId }, 'Failed to fetch chapter');
        throw chapterError || new Error('Chapter not found');
      }

      // Get journal entries in this chapter
      const { data: entries, error: entriesError } = await supabaseAdmin
        .from('journal_entries')
        .select('id, sentiment, mood, created_at')
        .eq('user_id', userId)
        .eq('chapter_id', chapterId);

      if (entriesError) {
        logger.error({ error: entriesError, userId, chapterId }, 'Failed to fetch journal entries');
        throw entriesError;
      }

      // Calculate XP earned (hidden)
      const xpEarned = this.calculateXPEarned(entries || []);

      // Count quests completed during chapter period
      const questsCompleted = await this.countQuestsCompleted(userId, chapter.start_date, chapter.end_date);

      // Track skills gained during chapter
      const skillsGained = await this.getSkillsGained(userId, chapter.start_date, chapter.end_date);

      // Determine completion status
      const completionStatus = this.determineCompletionStatus(chapter, entries || []);

      // Calculate ratings from sentiment analysis
      const { difficultyRating, enjoymentRating, growthRating } = await this.calculateRatings(entries || []);

      // Calculate reflection bonus
      const reflectionBonus = this.calculateReflectionBonus(entries || []);

      // Upsert stats
      const stats: Partial<ChapterStats> = {
        user_id: userId,
        chapter_id: chapterId,
        chapter_title: chapter.title || null,
        chapter_period_start: chapter.start_date || null,
        chapter_period_end: chapter.end_date || null,
        completion_status: completionStatus,
        xp_earned: xpEarned,
        quests_completed: questsCompleted,
        skills_gained: skillsGained,
        difficulty_rating: difficultyRating,
        enjoyment_rating: enjoymentRating,
        growth_rating: growthRating,
        reflection_bonus: reflectionBonus,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from('chapter_stats')
        .upsert(stats, {
          onConflict: 'user_id,chapter_id',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, chapterId }, 'Failed to upsert chapter stats');
        throw error;
      }

      return data as ChapterStats;
    } catch (error) {
      logger.error({ error, userId, chapterId }, 'Failed to calculate chapter stats');
      throw error;
    }
  }

  /**
   * Calculate XP earned from entries (hidden)
   */
  private calculateXPEarned(entries: Array<{ sentiment: number | null }>): number {
    // Base XP per entry
    const baseXP = 10;
    let totalXP = entries.length * baseXP;

    // Bonus XP for positive sentiment
    for (const entry of entries) {
      if (entry.sentiment && entry.sentiment > 0.5) {
        totalXP += 5;
      }
    }

    return totalXP;
  }

  /**
   * Count quests completed during chapter period
   */
  private async countQuestsCompleted(userId: string, startDate: string | null, endDate: string | null): Promise<number> {
    if (!startDate) return 0;

    let query = supabaseAdmin
      .from('quests')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('completed_at', startDate);

    if (endDate) {
      query = query.lte('completed_at', endDate);
    }

    const { count, error } = await query;

    if (error) {
      logger.error({ error, userId }, 'Failed to count quests');
      return 0;
    }

    return count || 0;
  }

  /**
   * Get skills gained during chapter period
   */
  private async getSkillsGained(userId: string, startDate: string | null, endDate: string | null): Promise<string[]> {
    if (!startDate) return [];

    let query = supabaseAdmin
      .from('skills')
      .select('skill_name')
      .eq('user_id', userId)
      .gte('first_mentioned_at', startDate);

    if (endDate) {
      query = query.lte('first_mentioned_at', endDate);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error, userId }, 'Failed to get skills');
      return [];
    }

    return (data || []).map(s => s.skill_name);
  }

  /**
   * Determine completion status
   */
  private determineCompletionStatus(
    chapter: { end_date: string | null },
    entries: Array<{ created_at: string }>
  ): 'active' | 'completed' | 'paused' {
    if (chapter.end_date) {
      const endDate = new Date(chapter.end_date);
      const now = new Date();
      if (now > endDate) return 'completed';
    }

    // Check if there are recent entries
    if (entries.length > 0) {
      const mostRecent = new Date(entries[entries.length - 1].created_at);
      const daysSince = (Date.now() - mostRecent.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 90) return 'paused';
    }

    return 'active';
  }

  /**
   * Calculate ratings from sentiment analysis
   */
  private async calculateRatings(
    entries: Array<{ sentiment: number | null; mood: string | null }>
  ): Promise<{ difficultyRating: number | null; enjoymentRating: number | null; growthRating: number | null }> {
    if (entries.length === 0) {
      return { difficultyRating: null, enjoymentRating: null, growthRating: null };
    }

    // Calculate average sentiment for enjoyment (1-10)
    const sentiments = entries.map(e => e.sentiment || 0).filter(s => s !== 0);
    const avgSentiment = sentiments.length > 0
      ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
      : 0.5;

    // Enjoyment rating: sentiment mapped to 1-10
    const enjoymentRating = Math.round((avgSentiment + 1) * 5);

    // Difficulty rating: based on negative sentiment (higher negative = higher difficulty)
    const negativeEntries = entries.filter(e => e.sentiment && e.sentiment < 0).length;
    const difficultyRating = Math.min(10, Math.max(1, Math.round((negativeEntries / entries.length) * 10)));

    // Growth rating: based on sentiment improvement over time
    const growthRating = this.calculateGrowthRating(entries);

    return { difficultyRating, enjoymentRating, growthRating };
  }

  /**
   * Calculate growth rating from sentiment trends
   */
  private calculateGrowthRating(entries: Array<{ sentiment: number | null; created_at: string }>): number {
    if (entries.length < 2) return 5;

    // Sort by date
    const sorted = [...entries].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Compare first half to second half
    const midpoint = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, midpoint);
    const secondHalf = sorted.slice(midpoint);

    const firstAvg = firstHalf.reduce((sum, e) => sum + (e.sentiment || 0), 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, e) => sum + (e.sentiment || 0), 0) / secondHalf.length;

    // Growth = improvement in sentiment
    const growth = (secondAvg - firstAvg) * 10; // Scale to 1-10
    return Math.min(10, Math.max(1, Math.round(5 + growth)));
  }

  /**
   * Calculate reflection bonus
   */
  private calculateReflectionBonus(entries: Array<{ sentiment: number | null }>): number {
    // Bonus for entries with strong sentiment (reflection)
    const reflectiveEntries = entries.filter(e => e.sentiment && Math.abs(e.sentiment) > 0.5);
    return reflectiveEntries.length;
  }

  /**
   * Get all chapter stats for a user
   */
  async getChapterStats(userId: string): Promise<ChapterStats[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('chapter_stats')
        .select('*')
        .eq('user_id', userId)
        .order('chapter_period_start', { ascending: false });

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch chapter stats');
        throw error;
      }

      return (data || []) as ChapterStats[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get chapter stats');
      throw error;
    }
  }

  /**
   * Update chapter stats when timeline progresses
   */
  async updateOnTimelineProgress(userId: string, chapterId: string): Promise<void> {
    try {
      await this.calculateChapterStats(userId, chapterId);
    } catch (error) {
      logger.error({ error, userId, chapterId }, 'Failed to update chapter stats on timeline progress');
    }
  }
}

export const chapterEngine = new ChapterEngine();
