/**
 * Faction Insight Generator
 * Converts faction stats to natural language insights
 * Never shows numbers - only relationship patterns
 */

import type { FactionStats } from '../factionEngine';

export interface FactionInsight {
  text: string;
  factionName: string;
  type: 'reputation' | 'alliance' | 'pattern' | 'growth' | 'narrative' | 'temporal';
  storyContext?: {
    timeline?: string;
    evolution?: string;
    significance?: string;
  };
}

export class FactionInsightGenerator {
  /**
   * Generate insights for a faction with story-driven context
   */
  async generateInsights(userId: string, stats: FactionStats): Promise<FactionInsight[]> {
    const insights: FactionInsight[] = [];

    // Get faction context
    const factionContext = await this.getFactionContext(userId, stats);
    const factionEvolution = await this.getFactionEvolution(userId, stats);

    // Reputation insights with narrative
    if (stats.reputation >= 50) {
      const positiveNarrative = this.buildPositiveReputationNarrative(stats, factionContext, factionEvolution);
      insights.push({
        text: positiveNarrative.text,
        factionName: stats.faction_name,
        type: 'reputation',
        storyContext: {
          timeline: factionContext.timeline,
          evolution: factionEvolution.trend,
        },
      });
    } else if (stats.reputation <= -50) {
      insights.push({
        text: `Your ${stats.faction_name} relationships have been challenging${factionContext.recentChanges ? ` ${factionContext.recentChanges}` : ''}. ${factionEvolution.insight || 'These relationships are evolving'}.`,
        factionName: stats.faction_name,
        type: 'reputation',
        storyContext: {
          evolution: factionEvolution.insight,
        },
      });
    } else {
      insights.push({
        text: `Your ${stats.faction_name} relationships are generally stable${factionContext.timeline ? ` ${factionContext.timeline}` : ''}. ${factionEvolution.trend || 'These connections have been consistent'}.`,
        factionName: stats.faction_name,
        type: 'reputation',
      });
    }

    // Alliance strength insights with context
    if (stats.alliance_strength >= 70) {
      const allianceStory = this.buildAllianceStory(stats, factionContext, factionEvolution);
      insights.push({
        text: allianceStory.text,
        factionName: stats.faction_name,
        type: 'alliance',
        storyContext: {
          evolution: allianceStory.evolution,
          significance: allianceStory.significance,
        },
      });
    } else if (stats.alliance_strength >= 40) {
      insights.push({
        text: `You have strong connections within your ${stats.faction_name}${factionContext.size ? `, a ${factionContext.size} group` : ''}. ${factionEvolution.trend || 'These relationships have been meaningful'}.`,
        factionName: stats.faction_name,
        type: 'alliance',
      });
    }

    // Pattern insights with narrative
    if (stats.relationship_count >= 5) {
      const patternNarrative = this.buildPatternNarrative(stats, factionContext);
      insights.push({
        text: patternNarrative.text,
        factionName: stats.faction_name,
        type: 'pattern',
        storyContext: {
          significance: patternNarrative.significance,
        },
      });
    }

    // Growth insights
    if (factionEvolution.hasGrowth) {
      insights.push({
        text: factionEvolution.growthText,
        factionName: stats.faction_name,
        type: 'growth',
        storyContext: {
          evolution: factionEvolution.growthSummary,
        },
      });
    }

    return insights;
  }

  /**
   * Get faction context
   */
  private async getFactionContext(userId: string, stats: FactionStats): Promise<{
    timeline: string;
    size: string;
    recentChanges: string;
  }> {
    try {
      // Get characters in this faction
      const { data: characters } = await supabaseAdmin
        .from('characters')
        .select('id, created_at')
        .eq('user_id', userId)
        .limit(100); // Approximate

      if (!characters || characters.length === 0) {
        return { timeline: '', size: '', recentChanges: '' };
      }

      const size = stats.relationship_count >= 10
        ? 'large'
        : stats.relationship_count >= 5
        ? 'moderate-sized'
        : 'small';

      // Check for recent additions
      const recentCharacters = characters.filter(c => {
        const created = new Date(c.created_at);
        const daysSince = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= 90;
      });

      const recentChanges = recentCharacters.length >= 3
        ? 'with new connections forming recently'
        : '';

      return { timeline: '', size, recentChanges };
    } catch (error) {
      return { timeline: '', size: '', recentChanges: '' };
    }
  }

  /**
   * Get faction evolution
   */
  private async getFactionEvolution(userId: string, stats: FactionStats): Promise<{
    hasGrowth: boolean;
    trend: string;
    insight: string;
    growthText: string;
    growthSummary: string;
  }> {
    const hasGrowth = stats.alliance_strength >= 60 || stats.influence_score >= 70;

    const trend = stats.alliance_strength >= 70
      ? 'Your connections have been strengthening'
      : stats.alliance_strength >= 50
      ? 'Your relationships have been stable'
      : 'Your connections are evolving';

    const insight = stats.reputation >= 50
      ? 'These relationships have been positive and supportive'
      : 'These relationships are part of your social landscape';

    const growthText = stats.alliance_strength >= 70
      ? `Your ${stats.faction_name} circle has grown closer and stronger over time. These connections have deepened.`
      : stats.influence_score >= 70
      ? `Your ${stats.faction_name} has become more influential in your life. These relationships matter.`
      : '';

    const growthSummary = stats.alliance_strength >= 70
      ? 'Your connections have deepened significantly'
      : 'Your relationships have been evolving positively';

    return {
      hasGrowth,
      trend,
      insight,
      growthText,
      growthSummary,
    };
  }

  /**
   * Build positive reputation narrative
   */
  private buildPositiveReputationNarrative(
    stats: FactionStats,
    context: { timeline: string; recentChanges: string },
    evolution: { trend: string }
  ): {
    text: string;
  } {
    let text = `Your ${stats.faction_name} relationships have been positive${context.recentChanges ? ` ${context.recentChanges}` : ''}`;
    
    if (stats.reputation >= 80) {
      text += '. These connections have been deeply supportive and meaningful';
    } else {
      text += `. ${evolution.trend || 'These relationships have been growing'}`;
    }

    return { text };
  }

  /**
   * Build alliance story
   */
  private buildAllianceStory(
    stats: FactionStats,
    context: { size: string },
    evolution: { growthSummary: string }
  ): {
    text: string;
    evolution: string;
    significance: string;
  } {
    let text = `Your ${stats.faction_name} circle has grown closer`;
    
    if (context.size) {
      text += `, forming a ${context.size} group of meaningful connections`;
    }

    const evolutionText = stats.alliance_strength >= 80
      ? 'Your bonds have deepened significantly over time'
      : 'Your connections have been strengthening';

    const significance = stats.relationship_count >= 10
      ? 'This is one of your most important social groups'
      : 'These relationships have been significant in your journey';

    return { text, evolution: evolutionText, significance };
  }

  /**
   * Build pattern narrative
   */
  private buildPatternNarrative(
    stats: FactionStats,
    context: { size: string }
  ): {
    text: string;
    significance: string;
  } {
    const text = `You tend to form deep connections with people in your ${stats.faction_name}${context.size ? `, a ${context.size} group` : ''}. This pattern shows the importance of these relationships in your life.`;

    const significance = stats.relationship_count >= 10
      ? 'This is a significant part of your social landscape'
      : 'These connections represent meaningful relationships';

    return { text, significance };
  }

  /**
   * Generate insights for all factions
   */
  async generateAllInsights(userId: string, statsList: FactionStats[]): Promise<FactionInsight[]> {
    const allInsights: FactionInsight[] = [];

    for (const stats of statsList) {
      const insights = await this.generateInsights(userId, stats);
      allInsights.push(...insights);
    }

    return allInsights;
  }
}

export const factionInsightGenerator = new FactionInsightGenerator();
