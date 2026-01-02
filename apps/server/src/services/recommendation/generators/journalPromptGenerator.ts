import { v4 as uuid } from 'uuid';
import { differenceInDays, parseISO } from 'date-fns';

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';
import type { Recommendation, RecommendationContext } from '../types';
import { ChronologyEngine, EventMapper } from '../../chronology';
import { relationshipAnalyticsModule } from '../../analytics';

/**
 * Generates journal prompts based on gaps and patterns
 */
export class JournalPromptGenerator {
  private chronologyEngine: ChronologyEngine;
  private eventMapper: EventMapper;
  private readonly DAYS_THRESHOLD = 7; // Suggest writing about topics not mentioned in 7+ days

  constructor() {
    this.chronologyEngine = new ChronologyEngine();
    this.eventMapper = new EventMapper();
  }

  /**
   * Generate journal prompts
   */
  async generate(userId: string): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      // 1. Get recent entries to find topics/characters not mentioned recently
      const { data: recentEntries } = await supabaseAdmin
        .from('journal_entries')
        .select('id, date, content, tags, people')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(50);

      if (!recentEntries || recentEntries.length === 0) {
        return recommendations;
      }

      // 2. Find topics not mentioned recently
      const topicPrompts = await this.generateTopicPrompts(userId, recentEntries);
      recommendations.push(...topicPrompts);

      // 3. Find characters not mentioned recently
      const characterPrompts = await this.generateCharacterPrompts(userId, recentEntries);
      recommendations.push(...characterPrompts);

      // 4. Find emotional patterns needing exploration
      const emotionPrompts = await this.generateEmotionPrompts(userId, recentEntries);
      recommendations.push(...emotionPrompts);

      logger.debug(
        { userId, count: recommendations.length },
        'Generated journal prompts'
      );
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate journal prompts');
    }

    return recommendations;
  }

  /**
   * Generate prompts for topics not mentioned recently
   */
  private async generateTopicPrompts(
    userId: string,
    recentEntries: any[]
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const now = new Date();

    // Get all entries to find frequently mentioned topics
    const { data: allEntries } = await supabaseAdmin
      .from('journal_entries')
      .select('date, tags')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(200);

    if (!allEntries) return recommendations;

    // Count topic frequency
    const topicFrequency = new Map<string, number>();
    const topicLastMentioned = new Map<string, Date>();

    allEntries.forEach(entry => {
      const entryDate = parseISO(entry.date);
      (entry.tags || []).forEach((tag: string) => {
        topicFrequency.set(tag, (topicFrequency.get(tag) || 0) + 1);
        const lastMentioned = topicLastMentioned.get(tag);
        if (!lastMentioned || entryDate > lastMentioned) {
          topicLastMentioned.set(tag, entryDate);
        }
      });
    });

    // Find topics mentioned frequently but not recently
    for (const [topic, frequency] of topicFrequency.entries()) {
      if (frequency < 3) continue; // Only suggest topics mentioned at least 3 times

      const lastMentioned = topicLastMentioned.get(topic);
      if (!lastMentioned) continue;

      const daysSince = differenceInDays(now, lastMentioned);
      if (daysSince >= this.DAYS_THRESHOLD) {
        const context: RecommendationContext = {
          pattern: topic,
          timeframe: `${daysSince} days ago`,
          confidence: Math.min(0.9, 0.5 + (frequency / 20)),
        };

        recommendations.push({
          id: uuid(),
          user_id: userId,
          type: 'journal_prompt',
          title: `Write about ${topic}`,
          description: `You haven't written about "${topic}" in ${daysSince} days. What's been happening with that?`,
          context,
          priority: Math.min(7, 5 + Math.floor(daysSince / 7)),
          confidence: context.confidence || 0.7,
          source_engine: 'chronology',
          source_data: { topic, frequency, days_since: daysSince },
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    return recommendations;
  }

  /**
   * Generate prompts for characters not mentioned recently
   */
  private async generateCharacterPrompts(
    userId: string,
    recentEntries: any[]
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    try {
      // Get relationship analytics to find important characters
      const analytics = await relationshipAnalyticsModule.run(userId);
      const graph = (analytics.graph as any)?.nodes || [];

      if (graph.length === 0) return recommendations;

      // Get all entries to find when characters were last mentioned
      const { data: allEntries } = await supabaseAdmin
        .from('journal_entries')
        .select('date, people')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(200);

      if (!allEntries) return recommendations;

      const characterLastMentioned = new Map<string, Date>();
      const now = new Date();

      allEntries.forEach(entry => {
        const entryDate = parseISO(entry.date);
        (entry.people || []).forEach((person: string) => {
          const lastMentioned = characterLastMentioned.get(person);
          if (!lastMentioned || entryDate > lastMentioned) {
            characterLastMentioned.set(person, entryDate);
          }
        });
      });

      // Find important characters not mentioned recently
      for (const node of graph.slice(0, 10)) {
        // Top 10 most central characters
        const characterName = node.name || node.id;
        const lastMentioned = characterLastMentioned.get(characterName);

        if (!lastMentioned) continue;

        const daysSince = differenceInDays(now, lastMentioned);
        if (daysSince >= this.DAYS_THRESHOLD) {
          const context: RecommendationContext = {
            entity: characterName,
            timeframe: `${daysSince} days ago`,
            confidence: 0.7,
          };

          recommendations.push({
            id: uuid(),
            user_id: userId,
            type: 'journal_prompt',
            title: `How are things with ${characterName}?`,
            description: `You haven't mentioned ${characterName} in ${daysSince} days. How are things going with them?`,
            context,
            priority: Math.min(8, 6 + Math.floor(daysSince / 7)),
            confidence: 0.7,
            source_engine: 'relationship_analytics',
            source_data: { character: characterName, days_since: daysSince },
            status: 'pending',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to generate character prompts');
    }

    return recommendations;
  }

  /**
   * Generate prompts for emotional patterns
   */
  private async generateEmotionPrompts(
    userId: string,
    recentEntries: any[]
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    // Analyze recent mood patterns
    const moodCounts = new Map<string, number>();
    recentEntries.slice(0, 10).forEach(entry => {
      if (entry.mood) {
        moodCounts.set(entry.mood, (moodCounts.get(entry.mood) || 0) + 1);
      }
    });

    // If there's a dominant mood, suggest exploring it
    for (const [mood, count] of moodCounts.entries()) {
      if (count >= 3 && mood !== 'neutral') {
        const context: RecommendationContext = {
          pattern: mood,
          timeframe: 'recent',
          confidence: 0.6,
        };

        recommendations.push({
          id: uuid(),
          user_id: userId,
          type: 'journal_prompt',
          title: `Explore your ${mood} feelings`,
          description: `You've been feeling ${mood} lately. What's contributing to that?`,
          context,
          priority: 6,
          confidence: 0.6,
          source_engine: 'identity_pulse',
          source_data: { mood, frequency: count },
          status: 'pending',
          expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    return recommendations;
  }
}

