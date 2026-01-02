// Achievement Types
// Gamification achievements system

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

export interface AchievementStatistics {
  total: number;
  byType: Record<AchievementType, number>;
  byRarity: Record<AchievementRarity, number>;
  recent: Achievement[];
}
