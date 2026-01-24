/**
 * Resource Insight Generator
 * Converts resource stats to wellbeing insights
 * Never shows numbers - only patterns and suggestions
 */

import type { ResourceStats } from '../resourceEngine';

export interface ResourceInsight {
  text: string;
  type: 'energy' | 'stamina' | 'capital' | 'efficiency' | 'pattern' | 'suggestion' | 'narrative' | 'temporal';
  suggestion?: string;
  storyContext?: {
    timeline?: string;
    evolution?: string;
    frequency?: string;
    significance?: string;
  };
}

export class ResourceInsightGenerator {
  /**
   * Generate insights from resource stats with story-driven context
   */
  async generateInsights(userId: string, stats: ResourceStats, trends: Record<string, number>): Promise<ResourceInsight[]> {
    const insights: ResourceInsight[] = [];

    // Get resource context
    const resourceContext = await this.getResourceContext(userId, stats);
    const resourcePatterns = this.analyzeResourcePatterns(stats, trends);

    // Energy insights with narrative
    if (stats.daily_energy >= 70) {
      const energyNarrative = this.buildEnergyNarrative(stats, trends, resourceContext);
      insights.push({
        text: energyNarrative.text,
        type: 'energy',
        storyContext: {
          evolution: energyNarrative.evolution,
          significance: energyNarrative.significance,
        },
      });
    } else if (stats.daily_energy <= 30) {
      insights.push({
        text: `You might want to take time to recharge${resourceContext.when ? ` ${resourceContext.when}` : ''}. ${resourceContext.why || 'Your energy has been lower lately'}.`,
        type: 'energy',
        suggestion: resourceContext.suggestion || 'Consider taking time for yourself today',
      });
    }

    // Energy trends with story
    if (trends.energy > 10) {
      const energyText = `Your energy levels have been improving${resourceContext.timeline ? ` ${resourceContext.timeline}` : ''}. ${resourcePatterns.energyPattern || "You're finding better balance"}.`;
      insights.push({
        text: energyText,
        type: 'pattern',
        storyContext: {
          evolution: resourcePatterns.energyPattern,
        },
      });
    } else if (trends.energy < -10) {
      insights.push({
        text: `You've been feeling less energetic lately${resourceContext.when ? ` ${resourceContext.when}` : ''}. ${resourceContext.why || 'This might be a good time to focus on rest'}.`,
        type: 'pattern',
        suggestion: resourceContext.suggestion || 'What activities help you feel more energized?',
      });
    }

    // Emotional stamina insights with context
    if (stats.emotional_stamina >= 70) {
      const staminaNarrative = this.buildStaminaNarrative(stats, trends, resourceContext);
      insights.push({
        text: staminaNarrative.text,
        type: 'stamina',
        storyContext: {
          evolution: staminaNarrative.evolution,
        },
      });
    } else if (stats.emotional_stamina <= 30) {
      insights.push({
        text: `You might benefit from some emotional support${resourceContext.when ? ` ${resourceContext.when}` : ''}. ${resourceContext.why || 'Your emotional reserves have been lower'}.`,
        type: 'stamina',
        suggestion: resourceContext.suggestion || 'Consider reaching out to someone you trust',
      });
    }

    // Social capital insights with narrative
    if (stats.social_capital >= 70) {
      const socialNarrative = this.buildSocialNarrative(stats, trends, resourceContext);
      insights.push({
        text: socialNarrative.text,
        type: 'capital',
        storyContext: {
          evolution: socialNarrative.evolution,
        },
      });
    } else if (stats.social_capital <= 30) {
      insights.push({
        text: `You might want to nurture your relationships${resourceContext.when ? ` ${resourceContext.when}` : ''}. ${resourceContext.why || 'Your social connections could use attention'}.`,
        type: 'capital',
        suggestion: resourceContext.suggestion || 'Consider checking in with someone you care about',
      });
    }

    // Time efficiency insights with context
    if (stats.time_efficiency >= 70) {
      insights.push({
        text: `You've been making good use of your time${resourceContext.timeline ? ` ${resourceContext.timeline}` : ''}. ${resourcePatterns.efficiencyPattern || 'Your productivity has been strong'}.`,
        type: 'efficiency',
        storyContext: {
          evolution: resourcePatterns.efficiencyPattern,
        },
      });
    }

    // Pattern insights with narrative
    if (resourcePatterns.hasPattern) {
      insights.push({
        text: resourcePatterns.patternText,
        type: 'pattern',
        storyContext: {
          significance: resourcePatterns.patternSignificance,
        },
      });
    }

    return insights;
  }

  /**
   * Get resource context
   */
  private async getResourceContext(userId: string, stats: ResourceStats): Promise<{
    timeline: string;
    when: string;
    why: string;
    suggestion: string;
  }> {
    const date = new Date(stats.date);
    const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));

    let when = '';
    if (daysAgo === 0) when = 'today';
    else if (daysAgo === 1) when = 'yesterday';
    else if (daysAgo <= 7) when = 'this week';
    else if (daysAgo <= 30) when = 'this month';

    return {
      timeline: '',
      when,
      why: '',
      suggestion: '',
    };
  }

  /**
   * Analyze resource patterns
   */
  private analyzeResourcePatterns(
    stats: ResourceStats,
    trends: Record<string, number>
  ): {
    hasPattern: boolean;
    energyPattern: string;
    efficiencyPattern: string;
    patternText: string;
    patternSignificance: string;
  } {
    const hasPattern = Math.abs(trends.energy) > 10 || Math.abs(trends.stamina) > 10;

    const energyPattern = trends.energy > 10
      ? 'You\'re finding better energy balance'
      : trends.energy < -10
      ? 'Your energy has been lower'
      : 'Your energy has been stable';

    const efficiencyPattern = stats.time_efficiency >= 70
      ? 'Your productivity has been strong'
      : 'You\'re managing your time well';

    const patternText = trends.stamina > 10
      ? `You tend to feel more resilient when you're taking care of yourself. This pattern shows the importance of self-care.`
      : trends.energy > 10
      ? `Your energy levels have been improving. You're finding what works for you.`
      : '';

    const patternSignificance = hasPattern
      ? 'These patterns show how different aspects of your wellbeing connect'
      : '';

    return {
      hasPattern,
      energyPattern,
      efficiencyPattern,
      patternText,
      patternSignificance,
    };
  }

  /**
   * Build energy narrative
   */
  private buildEnergyNarrative(
    stats: ResourceStats,
    trends: Record<string, number>,
    context: { when: string }
  ): {
    text: string;
    evolution: string;
    significance: string;
  } {
    let text = `You've had more energy${context.when ? ` ${context.when}` : ' lately'}`;
    
    if (trends.energy > 10) {
      const improvementText = "it's been improving";
      text += `, and ${improvementText}`;
    }

    const evolution = trends.energy > 10
      ? 'Your energy has been on an upward trend'
      : 'Your energy has been consistently good';

    const significanceText = stats.daily_energy >= 80
      ? "You're in a good energy state, which supports your overall wellbeing"
      : 'Your energy levels support your daily activities';
    const significance = significanceText;

    return { text, evolution, significance };
  }

  /**
   * Build stamina narrative
   */
  private buildStaminaNarrative(
    stats: ResourceStats,
    trends: Record<string, number>,
    context: { when: string }
  ): {
    text: string;
    evolution: string;
  } {
    let text = `You've been emotionally resilient${context.when ? ` ${context.when}` : ''}`;
    
    if (trends.stamina > 10) {
      text += ', and your resilience has been growing';
    }

    const evolution = trends.stamina > 10
      ? 'Your emotional resilience has been strengthening'
      : 'You\'ve been maintaining good emotional balance';

    return { text, evolution };
  }

  /**
   * Build social narrative
   */
  private buildSocialNarrative(
    stats: ResourceStats,
    trends: Record<string, number>,
    context: { when: string }
  ): {
    text: string;
    evolution: string;
  } {
    let text = `Your social connections have been strong${context.when ? ` ${context.when}` : ''}`;
    
    if (trends.capital > 10) {
      text += ', and they\'ve been growing stronger';
    }

    const evolution = trends.capital > 10
      ? 'Your social connections have been deepening'
      : 'Your relationships have been supportive';

    return { text, evolution };
  }

  /**
   * Generate insights for multiple days
   */
  async generateAllInsights(userId: string, statsList: ResourceStats[]): Promise<ResourceInsight[]> {
    if (statsList.length === 0) return [];

    const latest = statsList[statsList.length - 1];
    const trends = latest.resource_trends || {};

    return await this.generateInsights(userId, latest, trends);
  }
}

export const resourceInsightGenerator = new ResourceInsightGenerator();
