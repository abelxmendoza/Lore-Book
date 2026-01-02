/**
 * XP Engine Analytics Module
 * Gamification system for life experiences
 */

import { BaseAnalyticsModule } from './base';
import type { AnalyticsPayload, MemoryData } from './types';

interface XpBreakdown {
  domain: string;
  xp: number;
  percentage: number;
}

export class XpEngineModule extends BaseAnalyticsModule {
  protected readonly moduleType = 'xp' as const;
  private readonly BASE_XP_PER_MEMORY = 10;
  private readonly XP_PER_LEVEL = 100; // Logarithmic scaling
  private readonly STREAK_BONUS = 5; // XP bonus per day in streak
  private readonly NEGATIVE_XP_MULTIPLIER = 0.5; // Reduce XP for negative memories

  async run(userId: string): Promise<AnalyticsPayload> {
    const cached = await this.getCachedResult(userId);
    if (cached) {
      return cached;
    }

    const memories = await this.fetchMemories(userId);
    
    if (memories.length === 0) {
      return this.emptyPayload();
    }

    // Sort by date
    memories.sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Calculate XP
    const totalXP = this.calculateTotalXP(memories);
    const currentLevel = this.calculateLevel(totalXP);
    const dailyXP = this.calculateDailyXP(memories);
    const breakdown = this.calculateBreakdown(memories);

    const payload: AnalyticsPayload = {
      metrics: {
        currentLevel,
        totalXP,
        dailyXP,
        xpToNextLevel: this.getXPToNextLevel(currentLevel, totalXP),
        streak: this.calculateStreak(memories),
        breakdown: breakdown.reduce((acc, b) => {
          acc[b.domain] = b.xp;
          return acc;
        }, {} as Record<string, number>),
      },
      charts: [
        {
          type: 'pie',
          title: 'XP by Domain',
          data: breakdown.map(b => ({
            domain: b.domain,
            value: b.xp,
            percentage: b.percentage,
          })),
        },
        {
          type: 'line',
          title: 'Daily XP Over Time',
          data: this.calculateDailyXPTimeline(memories),
          xAxis: 'date',
          yAxis: 'xp',
        },
      ],
      insights: [
        ...this.generateLevelInsights(currentLevel, totalXP),
        ...this.generateStreakInsights(memories),
        ...this.generateDomainInsights(breakdown),
      ],
      summary: this.generateSummary(currentLevel, totalXP, dailyXP, breakdown),
    };

    await this.cacheResult(userId, payload);
    return payload;
  }

  /**
   * Calculate total XP from all memories
   */
  private calculateTotalXP(memories: MemoryData[]): number {
    let totalXP = 0;

    for (const memory of memories) {
      const baseXP = this.BASE_XP_PER_MEMORY;
      const sentiment = memory.sentiment ?? 0;
      
      // Adjust XP based on sentiment
      let xp = baseXP;
      if (sentiment < 0) {
        xp *= this.NEGATIVE_XP_MULTIPLIER; // Reduce XP for negative memories
      } else if (sentiment > 0.5) {
        xp *= 1.5; // Bonus for very positive memories
      }

      // Bonus for memories with multiple topics (rich experiences)
      const topicBonus = (memory.topics?.length || 0) * 2;
      xp += topicBonus;

      // Bonus for memories mentioning people (social experiences)
      const peopleBonus = (memory.people?.length || 0) * 1;
      xp += peopleBonus;

      totalXP += Math.round(xp);
    }

    // Apply streak bonus
    const streak = this.calculateStreak(memories);
    totalXP += streak * this.STREAK_BONUS;

    return totalXP;
  }

  /**
   * Calculate level using logarithmic scale
   */
  private calculateLevel(totalXP: number): number {
    // Level = floor(log2(totalXP / XP_PER_LEVEL)) + 1
    if (totalXP < this.XP_PER_LEVEL) {
      return 1;
    }
    return Math.floor(Math.log2(totalXP / this.XP_PER_LEVEL)) + 1;
  }

  /**
   * Get XP needed for next level
   */
  private getXPToNextLevel(currentLevel: number, totalXP: number): number {
    const nextLevelXP = this.XP_PER_LEVEL * Math.pow(2, currentLevel);
    return Math.max(0, nextLevelXP - totalXP);
  }

  /**
   * Calculate daily XP (average)
   */
  private calculateDailyXP(memories: MemoryData[]): number {
    if (memories.length === 0) {
      return 0;
    }

    const dates = memories.map(m => new Date(m.created_at));
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const days = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));

    const totalXP = this.calculateTotalXP(memories);
    return totalXP / days;
  }

  /**
   * Calculate XP breakdown by domain (topic)
   */
  private calculateBreakdown(memories: MemoryData[]): XpBreakdown[] {
    const domainXP = new Map<string, number>();
    const totalXP = this.calculateTotalXP(memories);

    for (const memory of memories) {
      const baseXP = this.BASE_XP_PER_MEMORY;
      const sentiment = memory.sentiment ?? 0;
      let xp = baseXP;
      
      if (sentiment < 0) {
        xp *= this.NEGATIVE_XP_MULTIPLIER;
      } else if (sentiment > 0.5) {
        xp *= 1.5;
      }

      // Distribute XP across topics
      const topics = memory.topics || [];
      const xpPerTopic = topics.length > 0 ? xp / topics.length : xp;

      for (const topic of topics) {
        domainXP.set(topic, (domainXP.get(topic) || 0) + xpPerTopic);
      }

      // If no topics, assign to "general"
      if (topics.length === 0) {
        domainXP.set('general', (domainXP.get('general') || 0) + xp);
      }
    }

    const breakdown = Array.from(domainXP.entries())
      .map(([domain, xp]) => ({
        domain,
        xp: Math.round(xp),
        percentage: totalXP > 0 ? (xp / totalXP) * 100 : 0,
      }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 10); // Top 10 domains

    return breakdown;
  }

  /**
   * Calculate writing streak (consecutive days with entries)
   */
  private calculateStreak(memories: MemoryData[]): number {
    if (memories.length === 0) {
      return 0;
    }

    // Group by date
    const dates = new Set(
      memories.map(m => {
        const date = new Date(m.created_at);
        return date.toISOString().split('T')[0];
      })
    );

    const sortedDates = Array.from(dates).sort().reverse();
    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let currentDate = today;

    for (const date of sortedDates) {
      // Check if date is consecutive
      const expectedDate = new Date(currentDate);
      expectedDate.setDate(expectedDate.getDate() - 1);
      const expectedDateStr = expectedDate.toISOString().split('T')[0];

      if (date === currentDate || date === expectedDateStr) {
        streak++;
        currentDate = date;
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Calculate daily XP timeline
   */
  private calculateDailyXPTimeline(memories: MemoryData[]): Array<{ date: string; xp: number }> {
    const dailyXP = new Map<string, number>();

    for (const memory of memories) {
      const date = new Date(memory.created_at).toISOString().split('T')[0];
      const baseXP = this.BASE_XP_PER_MEMORY;
      const sentiment = memory.sentiment ?? 0;
      
      let xp = baseXP;
      if (sentiment < 0) {
        xp *= this.NEGATIVE_XP_MULTIPLIER;
      } else if (sentiment > 0.5) {
        xp *= 1.5;
      }

      xp += (memory.topics?.length || 0) * 2;
      xp += (memory.people?.length || 0) * 1;

      dailyXP.set(date, (dailyXP.get(date) || 0) + Math.round(xp));
    }

    return Array.from(dailyXP.entries())
      .map(([date, xp]) => ({ date, xp }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30); // Last 30 days
  }

  /**
   * Generate insights
   */
  private generateLevelInsights(level: number, totalXP: number): Array<{ text: string; category: string; score: number }> {
    const xpToNext = this.getXPToNextLevel(level, totalXP);
    const progress = xpToNext > 0 ? ((this.XP_PER_LEVEL * Math.pow(2, level) - xpToNext) / (this.XP_PER_LEVEL * Math.pow(2, level))) * 100 : 100;

    return [
      {
        text: `You're at Level ${level} with ${totalXP} total XP. ${progress.toFixed(0)}% progress to Level ${level + 1}.`,
        category: 'level',
        score: progress / 100,
      },
    ];
  }

  private generateStreakInsights(memories: MemoryData[]): Array<{ text: string; category: string; score: number }> {
    const streak = this.calculateStreak(memories);

    if (streak === 0) {
      return [];
    }

    return [
      {
        text: `Current writing streak: ${streak} day${streak > 1 ? 's' : ''}. Keep it up!`,
        category: 'streak',
        score: Math.min(1, streak / 30), // Normalize to 30 days
      },
    ];
  }

  private generateDomainInsights(breakdown: XpBreakdown[]): Array<{ text: string; category: string; score: number }> {
    if (breakdown.length === 0) {
      return [];
    }

    const topDomain = breakdown[0];

    return [
      {
        text: `Your top life domain is "${topDomain.domain}" with ${topDomain.xp} XP (${topDomain.percentage.toFixed(0)}% of total).`,
        category: 'domain',
        score: topDomain.percentage / 100,
      },
    ];
  }

  private generateSummary(level: number, totalXP: number, dailyXP: number, breakdown: XpBreakdown[]): string {
    const topDomain = breakdown[0];
    const xpToNext = this.getXPToNextLevel(level, totalXP);

    let summary = `You're at Level ${level} with ${totalXP} total XP. `;
    summary += `You're earning ${dailyXP.toFixed(1)} XP per day on average. `;
    
    if (topDomain) {
      summary += `Your most active domain is "${topDomain.domain}" (${topDomain.percentage.toFixed(0)}% of XP). `;
    }

    if (xpToNext > 0) {
      summary += `${xpToNext} XP needed to reach Level ${level + 1}.`;
    } else {
      summary += `Ready to level up!`;
    }

    return summary;
  }

  private emptyPayload(): AnalyticsPayload {
    return {
      metrics: {
        currentLevel: 1,
        totalXP: 0,
        dailyXP: 0,
        xpToNextLevel: 100,
        streak: 0,
      },
      charts: [],
      insights: [],
      summary: 'Not enough data to generate XP analytics.',
    };
  }
}

export const xpEngineModule = new XpEngineModule();
