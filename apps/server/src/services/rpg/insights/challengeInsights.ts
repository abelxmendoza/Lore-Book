/**
 * Challenge Insight Generator
 * Converts challenge stats to growth stories
 * Never shows numbers - only resilience narratives
 */

import type { ChallengeStats } from '../challengeEngine';

export interface ChallengeInsight {
  text: string;
  challengeName: string;
  type: 'victory' | 'resilience' | 'reflection' | 'ongoing' | 'narrative' | 'temporal';
  suggestion?: string;
  storyContext?: {
    timeline?: string;
    evolution?: string;
    impact?: string;
    significance?: string;
  };
}

export class ChallengeInsightGenerator {
  /**
   * Generate insights for a challenge with story-driven context
   */
  async generateInsights(userId: string, stats: ChallengeStats): Promise<ChallengeInsight[]> {
    const insights: ChallengeInsight[] = [];

    // Get challenge context
    const challengeContext = await this.getChallengeContext(userId, stats);
    const challengeNarrative = this.buildChallengeNarrative(stats, challengeContext);

    // Victory stories with narrative
    if (stats.outcome === 'victory') {
      const victoryStory = this.buildVictoryStory(stats, challengeContext);
      insights.push({
        text: victoryStory.text,
        challengeName: stats.challenge_name,
        type: 'victory',
        storyContext: {
          timeline: challengeContext.duration,
          impact: victoryStory.impact,
          significance: victoryStory.significance,
        },
      });

      if (stats.lessons_learned.length > 0) {
        const lessonsNarrative = this.buildLessonsNarrative(stats);
        insights.push({
          text: lessonsNarrative.text,
          challengeName: stats.challenge_name,
          type: 'victory',
          storyContext: {
            significance: lessonsNarrative.significance,
          },
        });
      }
    }

    // Resilience insights with context
    if (stats.resilience_gained >= 50) {
      const resilienceStory = this.buildResilienceStory(stats, challengeContext);
      insights.push({
        text: resilienceStory.text,
        challengeName: stats.challenge_name,
        type: 'resilience',
        storyContext: {
          evolution: resilienceStory.evolution,
          significance: resilienceStory.significance,
        },
      });
    }

    // Reflection prompts with context
    if (stats.outcome === 'victory' || stats.outcome === 'defeat') {
      const reflectionContext = this.buildReflectionContext(stats, challengeContext);
      insights.push({
        text: reflectionContext.text,
        challengeName: stats.challenge_name,
        type: 'reflection',
        suggestion: reflectionContext.suggestion,
      });
    }

    // Ongoing challenges with narrative
    if (stats.outcome === 'ongoing') {
      const ongoingStory = this.buildOngoingStory(stats, challengeContext);
      insights.push({
        text: ongoingStory.text,
        challengeName: stats.challenge_name,
        type: 'ongoing',
        storyContext: {
          timeline: challengeContext.duration,
          evolution: ongoingStory.progress,
        },
      });
    }

    // Boss challenges with epic narrative
    if (stats.is_boss_challenge && stats.outcome === 'victory') {
      const bossStory = this.buildBossStory(stats, challengeContext);
      insights.push({
        text: bossStory.text,
        challengeName: stats.challenge_name,
        type: 'victory',
        storyContext: {
          significance: bossStory.significance,
          impact: bossStory.impact,
        },
      });
    }

    // Narrative arc insights
    if (challengeNarrative.hasArc) {
      insights.push({
        text: challengeNarrative.arcText,
        challengeName: stats.challenge_name,
        type: 'narrative',
        storyContext: {
          evolution: challengeNarrative.arcSummary,
        },
      });
    }

    return insights;
  }

  /**
   * Get challenge context
   */
  private async getChallengeContext(userId: string, stats: ChallengeStats): Promise<{
    duration: string;
    timeline: string;
    intensity: string;
  }> {
    let duration = '';
    let timeline = '';
    let intensity = '';

    if (stats.challenge_start_date && stats.challenge_end_date) {
      const start = new Date(stats.challenge_start_date);
      const end = new Date(stats.challenge_end_date);
      const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      if (days > 365) {
        const years = Math.floor(days / 365);
        duration = `${years} year${years > 1 ? 's' : ''}`;
        intensity = 'a long-term';
      } else if (days > 90) {
        const months = Math.floor(days / 30);
        duration = `${months} month${months > 1 ? 's' : ''}`;
        intensity = 'an extended';
      } else if (days > 30) {
        duration = `${days} day${days > 1 ? 's' : ''}`;
        intensity = 'a sustained';
      } else {
        duration = `${days} day${days > 1 ? 's' : ''}`;
        intensity = 'a';
      }

      timeline = `from ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
    } else if (stats.challenge_start_date) {
      const start = new Date(stats.challenge_start_date);
      const daysSince = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysSince > 90) {
        const months = Math.floor(daysSince / 30);
        duration = `${months} month${months > 1 ? 's' : ''}`;
      } else {
        duration = `${daysSince} day${daysSince > 1 ? 's' : ''}`;
      }
      
      timeline = `starting ${start.toLocaleDateString()}`;
      intensity = 'an ongoing';
    }

    return { duration, timeline, intensity };
  }

  /**
   * Build challenge narrative
   */
  private buildChallengeNarrative(
    stats: ChallengeStats,
    context: { intensity: string }
  ): {
    hasArc: boolean;
    arcText: string;
    arcSummary: string;
  } {
    const hasArc = stats.lessons_learned.length > 0 || stats.resilience_gained >= 30;

    const arcText = stats.outcome === 'victory'
      ? `This ${context.intensity} challenge became a story of growth and resilience. You navigated it with strength.`
      : stats.outcome === 'defeat'
      ? `This ${context.intensity} challenge taught you valuable lessons. Even in difficulty, there was growth.`
      : `This ${context.intensity} challenge is part of your ongoing journey. You're navigating it with determination.`;

    const arcSummary = stats.lessons_learned.length > 0
      ? `You learned ${stats.lessons_learned.length} important lesson${stats.lessons_learned.length > 1 ? 's' : ''} from this experience`
      : 'This challenge shaped your journey in meaningful ways';

    return { hasArc, arcText, arcSummary };
  }

  /**
   * Build victory story
   */
  private buildVictoryStory(
    stats: ChallengeStats,
    context: { duration: string; timeline: string }
  ): {
    text: string;
    impact: string;
    significance: string;
  } {
    let text = `How you overcame ${stats.challenge_name}`;
    
    if (context.duration) {
      text += `, ${context.intensity} ${stats.challenge_type} challenge that lasted ${context.duration}`;
    }

    const impact = stats.is_boss_challenge
      ? 'This was a major milestone in your journey'
      : stats.resilience_gained >= 50
      ? 'This victory strengthened your resilience significantly'
      : 'This victory showed your ability to overcome obstacles';

    const significance = stats.lessons_learned.length > 0
      ? `You learned valuable lessons that will continue to serve you`
      : 'This experience has shaped who you are';

    return { text, impact, significance };
  }

  /**
   * Build lessons narrative
   */
  private buildLessonsNarrative(stats: ChallengeStats): {
    text: string;
    significance: string;
  } {
    const text = `You learned ${stats.lessons_learned.length} valuable lesson${stats.lessons_learned.length > 1 ? 's' : ''} from ${stats.challenge_name}. These insights will continue to guide you.`;

    const significance = stats.lessons_learned.length >= 3
      ? 'These lessons represent significant growth and understanding'
      : 'These lessons are part of your ongoing development';

    return { text, significance };
  }

  /**
   * Build resilience story
   */
  private buildResilienceStory(
    stats: ChallengeStats,
    context: { duration: string }
  ): {
    text: string;
    evolution: string;
    significance: string;
  } {
    let text = `You've grown stronger through adversity`;
    
    if (context.duration) {
      text += ` during this ${context.duration} challenge`;
    }

    const evolution = stats.resilience_gained >= 70
      ? 'Your resilience has deepened significantly'
      : 'Your ability to navigate difficulty has strengthened';

    const significance = stats.outcome === 'victory'
      ? 'This challenge proved your strength and determination'
      : 'Even in facing this challenge, you showed resilience';

    return { text, evolution, significance };
  }

  /**
   * Build reflection context
   */
  private buildReflectionContext(
    stats: ChallengeStats,
    context: { duration: string }
  ): {
    text: string;
    suggestion: string;
  } {
    const text = `What did you learn from ${stats.challenge_name}${context.duration ? ` during this ${context.duration} period` : ''}?`;

    const suggestion = stats.lessons_learned.length > 0
      ? 'Reflecting on the lessons you learned helps you integrate this growth into your journey'
      : 'Reflecting on challenges helps you understand how you\'ve grown and what you\'ve discovered about yourself';

    return { text, suggestion };
  }

  /**
   * Build ongoing story
   */
  private buildOngoingStory(
    stats: ChallengeStats,
    context: { duration: string; intensity: string }
  ): {
    text: string;
    progress: string;
  } {
    let text = `You're currently navigating ${stats.challenge_name}`;
    
    if (context.duration) {
      text += `, ${context.intensity} challenge you've been facing for ${context.duration}`;
    }

    const progress = context.duration
      ? `You've been working through this for ${context.duration}, showing persistence and determination`
      : 'You\'re showing strength and determination in facing this challenge';

    return { text, progress };
  }

  /**
   * Build boss story
   */
  private buildBossStory(
    stats: ChallengeStats,
    context: { duration: string }
  ): {
    text: string;
    significance: string;
    impact: string;
  } {
    let text = `You overcame a major challenge: ${stats.challenge_name}`;
    
    if (context.duration) {
      text += `, ${context.intensity} ${stats.challenge_type} challenge that lasted ${context.duration}`;
    }

    const significance = `This was a defining moment in your journey. Overcoming this challenge represents significant growth and strength.`;

    const impact = stats.resilience_gained >= 50
      ? 'This victory has fundamentally strengthened your resilience and confidence'
      : 'This victory has shown you what you\'re capable of overcoming';

    return { text, significance, impact };
  }

  /**
   * Generate insights for all challenges
   */
  async generateAllInsights(userId: string, statsList: ChallengeStats[]): Promise<ChallengeInsight[]> {
    const allInsights: ChallengeInsight[] = [];

    for (const stats of statsList) {
      const insights = await this.generateInsights(userId, stats);
      allInsights.push(...insights);
    }

    return allInsights;
  }
}

export const challengeInsightGenerator = new ChallengeInsightGenerator();
