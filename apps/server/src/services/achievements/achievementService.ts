import { logger } from '../../logger';
import { skillService } from '../skills/skillService';
import { supabaseAdmin } from '../supabaseClient';

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
  category?: 'app_usage' | 'real_life';
  achievement_date?: string;
  life_category?: 'career' | 'education' | 'health' | 'relationships' | 'creative' | 'financial' | 'personal_growth' | 'travel' | 'hobby' | 'other';
  evidence?: {
    quotes?: string[];
    linked_memories?: string[];
    linked_characters?: string[];
    linked_locations?: string[];
    photos?: string[];
  };
  verified?: boolean;
  significance_score?: number;
  impact_description?: string;
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
  async getAchievements(
    userId: string, 
    filters?: { 
      type?: AchievementType; 
      rarity?: AchievementRarity;
      category?: 'app_usage' | 'real_life';
      life_category?: string;
      verified?: boolean;
    }
  ): Promise<Achievement[]> {
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

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }

      if (filters?.life_category) {
        query = query.eq('life_category', filters.life_category);
      }

      if (filters?.verified !== undefined) {
        query = query.eq('verified', filters.verified);
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

  /**
   * Calculate rarity for a real-life achievement
   * Uses comprehensive factors: impact, research, difficulty, consensus, data quality
   */
  private calculateRarityForRealLife(achievement: {
    life_category?: string;
    achievement_name?: string;
    significance_score?: number;
    xp_reward?: number;
    verified?: boolean;
    impact_description?: string;
    evidence?: any;
  }): AchievementRarity {
    let score = 0;

    // Real life impact (25% weight)
    const impact = achievement.significance_score || 0.5;
    score += impact * 0.25;

    // Research significance (20% weight) - based on life_category
    const researchScores: Record<string, number> = {
      'health': 0.95,
      'education': 0.90,
      'financial': 0.85,
      'relationships': 0.80,
      'personal_growth': 0.75,
      'career': 0.70,
      'creative': 0.65,
      'travel': 0.55,
      'hobby': 0.50,
      'other': 0.60
    };
    score += (researchScores[achievement.life_category || 'other'] || 0.60) * 0.20;

    // Real life difficulty (18% weight)
    const difficultyScores: Record<string, number> = {
      'health': 0.85,
      'education': 0.80,
      'financial': 0.75,
      'career': 0.70,
      'relationships': 0.65,
      'personal_growth': 0.70,
      'creative': 0.60,
      'travel': 0.40,
      'hobby': 0.50,
      'other': 0.55
    };
    let difficulty = difficultyScores[achievement.life_category || 'other'] || 0.55;
    
    // Adjust based on achievement name
    if (achievement.achievement_name) {
      const lowerName = achievement.achievement_name.toLowerCase();
      if (lowerName.includes('quit') || lowerName.includes('addiction') || 
          lowerName.includes('marathon') || lowerName.includes('degree') ||
          lowerName.includes('therapy') || lowerName.includes('debt')) {
        difficulty = Math.min(1.0, difficulty + 0.15);
      }
    }
    
    // XP reward correlates with difficulty
    if (achievement.xp_reward) {
      const xpDifficulty = Math.min(1.0, achievement.xp_reward / 1000);
      difficulty = (difficulty + xpDifficulty) / 2;
    }
    
    score += difficulty * 0.18;

    // General consensus (15% weight)
    const consensusScores: Record<string, number> = {
      'health': 0.95,
      'education': 0.90,
      'financial': 0.85,
      'career': 0.80,
      'relationships': 0.75,
      'personal_growth': 0.70,
      'creative': 0.65,
      'travel': 0.55,
      'hobby': 0.50,
      'other': 0.60
    };
    let consensus = consensusScores[achievement.life_category || 'other'] || 0.60;
    
    // Boost for high-consensus achievements
    if (achievement.achievement_name) {
      const lowerName = achievement.achievement_name.toLowerCase();
      const highConsensusKeywords = [
        'graduated', 'degree', 'promotion', 'quit smoking', 'marathon',
        'therapy', 'debt', 'loan', 'meditation', 'exercise'
      ];
      if (highConsensusKeywords.some(keyword => lowerName.includes(keyword))) {
        consensus = Math.min(1.0, consensus + 0.1);
      }
    }
    
    score += consensus * 0.15;

    // Data quality (12% weight)
    let evidenceQuality = 0;
    if (achievement.evidence) {
      const evidenceTypes = [
        achievement.evidence.quotes?.length || 0,
        achievement.evidence.linked_memories?.length || 0,
        achievement.evidence.linked_characters?.length || 0,
        achievement.evidence.linked_locations?.length || 0,
        achievement.evidence.photos?.length || 0
      ].filter(count => count > 0).length;
      evidenceQuality = Math.min(1.0, evidenceTypes * 0.2);
    }
    
    const verified = achievement.verified ? 0.3 : 0;
    const dataQuality = Math.min(1.0, evidenceQuality + verified);
    score += dataQuality * 0.12;

    // User-provided significance (10% weight)
    score += (achievement.significance_score || 0.5) * 0.10;

    // Convert to rarity
    if (score >= 0.85) return 'legendary';
    if (score >= 0.70) return 'epic';
    if (score >= 0.50) return 'rare';
    if (score >= 0.30) return 'uncommon';
    return 'common';
  }

  /**
   * Calculate XP reward for real-life achievements
   */
  private calculateXPForRealLife(achievement: {
    life_category?: string;
    significance_score?: number;
  }): number {
    const baseXP: Record<string, number> = {
      'health': 750,
      'education': 800,
      'financial': 1000,
      'career': 500,
      'relationships': 500,
      'personal_growth': 250,
      'creative': 300,
      'travel': 600,
      'hobby': 400,
      'other': 300
    };
    
    const base = baseXP[achievement.life_category || 'other'] || 300;
    const significanceMultiplier = achievement.significance_score || 0.5;
    
    return Math.round(base * (0.5 + significanceMultiplier));
  }

  /**
   * Create a real-life achievement
   */
  async createRealLifeAchievement(
    userId: string,
    achievement: {
      achievement_name: string;
      description: string;
      achievement_date: string;
      life_category: string;
      significance_score?: number;
      impact_description?: string;
      evidence?: any;
      verified?: boolean;
      xp_reward?: number;
      icon_name?: string;
    }
  ): Promise<Achievement> {
    try {
      // Auto-calculate rarity
      const rarity = this.calculateRarityForRealLife({
        life_category: achievement.life_category,
        achievement_name: achievement.achievement_name,
        significance_score: achievement.significance_score,
        xp_reward: achievement.xp_reward,
        verified: achievement.verified,
        impact_description: achievement.impact_description,
        evidence: achievement.evidence
      });

      // Auto-calculate XP if not provided
      const xpReward = achievement.xp_reward || this.calculateXPForRealLife({
        life_category: achievement.life_category,
        significance_score: achievement.significance_score
      });

      const { data, error } = await supabaseAdmin
        .from('achievements')
        .insert({
          user_id: userId,
          achievement_name: achievement.achievement_name,
          achievement_type: 'milestone',
          description: achievement.description,
          icon_name: achievement.icon_name || 'award',
          category: 'real_life',
          achievement_date: achievement.achievement_date,
          life_category: achievement.life_category,
          significance_score: achievement.significance_score || 0.5,
          impact_description: achievement.impact_description,
          evidence: achievement.evidence || {},
          verified: achievement.verified || false,
          unlocked_at: achievement.achievement_date,
          xp_reward: xpReward,
          rarity: rarity,
          criteria_met: { type: 'real_life_achievement' },
          skill_xp_rewards: {},
          metadata: {}
        })
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, achievement }, 'Failed to create real-life achievement');
        throw error;
      }

      return data as Achievement;
    } catch (error) {
      logger.error({ error, userId, achievement }, 'Failed to create real-life achievement');
      throw error;
    }
  }

  /**
   * Calculate rarity for a real-life achievement (preview)
   */
  async calculateRarityPreview(achievement: {
    life_category?: string;
    achievement_name?: string;
    significance_score?: number;
    xp_reward?: number;
    verified?: boolean;
    impact_description?: string;
    evidence?: any;
  }): Promise<AchievementRarity> {
    return this.calculateRarityForRealLife(achievement);
  }
}

export const achievementService = new AchievementService();
