import { fetchJson } from '../lib/api';
import type { Achievement, AchievementTemplate, AchievementStatistics, AchievementType, AchievementRarity } from '../types/achievement';

export const achievementsApi = {
  /**
   * Get all achievements
   */
  async getAchievements(filters?: { 
    type?: AchievementType; 
    rarity?: AchievementRarity;
    category?: 'app_usage' | 'real_life';
    life_category?: string;
    verified?: boolean;
  }): Promise<Achievement[]> {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.rarity) params.append('rarity', filters.rarity);
    if (filters?.category) params.append('category', filters.category);
    if (filters?.life_category) params.append('life_category', filters.life_category);
    if (filters?.verified !== undefined) params.append('verified', String(filters.verified));

    const url = `/api/achievements${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetchJson<{ achievements: Achievement[] }>(url);
    return response.achievements;
  },

  /**
   * Get achievement templates
   */
  async getTemplates(): Promise<AchievementTemplate[]> {
    const response = await fetchJson<{ templates: AchievementTemplate[] }>('/api/achievements/templates');
    return response.templates;
  },

  /**
   * Check and unlock achievements
   */
  async checkAchievements(): Promise<{ unlocked: Achievement[]; count: number }> {
    const response = await fetchJson<{ unlocked: Achievement[]; count: number }>('/api/achievements/check', {
      method: 'POST'
    });
    return response;
  },

  /**
   * Get achievement statistics
   */
  async getStatistics(): Promise<AchievementStatistics> {
    const response = await fetchJson<{ statistics: AchievementStatistics }>('/api/achievements/statistics');
    return response.statistics;
  },

  /**
   * Create a real-life achievement
   */
  async createRealLifeAchievement(achievement: {
    achievement_name: string;
    description: string;
    achievement_date: string;
    life_category: string;
    significance_score?: number;
    impact_description?: string;
    evidence?: unknown;
    verified?: boolean;
    xp_reward?: number;
    icon_name?: string;
  }): Promise<Achievement> {
    const response = await fetchJson<{ achievement: Achievement }>('/api/achievements/real-life', {
      method: 'POST',
      body: JSON.stringify(achievement)
    });
    return response.achievement;
  },

  /**
   * Calculate rarity for a real-life achievement (preview)
   */
  async calculateRarity(achievement: {
    life_category?: string;
    achievement_name?: string;
    significance_score?: number;
    xp_reward?: number;
    verified?: boolean;
    impact_description?: string;
    evidence?: unknown;
  }): Promise<AchievementRarity> {
    const response = await fetchJson<{ rarity: AchievementRarity }>('/api/achievements/real-life/calculate-rarity', {
      method: 'POST',
      body: JSON.stringify(achievement)
    });
    return response.rarity;
  }
};
