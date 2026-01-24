/**
 * Resource Tracking Engine
 * Calculates energy, emotional stamina, and social capital
 * All stats are hidden - only used for generating natural language insights
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export interface ResourceStats {
  id: string;
  user_id: string;
  date: string;
  daily_energy: number;
  emotional_stamina: number;
  social_capital: number;
  time_efficiency: number;
  knowledge_points: number;
  resource_trends: Record<string, number>;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export class ResourceEngine {
  /**
   * Calculate resource stats for a date
   */
  async calculateResourceStats(userId: string, date: Date): Promise<ResourceStats> {
    try {
      const dateStr = date.toISOString().split('T')[0];

      // Get journal entries for this date
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('sentiment, mood, content, created_at')
        .eq('user_id', userId)
        .gte('created_at', dateStr)
        .lt('created_at', new Date(date.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      // Calculate daily energy from activity patterns
      const dailyEnergy = await this.calculateDailyEnergy(userId, date, entries || []);

      // Calculate emotional stamina from emotion resolution
      const emotionalStamina = await this.calculateEmotionalStamina(userId, date, entries || []);

      // Calculate social capital from relationship network
      const socialCapital = await this.calculateSocialCapital(userId, date);

      // Calculate time efficiency from activity patterns
      const timeEfficiency = await this.calculateTimeEfficiency(userId, date, entries || []);

      // Calculate knowledge points (separate from XP)
      const knowledgePoints = await this.calculateKnowledgePoints(userId, date, entries || []);

      // Calculate resource trends
      const resourceTrends = await this.calculateResourceTrends(userId, date);

      // Upsert stats
      const stats: Partial<ResourceStats> = {
        user_id: userId,
        date: dateStr,
        daily_energy: dailyEnergy,
        emotional_stamina: emotionalStamina,
        social_capital: socialCapital,
        time_efficiency: timeEfficiency,
        knowledge_points: knowledgePoints,
        resource_trends: resourceTrends,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from('resource_stats')
        .upsert(stats, {
          onConflict: 'user_id,date',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, date: dateStr }, 'Failed to upsert resource stats');
        throw error;
      }

      return data as ResourceStats;
    } catch (error) {
      logger.error({ error, userId, date }, 'Failed to calculate resource stats');
      throw error;
    }
  }

  /**
   * Calculate daily energy from activity patterns
   */
  private async calculateDailyEnergy(
    userId: string,
    date: Date,
    entries: Array<{ content: string; created_at: string }>
  ): Promise<number> {
    // Base energy from number of entries (activity)
    let energy = Math.min(50, entries.length * 10);

    // Check for energy-related keywords
    const energyKeywords = ['exercise', 'active', 'energetic', 'motivated', 'productive'];
    const lowEnergyKeywords = ['tired', 'exhausted', 'drained', 'fatigue'];

    for (const entry of entries) {
      const content = entry.content.toLowerCase();
      if (energyKeywords.some(kw => content.includes(kw))) energy += 5;
      if (lowEnergyKeywords.some(kw => content.includes(kw))) energy -= 10;
    }

    // Check activity from time management engine (if available)
    // This would integrate with time_management_engine

    return Math.min(100, Math.max(0, energy));
  }

  /**
   * Calculate emotional stamina from emotion resolution
   */
  private async calculateEmotionalStamina(
    userId: string,
    date: Date,
    entries: Array<{ sentiment: number | null; mood: string | null }>
  ): Promise<number> {
    // Base stamina from positive sentiment
    let stamina = 50;

    if (entries.length > 0) {
      const avgSentiment = entries.reduce((sum, e) => sum + (e.sentiment || 0), 0) / entries.length;
      // Sentiment is -1 to 1, map to 0-100
      stamina = ((avgSentiment + 1) / 2) * 100;
    }

    // Check for emotional resilience indicators
    const resilienceKeywords = ['overcame', 'resilient', 'strong', 'coped', 'handled'];
    for (const entry of entries) {
      if (entry.mood && resilienceKeywords.some(kw => entry.mood.toLowerCase().includes(kw))) {
        stamina += 5;
      }
    }

    return Math.min(100, Math.max(0, Math.round(stamina)));
  }

  /**
   * Calculate social capital from relationship network
   */
  private async calculateSocialCapital(userId: string, date: Date): Promise<number> {
    // Get characters mentioned on this date
      const dateStr = date.toISOString().split('T')[0];
      const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select('id')
        .eq('user_id', userId)
        .gte('created_at', dateStr)
        .lt('created_at', nextDate);

      if (!entries || entries.length === 0) return 50;

      const entryIds = entries.map(e => e.id);

      const { data: characterMemories } = await supabaseAdmin
        .from('character_memories')
        .select('character_id')
        .eq('user_id', userId)
        .in('journal_entry_id', entryIds);

      const uniqueCharacters = new Set((characterMemories || []).map(m => m.character_id));
      const characterCount = uniqueCharacters.size;

      // Social capital based on number of people interacted with
      let capital = 50;
      capital += characterCount * 10;
      capital += entries.length * 2; // More entries = more social activity

      return Math.min(100, Math.max(0, capital));
  }

  /**
   * Calculate time efficiency from activity patterns
   */
  private async calculateTimeEfficiency(
    userId: string,
    date: Date,
    entries: Array<{ content: string }>
  ): Promise<number> {
    // Base efficiency
    let efficiency = 50;

    // Check for productivity keywords
    const productivityKeywords = ['completed', 'finished', 'accomplished', 'productive', 'efficient'];
    const inefficiencyKeywords = ['procrastinated', 'wasted', 'inefficient', 'distracted'];

    for (const entry of entries) {
      const content = entry.content.toLowerCase();
      if (productivityKeywords.some(kw => content.includes(kw))) efficiency += 5;
      if (inefficiencyKeywords.some(kw => content.includes(kw))) efficiency -= 5;
    }

    // More entries might indicate better time management (or just more activity)
    efficiency += Math.min(20, entries.length * 2);

    return Math.min(100, Math.max(0, efficiency));
  }

  /**
   * Calculate knowledge points (separate from XP)
   */
  private async calculateKnowledgePoints(
    userId: string,
    date: Date,
    entries: Array<{ content: string }>
  ): Promise<number> {
    // Knowledge points from learning-related content
    const learningKeywords = ['learned', 'studied', 'read', 'discovered', 'understood', 'realized'];
    let points = 0;

    for (const entry of entries) {
      const content = entry.content.toLowerCase();
      for (const keyword of learningKeywords) {
        if (content.includes(keyword)) {
          points += 5;
        }
      }
    }

    // Check for skills mentioned
    const { data: skills } = await supabaseAdmin
      .from('skills')
      .select('skill_name')
      .eq('user_id', userId)
      .eq('is_active', true);

    for (const entry of entries) {
      const content = entry.content.toLowerCase();
      for (const skill of skills || []) {
        if (content.includes(skill.skill_name.toLowerCase())) {
          points += 3;
        }
      }
    }

    return points;
  }

  /**
   * Calculate resource trends
   */
  private async calculateResourceTrends(userId: string, date: Date): Promise<Record<string, number>> {
    // Get stats for last 7 days
    const dateStr = date.toISOString().split('T')[0];
    const sevenDaysAgo = new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: recentStats } = await supabaseAdmin
      .from('resource_stats')
      .select('daily_energy, emotional_stamina, social_capital, time_efficiency')
      .eq('user_id', userId)
      .gte('date', sevenDaysAgo)
      .lte('date', dateStr)
      .order('date', { ascending: true });

    if (!recentStats || recentStats.length < 2) {
      return { energy: 0, stamina: 0, capital: 0, efficiency: 0 };
    }

    // Calculate trends (improving or declining)
    const first = recentStats[0];
    const last = recentStats[recentStats.length - 1];

    return {
      energy: last.daily_energy - first.daily_energy,
      stamina: last.emotional_stamina - first.emotional_stamina,
      capital: last.social_capital - first.social_capital,
      efficiency: last.time_efficiency - first.time_efficiency,
    };
  }

  /**
   * Get resource stats for a date range
   */
  async getResourceStats(userId: string, startDate: Date, endDate: Date): Promise<ResourceStats[]> {
    try {
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const { data, error } = await supabaseAdmin
        .from('resource_stats')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startStr)
        .lte('date', endStr)
        .order('date', { ascending: true });

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch resource stats');
        throw error;
      }

      return (data || []) as ResourceStats[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get resource stats');
      throw error;
    }
  }

  /**
   * Update resource stats when activity patterns change
   */
  async updateOnActivityChange(userId: string, date: Date): Promise<void> {
    try {
      await this.calculateResourceStats(userId, date);
    } catch (error) {
      logger.error({ error, userId, date }, 'Failed to update resource stats on activity change');
    }
  }
}

export const resourceEngine = new ResourceEngine();
