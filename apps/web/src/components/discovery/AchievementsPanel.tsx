import React, { useState, useEffect, useCallback } from 'react';
import { Award, Trophy, Star, Sparkles, Flame, BookOpen, Brain, Eye, TrendingUp, Calendar, Users, Zap, Crown, Gem, Smartphone, Heart, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { MetricCard } from './MetricCard';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';
import { useMockData } from '../../contexts/MockDataContext';
import { achievementsApi } from '../../api/achievements';
import { mockDataService } from '../../services/mockDataService';
import { MOCK_ACHIEVEMENTS, MOCK_APP_ACHIEVEMENTS, MOCK_REAL_LIFE_ACHIEVEMENTS, MOCK_ACHIEVEMENT_STATISTICS } from '../../mocks/achievements';
import type { Achievement, AchievementStatistics, AchievementRarity, AchievementCategory } from '../../types/achievement';
import { CreateRealLifeAchievementDialog } from './achievements/CreateRealLifeAchievementDialog';

const RARITY_COLORS: Record<AchievementRarity, { 
  bg: string; 
  border: string; 
  text: string; 
  icon: string;
  gradient: string;
  glow: string;
  iconBg: string;
}> = {
  common: { 
    bg: 'bg-gray-500/10', 
    border: 'border-gray-500/30', 
    text: 'text-gray-300', 
    icon: 'text-gray-400',
    gradient: 'from-gray-500/20 to-gray-600/10',
    glow: 'shadow-gray-500/20',
    iconBg: 'bg-gray-500/20'
  },
  uncommon: { 
    bg: 'bg-green-500/10', 
    border: 'border-green-500/30', 
    text: 'text-green-300', 
    icon: 'text-green-400',
    gradient: 'from-green-500/20 to-emerald-600/10',
    glow: 'shadow-green-500/20',
    iconBg: 'bg-green-500/20'
  },
  rare: { 
    bg: 'bg-blue-500/10', 
    border: 'border-blue-500/30', 
    text: 'text-blue-300', 
    icon: 'text-blue-400',
    gradient: 'from-blue-500/20 to-cyan-600/10',
    glow: 'shadow-blue-500/20',
    iconBg: 'bg-blue-500/20'
  },
  epic: { 
    bg: 'bg-purple-500/10', 
    border: 'border-purple-500/30', 
    text: 'text-purple-300', 
    icon: 'text-purple-400',
    gradient: 'from-purple-500/20 to-pink-600/10',
    glow: 'shadow-purple-500/30',
    iconBg: 'bg-purple-500/20'
  },
  legendary: { 
    bg: 'bg-yellow-500/10', 
    border: 'border-yellow-500/30', 
    text: 'text-yellow-300', 
    icon: 'text-yellow-400',
    gradient: 'from-yellow-500/30 via-orange-500/20 to-amber-600/10',
    glow: 'shadow-yellow-500/40',
    iconBg: 'bg-gradient-to-br from-yellow-500/30 to-orange-500/20'
  }
};

const RARITY_ICONS: Record<AchievementRarity, React.ComponentType<{ className?: string }>> = {
  common: Star,
  uncommon: Award,
  rare: Trophy,
  epic: Gem,
  legendary: Crown
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

const AchievementCard: React.FC<{ achievement: Achievement & Record<string, any> }> = ({ achievement }) => {
  const colors = RARITY_COLORS[achievement.rarity];
  const Icon = achievement.icon_name ? ICON_MAP[achievement.icon_name] || Award : Award;
  const RarityIcon = RARITY_ICONS[achievement.rarity];
  const displayDate = achievement.achievement_date
    ? new Date(achievement.achievement_date)
    : new Date(achievement.unlocked_at);
  const isRecent = Date.now() - new Date(achievement.unlocked_at).getTime() < 7 * 24 * 60 * 60 * 1000;
  const isLegendary = achievement.rarity === 'legendary';

  return (
    <Card
      className={`group relative overflow-hidden flex flex-col border-2 transition-all duration-300 ${colors.bg} ${colors.border} hover:shadow-xl ${isLegendary ? `shadow-lg ${colors.glow}` : ''}`}
    >
      {/* Base gradient — always on for legendary, hover-only for others */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${colors.gradient} transition-opacity duration-300 ${isLegendary ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      />
      {/* Legendary shimmer pulse */}
      {isLegendary && (
        <div className="absolute inset-0 bg-gradient-to-tr from-yellow-400/[0.07] via-transparent to-orange-300/[0.07] animate-pulse pointer-events-none" />
      )}

      {/* "New" badge */}
      {isRecent && (
        <div className="absolute top-2 left-2 z-10">
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5 py-0.5 animate-pulse">
            <Sparkles className="h-2.5 w-2.5 mr-1" />
            New
          </Badge>
        </div>
      )}
      {/* Verified badge */}
      {achievement.verified && (
        <div className="absolute top-2 right-2 z-10">
          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0.5">
            ✓ Verified
          </Badge>
        </div>
      )}

      <CardContent className="p-4 relative z-10 flex-1 flex flex-col gap-3">
        {/* Icon + title */}
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl flex-shrink-0 ${colors.iconBg} border ${colors.border} group-hover:scale-110 transition-transform duration-300`}>
            <Icon className={`h-6 w-6 sm:h-7 sm:w-7 ${colors.icon}`} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <CardTitle className={`text-sm sm:text-base font-bold ${colors.text} leading-tight mb-1`}>
              {achievement.achievement_name}
            </CardTitle>
            <CardDescription className="text-white/60 text-xs sm:text-sm leading-relaxed line-clamp-3">
              {achievement.description}
            </CardDescription>
          </div>
        </div>

        {/* Real-life extras */}
        {achievement.life_category && (
          <Badge variant="outline" className="self-start text-[10px] bg-pink-500/10 text-pink-400 border-pink-500/30">
            {(achievement.life_category as string).replace('_', ' ')}
          </Badge>
        )}
        {achievement.impact_description && (
          <p className="text-[10px] sm:text-xs text-white/50 italic line-clamp-2 -mt-1">
            {achievement.impact_description}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 pt-2 mt-auto">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-white/50">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            <span>{displayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
          {achievement.xp_reward > 0 && (
            <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/30 rounded-md px-2 py-0.5">
              <Zap className="h-3 w-3 text-yellow-400" />
              <span className="text-yellow-400 font-bold text-[10px] sm:text-xs">+{achievement.xp_reward}</span>
            </div>
          )}
        </div>
      </CardContent>

      {/* Rarity ribbon */}
      <div className={`relative z-10 flex items-center justify-center gap-2 py-1.5 border-t ${colors.border} ${colors.iconBg}`}>
        <RarityIcon className={`h-3 w-3 ${colors.icon}`} />
        <span className={`text-[10px] font-bold tracking-widest uppercase ${colors.text}`}>
          {achievement.rarity}
        </span>
        <RarityIcon className={`h-3 w-3 ${colors.icon}`} />
      </div>
    </Card>
  );
};

export const AchievementsPanel: React.FC = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [statistics, setStatistics] = useState<AchievementStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | AchievementRarity>('all');
  const [realLifeFilter, setRealLifeFilter] = useState<'all' | 'career' | 'education' | 'health' | 'relationships' | 'creative' | 'financial' | 'personal_growth' | 'travel' | 'hobby' | 'other' | 'verified'>('all');
  const [activeTab, setActiveTab] = useState<AchievementCategory>('app_usage');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Register mock data first
      mockDataService.register.achievements(MOCK_ACHIEVEMENTS, MOCK_ACHIEVEMENT_STATISTICS);

      // Build filters based on active tab
      const fetchFilters: any = {};
      if (activeTab === 'app_usage') {
        fetchFilters.category = 'app_usage';
        if (filter !== 'all') {
          fetchFilters.rarity = filter;
        }
      } else {
        fetchFilters.category = 'real_life';
        if (realLifeFilter !== 'all') {
          if (realLifeFilter === 'verified') {
            fetchFilters.verified = true;
          } else {
            fetchFilters.life_category = realLifeFilter;
          }
        }
      }

      // Try to fetch real data with category filtering
      const [achievementsData, statsData] = await Promise.all([
        achievementsApi.getAchievements(Object.keys(fetchFilters).length > 0 ? fetchFilters : undefined).catch(() => []),
        achievementsApi.getStatistics().catch(() => null)
      ]);

      // Use mock data if toggle is enabled or no real data
      if (isMockDataEnabled || (!achievementsData || achievementsData.length === 0)) {
        // Get mock achievements based on category
        const allMockAchievements = mockDataService.get.achievements();
        const categoryAchievements = activeTab === 'app_usage' 
          ? MOCK_APP_ACHIEVEMENTS 
          : MOCK_REAL_LIFE_ACHIEVEMENTS;
        
        const mockStats = mockDataService.get.achievementStatistics();
        
        // Filter by category and rarity/filter
        let filteredAchievements = categoryAchievements;
        if (activeTab === 'app_usage') {
          if (filter !== 'all') {
            filteredAchievements = filteredAchievements.filter(a => a.rarity === filter);
          }
        } else {
          // Real life achievements: filter by life category or verification
          if (realLifeFilter !== 'all') {
            if (realLifeFilter === 'verified') {
              filteredAchievements = filteredAchievements.filter(a => (a as any).verified === true);
            } else {
              filteredAchievements = filteredAchievements.filter(a => (a as any).life_category === realLifeFilter);
            }
          }
        }

        setAchievements(filteredAchievements);
        setStatistics(mockStats);
        setError(null);
      } else {
        // Filter real data by category and filter
        let categoryFiltered = achievementsData.filter(a => 
          (a.category || 'app_usage') === activeTab
        );
        
        // Apply additional filters
        if (activeTab === 'app_usage') {
          if (filter !== 'all') {
            categoryFiltered = categoryFiltered.filter(a => a.rarity === filter);
          }
        } else {
          // Real life achievements: filter by life category or verification
          if (realLifeFilter !== 'all') {
            if (realLifeFilter === 'verified') {
              categoryFiltered = categoryFiltered.filter(a => (a as any).verified === true);
            } else {
              categoryFiltered = categoryFiltered.filter(a => (a as any).life_category === realLifeFilter);
            }
          }
        }
        
        setAchievements(categoryFiltered);
      setStatistics(statsData);
      }
    } catch (err) {
      console.error('Failed to load achievements:', err);
      // Fallback to mock data if toggle is enabled
      if (isMockDataEnabled) {
        setError(null);
        const categoryAchievements = activeTab === 'app_usage' 
          ? MOCK_APP_ACHIEVEMENTS 
          : MOCK_REAL_LIFE_ACHIEVEMENTS;
        const mockStats = mockDataService.get.achievementStatistics();
        
        let filteredAchievements = categoryAchievements;
        if (activeTab === 'app_usage') {
          if (filter !== 'all') {
            filteredAchievements = filteredAchievements.filter(a => a.rarity === filter);
          }
        } else {
          // Real life achievements: filter by life category or verification
          if (realLifeFilter !== 'all') {
            if (realLifeFilter === 'verified') {
              filteredAchievements = filteredAchievements.filter(a => (a as any).verified === true);
            } else {
              filteredAchievements = filteredAchievements.filter(a => (a as any).life_category === realLifeFilter);
            }
          }
        }

        setAchievements(filteredAchievements);
        setStatistics(mockStats);
      } else {
        setError('Failed to load achievements');
        setAchievements([]);
        setStatistics(null);
      }
    } finally {
      setLoading(false);
    }
  }, [filter, realLifeFilter, isMockDataEnabled, activeTab]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Achievement Statistics</h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">
                {activeTab === 'app_usage' 
                  ? achievements.filter(a => (a.category || 'app_usage') === 'app_usage').length
                  : achievements.filter(a => a.category === 'real_life').length
                } {activeTab === 'app_usage' ? 'App' : 'Real Life'}
              </Badge>
              <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30">
                {statistics.total} Total
              </Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard
              label="Total"
              value={activeTab === 'app_usage' 
                ? achievements.filter(a => (a.category || 'app_usage') === 'app_usage').length
                : achievements.filter(a => a.category === 'real_life').length
              }
              className="bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-purple-500/30"
            />
            {(['common', 'uncommon', 'rare', 'epic', 'legendary'] as AchievementRarity[]).map((rarity) => {
              const count = achievements.filter(a => {
                const matchesCategory = activeTab === 'app_usage' 
                  ? (a.category || 'app_usage') === 'app_usage'
                  : a.category === 'real_life';
                return matchesCategory && a.rarity === rarity;
              }).length;
              const colors = RARITY_COLORS[rarity];
              return (
              <MetricCard
                key={rarity}
                  label={rarity.charAt(0).toUpperCase() + rarity.slice(1)}
                value={count}
                  className={`${colors.bg} ${colors.border} border`}
              />
              );
            })}
          </div>
        </div>
      )}

      {/* Category Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AchievementCategory)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto bg-black/40 border border-border/50 p-1 rounded-lg">
          <TabsTrigger 
            value="app_usage" 
            className="flex items-center gap-2 text-white/70 data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400 data-[state=active]:shadow-none"
          >
            <Smartphone className="h-4 w-4" />
            App Usage
          </TabsTrigger>
          <TabsTrigger 
            value="real_life" 
            className="flex items-center gap-2 text-white/70 data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-400 data-[state=active]:shadow-none"
          >
            <Heart className="h-4 w-4" />
            Real Life
          </TabsTrigger>
        </TabsList>

        <TabsContent value="app_usage" className="mt-6">
          {/* Filter — single scrollable row */}
          <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-none pb-1">
            <span className="text-sm font-medium text-white/70 flex-shrink-0">Filter:</span>
            {(['all', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as const).map((rarity) => {
              const rarityColors = rarity !== 'all' ? RARITY_COLORS[rarity] : null;
              return (
                <button
                  type="button"
                  key={rarity}
                  onClick={() => setFilter(rarity)}
                  className={`flex-shrink-0 whitespace-nowrap px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${
                    filter === rarity
                      ? rarity === 'all'
                        ? 'bg-purple-500/20 text-purple-400 border-2 border-purple-500/40 shadow-lg shadow-purple-500/20'
                        : `bg-gradient-to-r ${rarityColors?.gradient} ${rarityColors?.text} border-2 ${rarityColors?.border} shadow-lg ${rarityColors?.glow}`
                      : 'bg-black/40 text-white/60 border border-white/10 hover:bg-white/5 hover:border-white/20'
                  }`}
                >
                  {rarity === 'all' ? 'All' : rarity.charAt(0).toUpperCase() + rarity.slice(1)}
                </button>
              );
            })}
          </div>

          {achievements.length === 0 ? (
            <EmptyState
              title="No App Achievements Yet"
              description="Keep using the app to unlock achievements!"
              icon={<Award className="h-12 w-12 text-white/20" />}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {achievements.map((achievement) => (
                <AchievementCard key={achievement.id} achievement={achievement} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="real_life" className="mt-6">
          {/* Add button + scrollable filter */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 flex-1">
              <span className="text-sm font-medium text-white/70 flex-shrink-0">Filter:</span>
              {([
                'all', 'career', 'education', 'health', 'relationships',
                'creative', 'financial', 'personal_growth', 'travel', 'hobby', 'verified',
              ] as const).map((filterValue) => {
                const isActive = realLifeFilter === filterValue;
                const getFilterLabel = (val: string) => {
                  if (val === 'all') return 'All';
                  if (val === 'verified') return '✓ Verified';
                  return val.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                };
                return (
                  <button
                    type="button"
                    key={filterValue}
                    onClick={() => setRealLifeFilter(filterValue)}
                    className={`flex-shrink-0 whitespace-nowrap px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? filterValue === 'verified'
                          ? 'bg-blue-500/20 text-blue-400 border-2 border-blue-500/40 shadow-lg shadow-blue-500/20'
                          : 'bg-pink-500/20 text-pink-400 border-2 border-pink-500/40 shadow-lg shadow-pink-500/20'
                        : 'bg-black/40 text-white/60 border border-white/10 hover:bg-white/5 hover:border-white/20'
                    }`}
                  >
                    {getFilterLabel(filterValue)}
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              onClick={() => setShowCreateDialog(true)}
              className="bg-pink-500/20 text-pink-400 border border-pink-500/40 hover:bg-pink-500/30 flex-shrink-0 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Achievement
            </Button>
          </div>

          {achievements.length === 0 ? (
            <EmptyState
              title="No Real Life Achievements Yet"
              description="Your life accomplishments will appear here as you document them"
              icon={<Heart className="h-12 w-12 text-white/20" />}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {achievements.map((achievement) => (
                <AchievementCard key={achievement.id} achievement={achievement} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Real-Life Achievement Dialog */}
      <CreateRealLifeAchievementDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={() => {
          setShowCreateDialog(false);
          void loadData();
        }}
      />
    </div>
  );
};
