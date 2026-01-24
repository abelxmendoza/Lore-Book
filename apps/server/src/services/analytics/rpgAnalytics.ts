/**
 * RPG Analytics Module
 * Aggregates all RPG insights into natural language stories
 * Extends BaseAnalyticsModule to provide story-driven analytics
 */

import { logger } from '../../logger';
import { BaseAnalyticsModule } from './base';
import type { AnalyticsPayload, InsightData } from './types';
import { companionEngine } from '../rpg/companionEngine';
import { locationEngine } from '../rpg/locationEngine';
import { factionEngine } from '../rpg/factionEngine';
import { chapterEngine } from '../rpg/chapterEngine';
import { challengeEngine } from '../rpg/challengeEngine';
import { skillTreeEngine } from '../rpg/skillTreeEngine';
import { resourceEngine } from '../rpg/resourceEngine';
import { questChainEngine } from '../rpg/questChainEngine';
import { companionInsightGenerator } from '../rpg/insights/companionInsights';
import { locationInsightGenerator } from '../rpg/insights/locationInsights';
import { factionInsightGenerator } from '../rpg/insights/factionInsights';
import { chapterInsightGenerator } from '../rpg/insights/chapterInsights';
import { challengeInsightGenerator } from '../rpg/insights/challengeInsights';
import { skillInsightGenerator } from '../rpg/insights/skillInsights';
import { resourceInsightGenerator } from '../rpg/insights/resourceInsights';
import { questChainInsightGenerator } from '../rpg/insights/questChainInsights';

export class RpgAnalyticsModule extends BaseAnalyticsModule {
  protected readonly moduleType = 'rpg' as const;

  async run(userId: string): Promise<AnalyticsPayload> {
    const cached = await this.getCachedResult(userId);
    if (cached) {
      return cached;
    }

    try {
      // Get all RPG stats
      const companionStats = await companionEngine.getCompanionStats(userId);
      const locationStats = await locationEngine.getLocationStats(userId);
      const factionStats = await factionEngine.getFactionStats(userId);
      const chapterStats = await chapterEngine.getChapterStats(userId);
      const challengeStats = await challengeEngine.getChallengeStats(userId);
      const skillTrees = await skillTreeEngine.buildSkillTree(userId);
      const resourceStats = await resourceEngine.getResourceStats(
        userId,
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        new Date()
      );
      const questChains = await questChainEngine.getQuestChains(userId);

      // Generate insights from all systems
      const companionInsights = await companionInsightGenerator.generateAllInsights(userId, companionStats);
      const locationInsights = await locationInsightGenerator.generateAllInsights(userId, locationStats);
      const factionInsights = await factionInsightGenerator.generateAllInsights(userId, factionStats);
      const chapterInsights = await chapterInsightGenerator.generateAllInsights(userId, chapterStats);
      const challengeInsights = await challengeInsightGenerator.generateAllInsights(userId, challengeStats);
      const skillInsights = await skillInsightGenerator.generateAllInsights(userId, skillTrees);
      const resourceInsights = await resourceInsightGenerator.generateAllInsights(userId, resourceStats);
      const questChainInsights = await questChainInsightGenerator.generateAllInsights(userId, questChains);

      // Convert all insights to InsightData format
      const allInsights: InsightData[] = [
        ...companionInsights.map(i => ({
          text: i.text,
          category: 'companions',
          score: 0.8,
          metadata: { type: i.type, characterId: i.characterId, suggestion: i.suggestion },
        })),
        ...locationInsights.map(i => ({
          text: i.text,
          category: 'locations',
          score: 0.8,
          metadata: { type: i.type, locationId: i.locationId, suggestion: i.suggestion },
        })),
        ...factionInsights.map(i => ({
          text: i.text,
          category: 'factions',
          score: 0.8,
          metadata: { type: i.type, factionName: i.factionName },
        })),
        ...chapterInsights.map(i => ({
          text: i.text,
          category: 'chapters',
          score: 0.8,
          metadata: { type: i.type, chapterId: i.chapterId, suggestion: i.suggestion },
        })),
        ...challengeInsights.map(i => ({
          text: i.text,
          category: 'challenges',
          score: 0.8,
          metadata: { type: i.type, challengeName: i.challengeName, suggestion: i.suggestion },
        })),
        ...skillInsights.map(i => ({
          text: i.text,
          category: 'skills',
          score: 0.8,
          metadata: { type: i.type, skillId: i.skillId },
        })),
        ...resourceInsights.map(i => ({
          text: i.text,
          category: 'resources',
          score: 0.8,
          metadata: { type: i.type, suggestion: i.suggestion },
        })),
        ...questChainInsights.map(i => ({
          text: i.text,
          category: 'quest_chains',
          score: 0.8,
          metadata: { type: i.type, chainId: i.chainId, suggestion: i.suggestion },
        })),
      ];

      // Generate summary
      const summary = this.generateSummary(
        companionInsights.length,
        locationInsights.length,
        challengeInsights.length,
        questChainInsights.length
      );

      const payload: AnalyticsPayload = {
        metrics: {
          companion_count: companionStats.length,
          location_count: locationStats.length,
          faction_count: factionStats.length,
          chapter_count: chapterStats.length,
          challenge_count: challengeStats.length,
          skill_count: skillTrees.length,
          quest_chain_count: questChains.length,
        },
        charts: [],
        insights: allInsights,
        summary,
        metadata: {
          companion_stats: companionStats.length,
          location_stats: locationStats.length,
          faction_stats: factionStats.length,
          chapter_stats: chapterStats.length,
          challenge_stats: challengeStats.length,
          skill_trees: skillTrees.length,
          quest_chains: questChains.length,
        },
      };

      await this.cacheResult(userId, payload);
      return payload;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to generate RPG analytics');
      return this.emptyPayload();
    }
  }

  /**
   * Generate natural language summary
   */
  private generateSummary(
    companionCount: number,
    locationCount: number,
    challengeCount: number,
    questChainCount: number
  ): string {
    const parts: string[] = [];

    if (companionCount > 0) {
      parts.push(`You have ${companionCount} important relationship${companionCount > 1 ? 's' : ''} in your life`);
    }

    if (locationCount > 0) {
      parts.push(`${locationCount} meaningful place${locationCount > 1 ? 's' : ''} in your story`);
    }

    if (challengeCount > 0) {
      parts.push(`${challengeCount} challenge${challengeCount > 1 ? 's' : ''} you've navigated`);
    }

    if (questChainCount > 0) {
      parts.push(`${questChainCount} ongoing goal${questChainCount > 1 ? 's' : ''} in your journey`);
    }

    if (parts.length === 0) {
      return 'Your story is just beginning. Keep journaling to discover insights about your journey.';
    }

    return `Your life story includes ${parts.join(', ')}. Explore these connections to understand your journey better.`;
  }

  /**
   * Empty payload for when there's no data
   */
  private emptyPayload(): AnalyticsPayload {
    return {
      metrics: {},
      charts: [],
      insights: [],
      summary: 'Not enough data to generate RPG insights. Keep journaling to discover your story.',
    };
  }
}

export const rpgAnalyticsModule = new RpgAnalyticsModule();
