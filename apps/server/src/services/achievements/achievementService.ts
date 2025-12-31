import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';
import { skillService } from '../skills/skillService';

export type AchievementType = 'milestone' | 'streak' | 'skill_level' | 'xp_milestone' | 'consistency' | 'exploration' | 'reflection' | 'growth' | 'other';
export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface Achievement {
  id: string;
  user_id: string;
  achievement_name: string;
  achievement_type: AchievementType;
  description: string | null;
  icon_name: string | null;
  criteria_met: Record<string, unknown>;
  unlocked_at: string;
  xp_reward: number;
  skill_xp_rewards: Record<string, number>;
  rarity: AchievementRarity;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AchievementTemplate {
  id: string;
  achievement_name: string;
  achievement_type: AchievementType;
  description: string;
  icon_name: string | null;
  criteria_type: string;
  criteria_config: Record<string, unknown>;
  xp_reward: number;
  rarity: AchievementRarity;
  is_active: boolean;
  created_at: string;
}

/**
 * Achievement Service
 * Manages achievements and auto-detection
 */
class AchievementService {
  /**
   * Get all achievements for a user
   */
  async getAchievements(userId: string, filters?: { type?: AchievementType; rarity?: AchievementRarity }): Promise<Achievement[]> {
    try {
      let query = supabaseAdmin
        .from('achievements')
        .select('*')
        .eq('user_id', userId)
        .order('unlocked_at', { ascending: false });

      if (filters?.type) {
        query = query.eq('achievement_type', filters.type);
      }

      if (filters?.rarity) {
        query = query.eq('rarity', filters.rarity);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error, userId }, 'Failed to get achievements');
        throw error;
      }

      return (data || []) as Achievement[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get achievements');
      throw error;
    }
  }

  /**
   * Get achievement templates
   */
  async getTemplates(): Promise<AchievementTemplate[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('achievement_templates')
        .select('*')
        .eq('is_active', true)
        .order('rarity', { ascending: true });

      if (error) {
        logger.error({ error }, 'Failed to get achievement templates');
        throw error;
      }

      return (data || []) as AchievementTemplate[];
    } catch (error) {
      logger.error({ error }, 'Failed to get achievement templates');
      throw error;
    }
  }

  /**
   * Check and unlock achievements based on criteria
   */
  async checkAchievements(userId: string): Promise<Achievement[]> {
    try {
      const templates = await this.getTemplates();
      const unlocked: Achievement[] = [];

      for (const template of templates) {
        // Check if already unlocked
        const { data: existing } = await supabaseAdmin
          .from('achievements')
          .select('id')
          .eq('user_id', userId)
          .eq('achievement_name', template.achievement_name)
          .single();

        if (existing) continue; // Already unlocked

        // Check criteria
        const criteriaMet = await this.checkCriteria(userId, template);
        if (criteriaMet) {
          const achievement = await this.unlockAchievement(userId, template, criteriaMet);
          unlocked.push(achievement);
        }
      }

      return unlocked;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to check achievements');
      return [];
    }
  }

  /**
   * Check if achievement criteria is met
   */
  private async checkCriteria(userId: string, template: AchievementTemplate): Promise<Record<string, unknown> | null> {
    try {
      const { criteria_type, criteria_config } = template;

      switch (criteria_type) {
        case 'count': {
          const entity = criteria_config.entity as string;
          const target = criteria_config.target as number;
          
          let count = 0;
          if (entity === 'journal_entries') {
            const { count: entryCount } = await supabaseAdmin
              .from('journal_entries')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', userId);
            count = entryCount || 0;
          } else if (entity === 'skills') {
            const skills = await skillService.getSkills(userId, { active_only: true });
            count = skills.length;
          } else if (entity === 'reaction_entries') {
            const { count: reactionCount } = await supabaseAdmin
              .from('reaction_entries')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', userId);
            count = reactionCount || 0;
          } else if (entity === 'perception_entries') {
            const { count: perceptionCount } = await supabaseAdmin
              .from('perception_entries')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', userId);
            count = perceptionCount || 0;
          }

          if (count >= target) {
            return { count, target, entity };
          }
          return null;
        }

        case 'streak': {
          const target = criteria_config.target as number;
          // Get streak from journal entries
          const { data: entries } = await supabaseAdmin
            .from('journal_entries')
            .select('created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);

          if (!entries || entries.length === 0) return null;

          const dates = new Set(entries.map(e => new Date(e.created_at).toISOString().split('T')[0]));
          const sortedDates = Array.from(dates).sort().reverse();
          
          let streak = 0;
          const today = new Date().toISOString().split('T')[0];
          let currentDate = today;

          for (const date of sortedDates) {
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

          if (streak >= target) {
            return { streak, target };
          }
          return null;
        }

        case 'level': {
          const target = criteria_config.target as number;
          // Get level from XP analytics cache
          const { data: xpData } = await supabaseAdmin
            .from('analytics_cache')
            .select('payload')
            .eq('user_id', userId)
            .eq('module_type', 'xp')
            .single();

          if (!xpData) return null;

          const metrics = (xpData.payload as any)?.metrics;
          const currentLevel = metrics?.currentLevel || 1;

          if (currentLevel >= target) {
            return { level: currentLevel, target };
          }
          return null;
        }

        case 'skill_level': {
          const target = criteria_config.target as number;
          const skills = await skillService.getSkills(userId, { active_only: true });
          const maxLevel = Math.max(...skills.map(s => s.current_level), 0);

          if (maxLevel >= target) {
            return { maxLevel, target };
          }
          return null;
        }

        default:
          return null;
      }
    } catch (error) {
      logger.error({ error, userId, template }, 'Failed to check criteria');
      return null;
    }
  }

  /**
   * Unlock an achievement
   */
  private async unlockAchievement(
    userId: string,
    template: AchievementTemplate,
    criteriaMet: Record<string, unknown>
  ): Promise<Achievement> {
    try {
      const { data, error } = await supabaseAdmin
        .from('achievements')
        .insert({
          user_id: userId,
          achievement_name: template.achievement_name,
          achievement_type: template.achievement_type,
          description: template.description,
          icon_name: template.icon_name,
          criteria_met: criteriaMet,
          unlocked_at: new Date().toISOString(),
          xp_reward: template.xp_reward,
          skill_xp_rewards: {},
          rarity: template.rarity
        })
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, template }, 'Failed to unlock achievement');
        throw error;
      }

      return data as Achievement;
    } catch (error) {
      logger.error({ error, userId, template }, 'Failed to unlock achievement');
      throw error;
    }
  }

  /**
   * Get achievement statistics
   */
  async getStatistics(userId: string): Promise<{
    total: number;
    byType: Record<AchievementType, number>;
    byRarity: Record<AchievementRarity, number>;
    recent: Achievement[];
  }> {
    try {
      const achievements = await this.getAchievements(userId);

      const byType: Record<string, number> = {};
      const byRarity: Record<string, number> = {};

      achievements.forEach(ach => {
        byType[ach.achievement_type] = (byType[ach.achievement_type] || 0) + 1;
        byRarity[ach.rarity] = (byRarity[ach.rarity] || 0) + 1;
      });

      return {
        total: achievements.length,
        byType: byType as Record<AchievementType, number>,
        byRarity: byRarity as Record<AchievementRarity, number>,
        recent: achievements.slice(0, 10)
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get achievement statistics');
      return {
        total: 0,
        byType: {} as Record<AchievementType, number>,
        byRarity: {} as Record<AchievementRarity, number>,
        recent: []
      };
    }
  }
}

export const achievementService = new AchievementService();
