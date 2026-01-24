/**
 * Challenge Tracking Engine
 * Detects challenges and tracks outcomes
 * All stats are hidden - only used for generating natural language insights
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export interface ChallengeStats {
  id: string;
  user_id: string;
  challenge_name: string;
  challenge_type: 'health' | 'career' | 'relationship' | 'personal' | 'financial' | 'other';
  challenge_start_date: string | null;
  challenge_end_date: string | null;
  victory_condition: string | null;
  outcome: 'victory' | 'defeat' | 'ongoing' | 'abandoned' | null;
  xp_reward: number;
  lessons_learned: string[];
  resilience_gained: number;
  is_boss_challenge: boolean;
  related_quest_id: string | null;
  related_character_ids: string[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export class ChallengeEngine {
  /**
   * Detect challenges from conflicts and resilience events
   */
  async detectChallenges(userId: string): Promise<ChallengeStats[]> {
    try {
      // Get conflicts (from conflict_detection_engine or resolved_events)
      const { data: conflicts, error: conflictsError } = await supabaseAdmin
        .from('resolved_events')
        .select('*')
        .eq('user_id', userId)
        .in('event_type', ['conflict', 'challenge', 'difficulty', 'struggle']);

      if (conflictsError) {
        logger.error({ error: conflictsError, userId }, 'Failed to fetch conflicts');
        throw conflictsError;
      }

      const challenges: ChallengeStats[] = [];

      // Process each conflict as a potential challenge
      for (const conflict of conflicts || []) {
        const challengeType = this.determineChallengeType(conflict.event_type || '', conflict.title || '');
        const challengeName = conflict.title || 'Unknown Challenge';
        
        const stats = await this.calculateChallengeStats(
          userId,
          challengeName,
          challengeType,
          conflict.start_time,
          conflict.end_time,
          conflict.id
        );
        challenges.push(stats);
      }

      // Also detect challenges from quests with high difficulty
      const questChallenges = await this.detectChallengesFromQuests(userId);
      challenges.push(...questChallenges);

      return challenges;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect challenges');
      throw error;
    }
  }

  /**
   * Calculate challenge stats
   */
  async calculateChallengeStats(
    userId: string,
    challengeName: string,
    challengeType: 'health' | 'career' | 'relationship' | 'personal' | 'financial' | 'other',
    startDate: string | null,
    endDate: string | null,
    relatedEventId?: string
  ): Promise<ChallengeStats> {
    try {
      // Determine outcome
      const outcome = this.determineOutcome(startDate, endDate);

      // Define victory condition
      const victoryCondition = this.defineVictoryCondition(challengeType, challengeName);

      // Calculate XP reward (hidden)
      const xpReward = this.calculateXPReward(challengeType, outcome);

      // Extract lessons learned from reflections
      const lessonsLearned = await this.extractLessonsLearned(userId, challengeName, startDate, endDate);

      // Calculate resilience gained
      const resilienceGained = this.calculateResilienceGained(outcome, lessonsLearned.length);

      // Check if boss challenge (major life event)
      const isBossChallenge = this.isBossChallenge(challengeType, challengeName);

      // Get related quest if any
      const relatedQuestId = await this.findRelatedQuest(userId, challengeName);

      // Get related characters
      const relatedCharacterIds = await this.getRelatedCharacters(userId, challengeName, startDate, endDate);

      // Upsert stats
      const stats: Partial<ChallengeStats> = {
        user_id: userId,
        challenge_name: challengeName,
        challenge_type: challengeType,
        challenge_start_date: startDate,
        challenge_end_date: endDate,
        victory_condition: victoryCondition,
        outcome,
        xp_reward: xpReward,
        lessons_learned: lessonsLearned,
        resilience_gained: resilienceGained,
        is_boss_challenge: isBossChallenge,
        related_quest_id: relatedQuestId,
        related_character_ids: relatedCharacterIds,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from('challenge_stats')
        .upsert(stats, {
          onConflict: 'user_id,challenge_name',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, challengeName }, 'Failed to upsert challenge stats');
        throw error;
      }

      return data as ChallengeStats;
    } catch (error) {
      logger.error({ error, userId, challengeName }, 'Failed to calculate challenge stats');
      throw error;
    }
  }

  /**
   * Detect challenges from quests
   */
  private async detectChallengesFromQuests(userId: string): Promise<ChallengeStats[]> {
    const { data: quests } = await supabaseAdmin
      .from('quests')
      .select('*')
      .eq('user_id', userId)
      .gte('difficulty', 7); // High difficulty quests

    if (!quests || quests.length === 0) return [];

    const challenges: ChallengeStats[] = [];
    for (const quest of quests) {
      const challengeType = this.determineChallengeTypeFromCategory(quest.category || 'other');
      const stats = await this.calculateChallengeStats(
        userId,
        quest.title,
        challengeType,
        quest.started_at,
        quest.completed_at,
        quest.id
      );
      challenges.push(stats);
    }

    return challenges;
  }

  /**
   * Determine challenge type
   */
  private determineChallengeType(eventType: string, title: string): 'health' | 'career' | 'relationship' | 'personal' | 'financial' | 'other' {
    const lower = (eventType + ' ' + title).toLowerCase();
    if (lower.includes('health') || lower.includes('illness') || lower.includes('medical')) return 'health';
    if (lower.includes('career') || lower.includes('job') || lower.includes('work')) return 'career';
    if (lower.includes('relationship') || lower.includes('breakup') || lower.includes('divorce')) return 'relationship';
    if (lower.includes('financial') || lower.includes('money') || lower.includes('debt')) return 'financial';
    if (lower.includes('personal') || lower.includes('growth') || lower.includes('self')) return 'personal';
    return 'other';
  }

  /**
   * Determine challenge type from category
   */
  private determineChallengeTypeFromCategory(category: string): 'health' | 'career' | 'relationship' | 'personal' | 'financial' | 'other' {
    const lower = category.toLowerCase();
    if (lower.includes('health')) return 'health';
    if (lower.includes('career') || lower.includes('work')) return 'career';
    if (lower.includes('relationship')) return 'relationship';
    if (lower.includes('financial') || lower.includes('money')) return 'financial';
    if (lower.includes('personal') || lower.includes('growth')) return 'personal';
    return 'other';
  }

  /**
   * Determine outcome
   */
  private determineOutcome(startDate: string | null, endDate: string | null): 'victory' | 'defeat' | 'ongoing' | 'abandoned' | null {
    if (!startDate) return null;
    if (!endDate) return 'ongoing';
    
    // If ended, check if it was a victory (completed quest) or defeat (abandoned)
    // This would need more context from quests or goals
    return 'ongoing';
  }

  /**
   * Define victory condition
   */
  private defineVictoryCondition(type: string, name: string): string {
    return `Overcome ${name} and achieve positive outcome`;
  }

  /**
   * Calculate XP reward (hidden)
   */
  private calculateXPReward(type: string, outcome: string | null): number {
    const baseReward = 100;
    const typeMultiplier: Record<string, number> = {
      health: 1.5,
      career: 1.3,
      relationship: 1.2,
      personal: 1.1,
      financial: 1.4,
      other: 1.0,
    };

    const multiplier = typeMultiplier[type] || 1.0;
    let reward = baseReward * multiplier;

    if (outcome === 'victory') reward *= 2;
    if (outcome === 'defeat') reward *= 0.5;

    return Math.round(reward);
  }

  /**
   * Extract lessons learned from reflections
   */
  private async extractLessonsLearned(
    userId: string,
    challengeName: string,
    startDate: string | null,
    endDate: string | null
  ): Promise<string[]> {
    // Search journal entries for reflections about this challenge
    let query = supabaseAdmin
      .from('journal_entries')
      .select('content')
      .eq('user_id', userId)
      .ilike('content', `%${challengeName}%`);

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data: entries } = await query;

    // Extract lessons (simplified - would use NLP in production)
    const lessons: string[] = [];
    for (const entry of entries || []) {
      if (entry.content.includes('learned') || entry.content.includes('lesson')) {
        lessons.push(`Lesson from ${challengeName}`);
      }
    }

    return lessons;
  }

  /**
   * Calculate resilience gained
   */
  private calculateResilienceGained(outcome: string | null, lessonsCount: number): number {
    let resilience = 0;
    if (outcome === 'victory') resilience += 30;
    if (outcome === 'defeat') resilience += 10; // Learning from defeat
    resilience += lessonsCount * 5;
    return Math.min(100, resilience);
  }

  /**
   * Check if boss challenge
   */
  private isBossChallenge(type: string, name: string): boolean {
    const bossKeywords = ['major', 'significant', 'life-changing', 'critical', 'serious'];
    return bossKeywords.some(keyword => name.toLowerCase().includes(keyword));
  }

  /**
   * Find related quest
   */
  private async findRelatedQuest(userId: string, challengeName: string): Promise<string | null> {
    const { data: quest } = await supabaseAdmin
      .from('quests')
      .select('id')
      .eq('user_id', userId)
      .ilike('title', `%${challengeName}%`)
      .limit(1)
      .single();

    return quest?.id || null;
  }

  /**
   * Get related characters
   */
  private async getRelatedCharacters(
    userId: string,
    challengeName: string,
    startDate: string | null,
    endDate: string | null
  ): Promise<string[]> {
    // Find characters mentioned in entries about this challenge
    let query = supabaseAdmin
      .from('journal_entries')
      .select('id')
      .eq('user_id', userId)
      .ilike('content', `%${challengeName}%`);

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data: entries } = await query;
    const entryIds = (entries || []).map(e => e.id);

    if (entryIds.length === 0) return [];

    const { data: characterMemories } = await supabaseAdmin
      .from('character_memories')
      .select('character_id')
      .eq('user_id', userId)
      .in('journal_entry_id', entryIds);

    const characterIds = [...new Set((characterMemories || []).map(m => m.character_id))];
    return characterIds;
  }

  /**
   * Get all challenge stats for a user
   */
  async getChallengeStats(userId: string): Promise<ChallengeStats[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('challenge_stats')
        .select('*')
        .eq('user_id', userId)
        .order('challenge_start_date', { ascending: false });

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch challenge stats');
        throw error;
      }

      return (data || []) as ChallengeStats[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get challenge stats');
      throw error;
    }
  }

  /**
   * Update challenge stats when conflicts detected
   */
  async updateOnConflictDetected(userId: string): Promise<void> {
    try {
      await this.detectChallenges(userId);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update challenge stats on conflict detected');
    }
  }
}

export const challengeEngine = new ChallengeEngine();
