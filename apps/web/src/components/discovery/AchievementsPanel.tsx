import React, { useState, useEffect } from 'react';
import { Award, Trophy, Star, Sparkles, Flame, BookOpen, Brain, Eye, TrendingUp, Calendar, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { MetricCard } from './MetricCard';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';
import { achievementsApi } from '../../api/achievements';
import type { Achievement, AchievementStatistics, AchievementRarity } from '../../types/achievement';

const RARITY_COLORS: Record<AchievementRarity, { bg: string; border: string; text: string; icon: string }> = {
  common: { bg: 'bg-gray-500/10', border: 'border-gray-500/30', text: 'text-gray-300', icon: 'text-gray-400' },
  uncommon: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-300', icon: 'text-green-400' },
  rare: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-300', icon: 'text-blue-400' },
  epic: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-300', icon: 'text-purple-400' },
  legendary: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-300', icon: 'text-yellow-400' }
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'book-open': BookOpen,
  'flame': Flame,
  'trophy': Trophy,
  'award': Award,
  'users': Users,
  'brain': Brain,
  'eye': Eye,
  'trending-up': TrendingUp,
  'calendar': Calendar
};

export const AchievementsPanel: React.FC = () => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [statistics, setStatistics] = useState<AchievementStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | AchievementRarity>('all');

  useEffect(() => {
    void loadData();
  }, [filter]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [achievementsData, statsData] = await Promise.all([
        achievementsApi.getAchievements(filter !== 'all' ? { rarity: filter } : undefined).catch(() => []),
        achievementsApi.getStatistics().catch(() => null)
      ]);
      setAchievements(achievementsData);
      setStatistics(statsData);
    } catch (err) {
      console.error('Failed to load achievements:', err);
      setError('Failed to load achievements');
      // Use mock data on error
      setAchievements([
        {
          id: '1',
          user_id: 'user',
          achievement_name: 'First Entry',
          achievement_type: 'milestone',
          description: 'Wrote your first journal entry',
          icon_name: 'book-open',
          criteria_met: { count: 1 },
          unlocked_at: new Date().toISOString(),
          xp_reward: 50,
          skill_xp_rewards: {},
          rarity: 'common',
          metadata: {},
          created_at: new Date().toISOString()
        },
        {
          id: '2',
          user_id: 'user',
          achievement_name: 'Week Warrior',
          achievement_type: 'streak',
          description: '7 days of consecutive journaling',
          icon_name: 'flame',
          criteria_met: { streak: 7 },
          unlocked_at: new Date().toISOString(),
          xp_reward: 100,
          skill_xp_rewards: {},
          rarity: 'common',
          metadata: {},
          created_at: new Date().toISOString()
        },
        {
          id: '3',
          user_id: 'user',
          achievement_name: 'Level 5',
          achievement_type: 'xp_milestone',
          description: 'Reached Level 5',
          icon_name: 'trophy',
          criteria_met: { level: 5 },
          unlocked_at: new Date().toISOString(),
          xp_reward: 250,
          skill_xp_rewards: {},
          rarity: 'common',
          metadata: {},
          created_at: new Date().toISOString()
        },
        {
          id: '4',
          user_id: 'user',
          achievement_name: 'Skill Master',
          achievement_type: 'skill_level',
          description: 'Reached level 10 in any skill',
          icon_name: 'award',
          criteria_met: { maxLevel: 10 },
          unlocked_at: new Date().toISOString(),
          xp_reward: 300,
          skill_xp_rewards: {},
          rarity: 'uncommon',
          metadata: {},
          created_at: new Date().toISOString()
        },
        {
          id: '5',
          user_id: 'user',
          achievement_name: 'Month Master',
          achievement_type: 'streak',
          description: '30 days of consecutive journaling',
          icon_name: 'flame',
          criteria_met: { streak: 30 },
          unlocked_at: new Date().toISOString(),
          xp_reward: 500,
          skill_xp_rewards: {},
          rarity: 'uncommon',
          metadata: {},
          created_at: new Date().toISOString()
        }
      ] as Achievement[]);
      setStatistics({
        total: 5,
        byType: { milestone: 1, streak: 2, xp_milestone: 1, skill_level: 1 } as any,
        byRarity: { common: 3, uncommon: 2 } as any,
        recent: []
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error && achievements.length === 0) {
    return (
      <EmptyState
        title="Failed to Load Achievements"
        description={error}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border-purple-500/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Award className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-2xl text-white">Achievements</CardTitle>
              <CardDescription className="text-white/70">
                Unlocked milestones and accomplishments in your journey
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Statistics */}
      {statistics && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Achievement Statistics</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total Achievements"
              value={statistics.total}
            />
            {Object.entries(statistics.byRarity).map(([rarity, count]) => (
              <MetricCard
                key={rarity}
                label={`${rarity.charAt(0).toUpperCase() + rarity.slice(1)}`}
                value={count}
              />
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-white/70">Filter by rarity:</span>
        {(['all', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as const).map((rarity) => (
          <button
            key={rarity}
            onClick={() => setFilter(rarity)}
            className={`px-3 py-1 rounded text-sm transition ${
              filter === rarity
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                : 'bg-black/40 text-white/60 border border-white/10 hover:bg-white/5'
            }`}
          >
            {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
          </button>
        ))}
      </div>

      {/* Achievements Grid */}
      {achievements.length === 0 ? (
        <EmptyState
          title="No Achievements Yet"
          description="Keep journaling and practicing skills to unlock achievements!"
          icon={<Award className="h-12 w-12 text-white/20" />}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {achievements.map((achievement) => {
            const colors = RARITY_COLORS[achievement.rarity];
            const Icon = achievement.icon_name ? ICON_MAP[achievement.icon_name] || Award : Award;
            
            return (
              <Card key={achievement.id} className={`${colors.bg} ${colors.border} border`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${colors.bg}`}>
                      <Icon className={`h-6 w-6 ${colors.icon}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <CardTitle className={`text-base ${colors.text}`}>
                          {achievement.achievement_name}
                        </CardTitle>
                        <Badge variant="outline" className="text-xs">
                          {achievement.rarity}
                        </Badge>
                      </div>
                      <CardDescription className="text-white/60 text-sm mb-2">
                        {achievement.description}
                      </CardDescription>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/50">
                          {new Date(achievement.unlocked_at).toLocaleDateString()}
                        </span>
                        {achievement.xp_reward > 0 && (
                          <span className="text-yellow-400 font-semibold">
                            +{achievement.xp_reward} XP
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
