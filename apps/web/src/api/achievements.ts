import { fetchJson } from '../lib/api';
import type { Achievement, AchievementTemplate, AchievementStatistics, AchievementType, AchievementRarity } from '../types/achievement';

export const achievementsApi = {
  /**
   * Get all achievements
   */
  async getAchievements(filters?: { type?: AchievementType; rarity?: AchievementRarity }): Promise<Achievement[]> {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.rarity) params.append('rarity', filters.rarity);

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
  }
};
