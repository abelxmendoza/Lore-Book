// Achievement Types
// Gamification achievements system

export type AchievementType = 'milestone' | 'streak' | 'skill_level' | 'xp_milestone' | 'consistency' | 'exploration' | 'reflection' | 'growth' | 'other';
export type AchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type AchievementCategory = 'app_usage' | 'real_life';

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
  category?: AchievementCategory; // 'app_usage' or 'real_life'
  metadata: Record<string, unknown>;
  created_at: string;
}

// Real Life Achievement (extends Achievement with life-specific fields)
export interface RealLifeAchievement extends Achievement {
  category: 'real_life';
  achievement_date: string; // When it actually happened in real life
  life_category?: 'career' | 'education' | 'health' | 'relationships' | 'creative' | 'financial' | 'personal_growth' | 'travel' | 'hobby' | 'other';
  evidence?: {
    quotes?: string[];
    linked_memories?: string[];
    linked_characters?: string[];
    linked_locations?: string[];
    photos?: string[];
  };
  verified?: boolean;
  significance_score?: number; // 0.0 - 1.0
  impact_description?: string;
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

export interface AchievementStatistics {
  total: number;
  byType: Record<AchievementType, number>;
  byRarity: Record<AchievementRarity, number>;
  recent: Achievement[];
}
