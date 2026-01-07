/**
 * Mock Achievements Data
 * Comprehensive set of achievements across all rarities and types
 * Includes both app usage achievements and real-life achievements
 */

import type { Achievement, AchievementStatistics, AchievementRarity, RealLifeAchievement } from '../types/achievement';
import { calculateAchievementRarity } from '../utils/achievementRarityCalculator';

const now = new Date();
const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

// App Usage Achievements (gamification)
export const MOCK_APP_ACHIEVEMENTS: Achievement[] = [
  // Common Achievements
  {
    id: '1',
    user_id: 'user',
    achievement_name: 'First Entry',
    achievement_type: 'milestone',
    description: 'Wrote your first journal entry',
    icon_name: 'book-open',
    criteria_met: { count: 1 },
    unlocked_at: twoMonthsAgo.toISOString(),
    xp_reward: 50,
    skill_xp_rewards: {},
    rarity: 'common',
    metadata: {},
    created_at: twoMonthsAgo.toISOString()
  },
  {
    id: '2',
    user_id: 'user',
    achievement_name: 'Week Warrior',
    achievement_type: 'streak',
    description: '7 days of consecutive journaling',
    icon_name: 'flame',
    criteria_met: { streak: 7 },
    unlocked_at: monthAgo.toISOString(),
    xp_reward: 100,
    skill_xp_rewards: {},
    rarity: 'common',
    metadata: {},
    created_at: monthAgo.toISOString()
  },
  {
    id: '3',
    user_id: 'user',
    achievement_name: 'Level 5',
    achievement_type: 'xp_milestone',
    description: 'Reached Level 5',
    icon_name: 'trophy',
    criteria_met: { level: 5 },
    unlocked_at: twoWeeksAgo.toISOString(),
    xp_reward: 250,
    skill_xp_rewards: {},
    rarity: 'common',
    metadata: {},
    created_at: twoWeeksAgo.toISOString()
  },
  {
    id: '4',
    user_id: 'user',
    achievement_name: 'Memory Keeper',
    achievement_type: 'milestone',
    description: 'Created 10 journal entries',
    icon_name: 'book-open',
    criteria_met: { count: 10 },
    unlocked_at: monthAgo.toISOString(),
    xp_reward: 75,
    skill_xp_rewards: {},
    rarity: 'common',
    metadata: {},
    created_at: monthAgo.toISOString()
  },
  {
    id: '5',
    user_id: 'user',
    achievement_name: 'Character Creator',
    achievement_type: 'milestone',
    description: 'Added your first character',
    icon_name: 'users',
    criteria_met: { count: 1 },
    unlocked_at: twoWeeksAgo.toISOString(),
    xp_reward: 50,
    skill_xp_rewards: {},
    rarity: 'common',
    metadata: {},
    created_at: twoWeeksAgo.toISOString()
  },

  // Uncommon Achievements
  {
    id: '6',
    user_id: 'user',
    achievement_name: 'Skill Master',
    achievement_type: 'skill_level',
    description: 'Reached level 10 in any skill',
    icon_name: 'award',
    criteria_met: { maxLevel: 10 },
    unlocked_at: weekAgo.toISOString(),
    xp_reward: 300,
    skill_xp_rewards: {},
    rarity: 'uncommon',
    metadata: {},
    created_at: weekAgo.toISOString()
  },
  {
    id: '7',
    user_id: 'user',
    achievement_name: 'Month Master',
    achievement_type: 'streak',
    description: '30 days of consecutive journaling',
    icon_name: 'flame',
    criteria_met: { streak: 30 },
    unlocked_at: threeDaysAgo.toISOString(),
    xp_reward: 500,
    skill_xp_rewards: {},
    rarity: 'uncommon',
    metadata: {},
    created_at: threeDaysAgo.toISOString()
  },
  {
    id: '8',
    user_id: 'user',
    achievement_name: 'Level 10',
    achievement_type: 'xp_milestone',
    description: 'Reached Level 10',
    icon_name: 'trophy',
    criteria_met: { level: 10 },
    unlocked_at: weekAgo.toISOString(),
    xp_reward: 500,
    skill_xp_rewards: {},
    rarity: 'uncommon',
    metadata: {},
    created_at: weekAgo.toISOString()
  },
  {
    id: '9',
    user_id: 'user',
    achievement_name: 'Storyteller',
    achievement_type: 'milestone',
    description: 'Created 50 journal entries',
    icon_name: 'book-open',
    criteria_met: { count: 50 },
    unlocked_at: twoWeeksAgo.toISOString(),
    xp_reward: 200,
    skill_xp_rewards: {},
    rarity: 'uncommon',
    metadata: {},
    created_at: twoWeeksAgo.toISOString()
  },
  {
    id: '10',
    user_id: 'user',
    achievement_name: 'Network Builder',
    achievement_type: 'milestone',
    description: 'Added 10 characters to your story',
    icon_name: 'users',
    criteria_met: { count: 10 },
    unlocked_at: weekAgo.toISOString(),
    xp_reward: 250,
    skill_xp_rewards: {},
    rarity: 'uncommon',
    metadata: {},
    created_at: weekAgo.toISOString()
  },

  // Rare Achievements
  {
    id: '11',
    user_id: 'user',
    achievement_name: 'Elite Skill',
    achievement_type: 'skill_level',
    description: 'Reached level 20 in any skill',
    icon_name: 'award',
    criteria_met: { maxLevel: 20 },
    unlocked_at: threeDaysAgo.toISOString(),
    xp_reward: 750,
    skill_xp_rewards: {},
    rarity: 'rare',
    metadata: {},
    created_at: threeDaysAgo.toISOString()
  },
  {
    id: '12',
    user_id: 'user',
    achievement_name: 'Centurion',
    achievement_type: 'streak',
    description: '100 days of consecutive journaling',
    icon_name: 'flame',
    criteria_met: { streak: 100 },
    unlocked_at: oneDayAgo.toISOString(),
    xp_reward: 1000,
    skill_xp_rewards: {},
    rarity: 'rare',
    metadata: {},
    created_at: oneDayAgo.toISOString()
  },
  {
    id: '13',
    user_id: 'user',
    achievement_name: 'Level 20',
    achievement_type: 'xp_milestone',
    description: 'Reached Level 20',
    icon_name: 'trophy',
    criteria_met: { level: 20 },
    unlocked_at: weekAgo.toISOString(),
    xp_reward: 1000,
    skill_xp_rewards: {},
    rarity: 'rare',
    metadata: {},
    created_at: weekAgo.toISOString()
  },
  {
    id: '14',
    user_id: 'user',
    achievement_name: 'Master Chronicler',
    achievement_type: 'milestone',
    description: 'Created 200 journal entries',
    icon_name: 'book-open',
    criteria_met: { count: 200 },
    unlocked_at: twoWeeksAgo.toISOString(),
    xp_reward: 500,
    skill_xp_rewards: {},
    rarity: 'rare',
    metadata: {},
    created_at: twoWeeksAgo.toISOString()
  },
  {
    id: '15',
    user_id: 'user',
    achievement_name: 'Insight Seeker',
    achievement_type: 'milestone',
    description: 'Generated 50 insights from your memories',
    icon_name: 'brain',
    criteria_met: { count: 50 },
    unlocked_at: threeDaysAgo.toISOString(),
    xp_reward: 600,
    skill_xp_rewards: {},
    rarity: 'rare',
    metadata: {},
    created_at: threeDaysAgo.toISOString()
  },

  // Epic Achievements
  {
    id: '16',
    user_id: 'user',
    achievement_name: 'Grandmaster',
    achievement_type: 'skill_level',
    description: 'Reached level 30 in any skill',
    icon_name: 'award',
    criteria_met: { maxLevel: 30 },
    unlocked_at: oneDayAgo.toISOString(),
    xp_reward: 1500,
    skill_xp_rewards: {},
    rarity: 'epic',
    metadata: {},
    created_at: oneDayAgo.toISOString()
  },
  {
    id: '17',
    user_id: 'user',
    achievement_name: 'Year Warrior',
    achievement_type: 'streak',
    description: '365 days of consecutive journaling',
    icon_name: 'flame',
    criteria_met: { streak: 365 },
    unlocked_at: now.toISOString(),
    xp_reward: 2500,
    skill_xp_rewards: {},
    rarity: 'epic',
    metadata: {},
    created_at: now.toISOString()
  },
  {
    id: '18',
    user_id: 'user',
    achievement_name: 'Level 30',
    achievement_type: 'xp_milestone',
    description: 'Reached Level 30',
    icon_name: 'trophy',
    criteria_met: { level: 30 },
    unlocked_at: threeDaysAgo.toISOString(),
    xp_reward: 2000,
    skill_xp_rewards: {},
    rarity: 'epic',
    metadata: {},
    created_at: threeDaysAgo.toISOString()
  },
  {
    id: '19',
    user_id: 'user',
    achievement_name: 'Legendary Archivist',
    achievement_type: 'milestone',
    description: 'Created 500 journal entries',
    icon_name: 'book-open',
    criteria_met: { count: 500 },
    unlocked_at: weekAgo.toISOString(),
    xp_reward: 1000,
    skill_xp_rewards: {},
    rarity: 'epic',
    metadata: {},
    created_at: weekAgo.toISOString()
  },
  {
    id: '20',
    user_id: 'user',
    achievement_name: 'Wisdom Keeper',
    achievement_type: 'milestone',
    description: 'Generated 200 insights from your memories',
    icon_name: 'brain',
    criteria_met: { count: 200 },
    unlocked_at: oneDayAgo.toISOString(),
    xp_reward: 1200,
    skill_xp_rewards: {},
    rarity: 'epic',
    metadata: {},
    created_at: oneDayAgo.toISOString()
  },

  // Legendary Achievements
  {
    id: '21',
    user_id: 'user',
    achievement_name: 'Transcendent Master',
    achievement_type: 'skill_level',
    description: 'Reached level 50 in any skill',
    icon_name: 'award',
    criteria_met: { maxLevel: 50 },
    unlocked_at: now.toISOString(),
    xp_reward: 5000,
    skill_xp_rewards: {},
    rarity: 'legendary',
    metadata: {},
    created_at: now.toISOString()
  },
  {
    id: '22',
    user_id: 'user',
    achievement_name: 'Immortal Flame',
    achievement_type: 'streak',
    description: '1000 days of consecutive journaling',
    icon_name: 'flame',
    criteria_met: { streak: 1000 },
    unlocked_at: now.toISOString(),
    xp_reward: 10000,
    skill_xp_rewards: {},
    rarity: 'legendary',
    metadata: {},
    created_at: now.toISOString()
  },
  {
    id: '23',
    user_id: 'user',
    achievement_name: 'Level 50',
    achievement_type: 'xp_milestone',
    description: 'Reached Level 50',
    icon_name: 'trophy',
    criteria_met: { level: 50 },
    unlocked_at: oneDayAgo.toISOString(),
    xp_reward: 5000,
    skill_xp_rewards: {},
    rarity: 'legendary',
    metadata: {},
    created_at: oneDayAgo.toISOString()
  },
  {
    id: '24',
    user_id: 'user',
    achievement_name: 'Master of Memories',
    achievement_type: 'milestone',
    description: 'Created 1000 journal entries',
    icon_name: 'book-open',
    criteria_met: { count: 1000 },
    unlocked_at: threeDaysAgo.toISOString(),
    xp_reward: 2500,
    skill_xp_rewards: {},
    rarity: 'legendary',
    metadata: {},
    created_at: threeDaysAgo.toISOString()
  },
  {
    id: '25',
    user_id: 'user',
    achievement_name: 'Oracle',
    achievement_type: 'milestone',
    description: 'Generated 500 insights from your memories',
    icon_name: 'brain',
    criteria_met: { count: 500 },
    unlocked_at: now.toISOString(),
    xp_reward: 3000,
    skill_xp_rewards: {},
    rarity: 'legendary',
    metadata: {},
    created_at: now.toISOString()
  }
].map(a => ({ ...a, category: 'app_usage' as const }));

// Real Life Achievements (actual life accomplishments)
// Note: Rarity is auto-calculated based on significance, evidence, and impact
const REAL_LIFE_ACHIEVEMENTS_DATA: Omit<RealLifeAchievement, 'rarity'>[] = [
  {
    id: 'rl-1',
    user_id: 'user',
    achievement_name: 'Career Promotion',
    achievement_type: 'milestone',
    description: 'Got promoted to Senior Software Engineer',
    icon_name: 'trending-up',
    criteria_met: { type: 'career_milestone' },
    unlocked_at: monthAgo.toISOString(),
    achievement_date: monthAgo.toISOString(),
    xp_reward: 500,
    skill_xp_rewards: {},
    category: 'real_life',
    life_category: 'career',
    verified: true,
    significance_score: 0.85,
    impact_description: 'Major career milestone that opened new opportunities',
    evidence: {
      quotes: ['"Finally got the promotion I\'ve been working towards for 2 years"'],
      linked_memories: [],
      linked_characters: [],
      linked_locations: []
    },
    metadata: {},
    created_at: monthAgo.toISOString()
  },
  {
    id: 'rl-2',
    user_id: 'user',
    achievement_name: 'Marathon Completed',
    achievement_type: 'milestone',
    description: 'Completed my first marathon in under 4 hours',
    icon_name: 'trophy',
    criteria_met: { type: 'health_milestone' },
    unlocked_at: twoWeeksAgo.toISOString(),
    achievement_date: twoWeeksAgo.toISOString(),
    xp_reward: 750,
    skill_xp_rewards: {},
    category: 'real_life',
    life_category: 'health',
    verified: true,
    significance_score: 0.9,
    impact_description: 'Proved to myself that I can achieve long-term fitness goals',
    evidence: {
      quotes: ['"Crossed the finish line at 3:52:14 - never thought I could do it!"'],
      linked_memories: [],
      linked_characters: [],
      linked_locations: []
    },
    metadata: {},
    created_at: twoWeeksAgo.toISOString()
  },
  {
    id: 'rl-3',
    user_id: 'user',
    achievement_name: 'Published First Article',
    achievement_type: 'milestone',
    description: 'Published my first technical article on Medium',
    icon_name: 'book-open',
    criteria_met: { type: 'creative_milestone' },
    unlocked_at: weekAgo.toISOString(),
    achievement_date: weekAgo.toISOString(),
    xp_reward: 300,
    skill_xp_rewards: {},
    category: 'real_life',
    life_category: 'creative',
    verified: true,
    significance_score: 0.7,
    impact_description: 'Started sharing knowledge publicly',
    evidence: {
      quotes: ['"My article got 500 views in the first week!"'],
      linked_memories: [],
      linked_characters: [],
      linked_locations: []
    },
    metadata: {},
    created_at: weekAgo.toISOString()
  },
  {
    id: 'rl-4',
    user_id: 'user',
    achievement_name: 'Paid Off Student Loans',
    achievement_type: 'milestone',
    description: 'Finally paid off all student loan debt',
    icon_name: 'trending-up',
    criteria_met: { type: 'financial_milestone' },
    unlocked_at: threeDaysAgo.toISOString(),
    achievement_date: threeDaysAgo.toISOString(),
    xp_reward: 1000,
    skill_xp_rewards: {},
    category: 'real_life',
    life_category: 'financial',
    verified: true,
    significance_score: 0.95,
    impact_description: 'Achieved financial freedom and eliminated major debt',
    evidence: {
      quotes: ['"Last payment made - $45,000 in debt gone forever!"'],
      linked_memories: [],
      linked_characters: [],
      linked_locations: []
    },
    metadata: {},
    created_at: threeDaysAgo.toISOString()
  },
  {
    id: 'rl-5',
    user_id: 'user',
    achievement_name: 'Learned Guitar',
    achievement_type: 'milestone',
    description: 'Learned to play guitar and performed at open mic',
    icon_name: 'award',
    criteria_met: { type: 'hobby_milestone' },
    unlocked_at: oneDayAgo.toISOString(),
    achievement_date: oneDayAgo.toISOString(),
    xp_reward: 400,
    skill_xp_rewards: {},
    category: 'real_life',
    life_category: 'hobby',
    verified: true,
    significance_score: 0.65,
    impact_description: 'Conquered stage fright and learned a new skill',
    evidence: {
      quotes: ['"Played my first song in front of an audience - terrified but amazing!"'],
      linked_memories: [],
      linked_characters: [],
      linked_locations: []
    },
    metadata: {},
    created_at: oneDayAgo.toISOString()
  },
  {
    id: 'rl-6',
    user_id: 'user',
    achievement_name: 'Started Therapy',
    achievement_type: 'milestone',
    description: 'Started regular therapy sessions for personal growth',
    icon_name: 'brain',
    criteria_met: { type: 'personal_growth_milestone' },
    unlocked_at: twoMonthsAgo.toISOString(),
    achievement_date: twoMonthsAgo.toISOString(),
    xp_reward: 250,
    skill_xp_rewards: {},
    category: 'real_life',
    life_category: 'personal_growth',
    verified: true,
    significance_score: 0.8,
    impact_description: 'Took important step towards mental health and self-awareness',
    evidence: {
      quotes: ['"First therapy session - nervous but ready to work on myself"'],
      linked_memories: [],
      linked_characters: [],
      linked_locations: []
    },
    metadata: {},
    created_at: twoMonthsAgo.toISOString()
  },
  {
    id: 'rl-7',
    user_id: 'user',
    achievement_name: 'Visited Japan',
    achievement_type: 'milestone',
    description: 'Traveled to Japan for the first time',
    icon_name: 'calendar',
    criteria_met: { type: 'travel_milestone' },
    unlocked_at: monthAgo.toISOString(),
    achievement_date: monthAgo.toISOString(),
    xp_reward: 600,
    skill_xp_rewards: {},
    category: 'real_life',
    life_category: 'travel',
    verified: true,
    significance_score: 0.75,
    impact_description: 'Experienced a completely different culture',
    evidence: {
      quotes: ['"Tokyo was incredible - the food, the people, the energy!"'],
      linked_memories: [],
      linked_characters: [],
      linked_locations: []
    },
    metadata: {},
    created_at: monthAgo.toISOString()
  },
  {
    id: 'rl-8',
    user_id: 'user',
    achievement_name: 'Graduated University',
    achievement_type: 'milestone',
    description: 'Earned Bachelor\'s degree in Computer Science',
    icon_name: 'award',
    criteria_met: { type: 'education_milestone' },
    unlocked_at: twoMonthsAgo.toISOString(),
    achievement_date: twoMonthsAgo.toISOString(),
    xp_reward: 800,
    skill_xp_rewards: {},
    category: 'real_life',
    life_category: 'education',
    verified: true,
    significance_score: 0.9,
    impact_description: 'Completed 4 years of higher education',
    evidence: {
      quotes: ['"Walked across the stage - all that hard work finally paid off"'],
      linked_memories: [],
      linked_characters: [],
      linked_locations: []
    },
    metadata: {},
    created_at: twoMonthsAgo.toISOString()
  },
  {
    id: 'rl-9',
    user_id: 'user',
    achievement_name: 'Mended Relationship',
    achievement_type: 'milestone',
    description: 'Reconnected with estranged family member',
    icon_name: 'users',
    criteria_met: { type: 'relationship_milestone' },
    unlocked_at: weekAgo.toISOString(),
    achievement_date: weekAgo.toISOString(),
    xp_reward: 500,
    skill_xp_rewards: {},
    category: 'real_life',
    life_category: 'relationships',
    verified: true,
    significance_score: 0.85,
    impact_description: 'Healed an important relationship',
    evidence: {
      quotes: ['"Had the conversation we both needed - feels like a weight lifted"'],
      linked_memories: [],
      linked_characters: [],
      linked_locations: []
    },
    metadata: {},
    created_at: weekAgo.toISOString()
  },
  {
    id: 'rl-10',
    user_id: 'user',
    achievement_name: 'Quit Smoking',
    achievement_type: 'milestone',
    description: 'Quit smoking after 5 years',
    icon_name: 'flame',
    criteria_met: { type: 'health_milestone' },
    unlocked_at: twoWeeksAgo.toISOString(),
    achievement_date: twoWeeksAgo.toISOString(),
    xp_reward: 1000,
    skill_xp_rewards: {},
    category: 'real_life',
    life_category: 'health',
    verified: true,
    significance_score: 0.95,
    impact_description: 'Overcame addiction and improved long-term health',
    evidence: {
      quotes: ['"30 days smoke-free - hardest thing I\'ve ever done but so worth it"'],
      linked_memories: [],
      linked_characters: [],
      linked_locations: []
    },
    metadata: {},
    created_at: twoWeeksAgo.toISOString()
  }
];

// Auto-calculate rarity for all real-life achievements
export const MOCK_REAL_LIFE_ACHIEVEMENTS: RealLifeAchievement[] = REAL_LIFE_ACHIEVEMENTS_DATA.map(achievement => ({
  ...achievement,
  rarity: calculateAchievementRarity(achievement as RealLifeAchievement)
}));

// Combined achievements (for backward compatibility)
export const MOCK_ACHIEVEMENTS: Achievement[] = [
  ...MOCK_APP_ACHIEVEMENTS,
  ...MOCK_REAL_LIFE_ACHIEVEMENTS
];

export const MOCK_ACHIEVEMENT_STATISTICS: AchievementStatistics = {
  total: MOCK_ACHIEVEMENTS.length,
  byType: {
    milestone: MOCK_ACHIEVEMENTS.filter(a => a.achievement_type === 'milestone').length,
    streak: MOCK_ACHIEVEMENTS.filter(a => a.achievement_type === 'streak').length,
    xp_milestone: MOCK_ACHIEVEMENTS.filter(a => a.achievement_type === 'xp_milestone').length,
    skill_level: MOCK_ACHIEVEMENTS.filter(a => a.achievement_type === 'skill_level').length,
    consistency: MOCK_ACHIEVEMENTS.filter(a => a.achievement_type === 'consistency').length,
    exploration: MOCK_ACHIEVEMENTS.filter(a => a.achievement_type === 'exploration').length,
    reflection: MOCK_ACHIEVEMENTS.filter(a => a.achievement_type === 'reflection').length,
    growth: MOCK_ACHIEVEMENTS.filter(a => a.achievement_type === 'growth').length,
    other: MOCK_ACHIEVEMENTS.filter(a => a.achievement_type === 'other').length
  },
  byRarity: {
    common: MOCK_ACHIEVEMENTS.filter(a => a.rarity === 'common').length,
    uncommon: MOCK_ACHIEVEMENTS.filter(a => a.rarity === 'uncommon').length,
    rare: MOCK_ACHIEVEMENTS.filter(a => a.rarity === 'rare').length,
    epic: MOCK_ACHIEVEMENTS.filter(a => a.rarity === 'epic').length,
    legendary: MOCK_ACHIEVEMENTS.filter(a => a.rarity === 'legendary').length
  },
  recent: MOCK_ACHIEVEMENTS
    .filter(a => {
      const unlockedDate = new Date(a.unlocked_at);
      return Date.now() - unlockedDate.getTime() < 7 * 24 * 60 * 60 * 1000;
    })
    .slice(0, 5)
    .map(a => ({
      id: a.id,
      achievement_name: a.achievement_name,
      unlocked_at: a.unlocked_at
    }))
};

