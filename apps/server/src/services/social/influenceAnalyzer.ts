import { logger } from '../../logger';

import type { SocialNode, InfluenceScore } from './types';

/**
 * Analyzes influence of people in the social network
 * Ranks people based on mentions, sentiment, and role
 */
export class InfluenceAnalyzer {
  /**
   * Rank people by influence
   */
  rank(graph: Record<string, SocialNode>): InfluenceScore[] {
    const scores: InfluenceScore[] = [];

    try {
      Object.values(graph).forEach((node) => {
        const factors: string[] = [];

        // Base score from mentions (normalized)
        const mentionScore = Math.min(1, node.mentions / 50); // Normalize to 0-1
        let score = mentionScore * 0.6;

        if (node.mentions > 10) {
          factors.push('high_mentions');
        }

        // Sentiment impact (strong positive or negative sentiment = influence)
        const sentimentImpact = Math.abs(node.sentiment);
        score += sentimentImpact * 0.3;
        if (sentimentImpact > 0.5) {
          factors.push('strong_sentiment');
        }

        // Category bonuses
        if (node.categories.includes('mentor')) {
          score += 0.2;
          factors.push('mentor');
        }
        if (node.categories.includes('family')) {
          score += 0.15;
          factors.push('family');
        }
        if (node.categories.includes('romantic')) {
          score += 0.1;
          factors.push('romantic');
        }

        // Recency bonus (more recent mentions = more current influence)
        if (node.last_mentioned) {
          const daysSince = (Date.now() - new Date(node.last_mentioned).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince < 30) {
            score += 0.1;
            factors.push('recent');
          }
        }

        // Normalize to 0-1
        score = Math.min(1, score);

        scores.push({
          id: `influence_${node.id}_${Date.now()}`,
          person: node.id,
          score,
          factors: factors.length > 0 ? factors : ['baseline'],
          metadata: {
            mentions: node.mentions,
            sentiment: node.sentiment,
            categories: node.categories,
          },
        });
      });

      // Sort by score descending
      const sorted = scores.sort((a, b) => b.score - a.score);

      // Add rank
      sorted.forEach((score, index) => {
        score.rank = index + 1;
      });

      logger.debug({ scores: sorted.length }, 'Ranked influence scores');

      return sorted;
    } catch (error) {
      logger.error({ error }, 'Failed to rank influence');
      return [];
    }
  }

  /**
   * Get top influencers
   */
  getTopInfluencers(scores: InfluenceScore[], topN: number = 10): InfluenceScore[] {
    return scores.slice(0, topN);
  }
}

