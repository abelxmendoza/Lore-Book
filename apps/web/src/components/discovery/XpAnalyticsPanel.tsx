import React, { useState, useEffect } from 'react';
import { Zap, TrendingUp, Flame, Target, Award, Calendar, Activity, Trophy, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { MetricCard } from './MetricCard';
import { ChartCard } from './ChartCard';
import { InsightCard } from './InsightCard';
import { AISummaryCard } from './AISummaryCard';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';
import { useAnalytics } from '../../hooks/useAnalytics';
import { getModuleByKey } from '../../config/analyticsModules';
import { skillsApi } from '../../api/skills';
import type { Skill } from '../../types/skill';

export const XpAnalyticsPanel = () => {
  const analyticsModule = getModuleByKey('xp');
  const { data, loading, error } = useAnalytics('xp');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);

  useEffect(() => {
    void loadSkills();
  }, []);

  const loadSkills = async () => {
    setSkillsLoading(true);
    try {
      const skillsData = await skillsApi.getSkills({ active_only: true }).catch(() => []);
      setSkills(skillsData);
    } catch (err) {
      console.error('Failed to load skills:', err);
    } finally {
      setSkillsLoading(false);
    }
  };

  if (!analyticsModule) {
    return (
      <EmptyState
        title="Module Not Found"
        description="The XP analytics module does not exist."
      />
    );
  }

  if (loading) {
    return <LoadingSkeleton />;
  }

  // Mock data for demonstration
  const mockData = {
    metrics: {
      currentLevel: 5,
      totalXP: 1250,
      dailyXP: 42.5,
      xpToNextLevel: 150,
      streak: 12,
      breakdown: {
        'work': 350,
        'relationships': 280,
        'health': 200,
        'hobbies': 180,
        'travel': 150,
        'learning': 90
      }
    },
    charts: [
      {
        type: 'pie',
        title: 'XP by Domain',
        data: [
          { domain: 'work', value: 350, percentage: 28 },
          { domain: 'relationships', value: 280, percentage: 22.4 },
          { domain: 'health', value: 200, percentage: 16 },
          { domain: 'hobbies', value: 180, percentage: 14.4 },
          { domain: 'travel', value: 150, percentage: 12 },
          { domain: 'learning', value: 90, percentage: 7.2 }
        ]
      },
      {
        type: 'line',
        title: 'Daily XP Over Time',
        data: [
          { date: '2024-01-01', xp: 35 },
          { date: '2024-01-02', xp: 42 },
          { date: '2024-01-03', xp: 38 },
          { date: '2024-01-04', xp: 50 },
          { date: '2024-01-05', xp: 45 },
          { date: '2024-01-06', xp: 40 },
          { date: '2024-01-07', xp: 48 }
        ],
        xAxis: 'date',
        yAxis: 'xp'
      }
    ],
    insights: [
      {
        text: "You're at Level 5 with 1250 total XP. 75% progress to Level 6.",
        category: 'level',
        score: 0.75
      },
      {
        text: 'Current writing streak: 12 days. Keep it up!',
        category: 'streak',
        score: 0.4
      },
      {
        text: 'Your top life domain is "work" with 350 XP (28% of total).',
        category: 'domain',
        score: 0.28
      }
    ],
    summary: "You're at Level 5 with 1250 total XP. You're earning 42.5 XP per day on average. Your most active domain is \"work\" (28% of XP). 150 XP needed to reach Level 6."
  };

  const displayData = data || mockData;
  const displaySkills = skills.length > 0 ? skills : [
    { id: '1', user_id: 'user', skill_name: 'Python Programming', skill_category: 'technical' as const, current_level: 5, total_xp: 450, xp_to_next_level: 50, description: null, first_mentioned_at: new Date().toISOString(), last_practiced_at: new Date().toISOString(), practice_count: 12, auto_detected: true, confidence_score: 0.8, is_active: true, metadata: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: '2', user_id: 'user', skill_name: 'Guitar Playing', skill_category: 'creative' as const, current_level: 3, total_xp: 180, xp_to_next_level: 70, description: null, first_mentioned_at: new Date().toISOString(), last_practiced_at: new Date().toISOString(), practice_count: 8, auto_detected: true, confidence_score: 0.7, is_active: true, metadata: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: '3', user_id: 'user', skill_name: 'Public Speaking', skill_category: 'professional' as const, current_level: 4, total_xp: 320, xp_to_next_level: 80, description: null, first_mentioned_at: new Date().toISOString(), last_practiced_at: new Date().toISOString(), practice_count: 15, auto_detected: true, confidence_score: 0.9, is_active: true, metadata: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  ] as Skill[];

  return <XpDashboardContent data={displayData} skills={displaySkills} skillsLoading={skillsLoading} />;
};

interface XpDashboardContentProps {
  data: any;
  skills: Skill[];
  skillsLoading: boolean;
}

const XpDashboardContent: React.FC<XpDashboardContentProps> = ({ data, skills, skillsLoading }) => {
  const metrics = data.metrics || {};
  const currentLevel = metrics.currentLevel || 1;
  const totalXP = metrics.totalXP || 0;
  const dailyXP = metrics.dailyXP || 0;
  const xpToNextLevel = metrics.xpToNextLevel || 100;
  const streak = metrics.streak || 0;
  const breakdown = metrics.breakdown || {};

  // Calculate level progress
  const currentLevelXP = 100 * Math.pow(2, currentLevel - 1);
  const nextLevelXP = 100 * Math.pow(2, currentLevel);
  const xpInCurrentLevel = totalXP - currentLevelXP;
  const xpNeededForLevel = nextLevelXP - currentLevelXP;
  const levelProgress = Math.min(100, (xpInCurrentLevel / xpNeededForLevel) * 100);

  // Get breakdown entries sorted by XP
  const breakdownEntries = Object.entries(breakdown)
    .map(([domain, xp]) => ({ domain, xp: xp as number }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10);

  const totalBreakdownXP = breakdownEntries.reduce((sum, entry) => sum + entry.xp, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-yellow-900/30 to-orange-900/30 border-yellow-500/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <Zap className="h-6 w-6 text-yellow-400" />
            </div>
            <div>
              <CardTitle className="text-2xl text-white">XP Dashboard</CardTitle>
              <CardDescription className="text-white/70">
                Your life experience points, levels, and growth journey
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Level & Progress Section */}
      <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-yellow-500/20 rounded-lg">
                <Trophy className="h-8 w-8 text-yellow-400" />
              </div>
              <div>
                <CardTitle className="text-3xl text-white">Level {currentLevel}</CardTitle>
                <CardDescription className="text-white/70">
                  {totalXP.toLocaleString()} Total XP
                </CardDescription>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-white/60 mb-1">XP to Next Level</div>
              <div className="text-2xl font-bold text-yellow-400">{xpToNextLevel}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-white/70">
              <span>Progress to Level {currentLevel + 1}</span>
              <span>{levelProgress.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-black/40 rounded-full h-4 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 transition-all duration-500 ease-out"
                style={{ width: `${levelProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-white/50">
              <span>{currentLevelXP.toLocaleString()} XP</span>
              <span>{nextLevelXP.toLocaleString()} XP</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Key Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total XP"
            value={totalXP.toLocaleString()}
          />
          <MetricCard
            label="Daily Average"
            value={dailyXP.toFixed(1)}
          />
          <MetricCard
            label="Current Level"
            value={currentLevel}
          />
          <MetricCard
            label="Writing Streak"
            value={`${streak} day${streak !== 1 ? 's' : ''}`}
          />
        </div>
      </div>

      {/* Skills Section */}
      {!skillsLoading && skills.length > 0 && (
        <Card className="bg-blue-500/10 border-blue-500/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-blue-400" />
              <CardTitle className="text-white">Your Skills</CardTitle>
            </div>
            <CardDescription className="text-white/60">
              Skills tracked from your journal entries. Auto-detected and leveled up as you practice.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {skills.slice(0, 9).map((skill) => {
                const skillProgress = skill.xp_to_next_level > 0 
                  ? ((skill.total_xp - (100 * Math.pow(1.5, skill.current_level - 2))) / skill.xp_to_next_level) * 100 
                  : 100;
                return (
                  <div key={skill.id} className="bg-black/40 border border-blue-500/30 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-white">{skill.skill_name}</span>
                          {skill.auto_detected && (
                            <Badge variant="outline" className="text-xs">Auto</Badge>
                          )}
                        </div>
                        <div className="text-xs text-white/50 capitalize">{skill.skill_category}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-blue-400">Lv {skill.current_level}</div>
                        <div className="text-xs text-white/50">{skill.total_xp} XP</div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-white/60 mb-1">
                        <span>Progress to Lv {skill.current_level + 1}</span>
                        <span>{Math.round(skillProgress)}%</span>
                      </div>
                      <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500/60 to-cyan-500/60 transition-all duration-500"
                          style={{ width: `${Math.min(100, skillProgress)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-xs text-white/40 mt-2">
                      {skill.practice_count} practice{skill.practice_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                );
              })}
            </div>
            {skills.length > 9 && (
              <div className="text-center mt-4 text-sm text-white/60">
                +{skills.length - 9} more skills
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Streak Card */}
      {streak > 0 && (
        <Card className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border-orange-500/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Flame className="h-5 w-5 text-orange-400" />
              </div>
              <CardTitle className="text-white">Current Streak</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold text-orange-400">{streak}</div>
              <div className="flex-1">
                <div className="text-white font-medium mb-1">
                  {streak} day{streak !== 1 ? 's' : ''} in a row!
                </div>
                <div className="text-sm text-white/60">
                  {streak >= 7 ? '🔥 Amazing streak! Keep it going!' : 'Keep writing daily to maintain your streak!'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* XP Breakdown by Domain */}
      {breakdownEntries.length > 0 && (
        <Card className="bg-black/40 border-border/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <CardTitle className="text-white">XP by Life Domain</CardTitle>
            </div>
            <CardDescription className="text-white/60">
              Where you're earning the most experience
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {breakdownEntries.map((entry, idx) => {
                const percentage = totalBreakdownXP > 0 ? (entry.xp / totalBreakdownXP) * 100 : 0;
                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white capitalize">{entry.domain}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-white/50">{percentage.toFixed(1)}%</span>
                        <span className="text-sm text-white/70 font-semibold">{entry.xp.toLocaleString()} XP</span>
                      </div>
                    </div>
                    <div className="w-full bg-black/60 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-yellow-500/60 to-orange-500/60 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Section */}
      {data.charts && Array.isArray(data.charts) && data.charts.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Visualizations</h3>
          <div className="space-y-6">
            {data.charts.map((chart: any, index: number) => (
              <ChartCard
                key={chart.id || index}
                title={chart.title || 'Chart'}
                chartType={chart.type || 'line'}
                data={Array.isArray(chart.data) ? chart.data : []}
                description={chart.description}
                xAxis={chart.xAxis}
                yAxis={chart.yAxis}
                series={Array.isArray(chart.series) ? chart.series : []}
              />
            ))}
          </div>
        </div>
      )}

      {/* Insights Section */}
      {data.insights && Array.isArray(data.insights) && data.insights.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Insights</h3>
          <div className="space-y-3">
            {data.insights.map((insight: any, index: number) => {
              const insightText = typeof insight === 'string' ? insight : insight.text;
              const insightCategory = typeof insight === 'object' ? insight.category : undefined;
              const insightScore = typeof insight === 'object' ? insight.score : undefined;

              return (
                <InsightCard
                  key={index}
                  body={insightText}
                  category={insightCategory}
                  score={insightScore}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* AI Summary */}
      {data.summary && (
        <AISummaryCard summary={data.summary} />
      )}

      {/* Milestones Card */}
      <Card className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-purple-400" />
            <CardTitle className="text-white">Level Milestones</CardTitle>
          </div>
          <CardDescription className="text-white/60">
            Level up milestones and achievements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 5, 10, 20, 30, 50, 100].map((level) => {
              const levelXP = 100 * Math.pow(2, level - 1);
              const isUnlocked = currentLevel >= level;
              return (
                <div
                  key={level}
                  className={`p-4 rounded-lg border text-center transition-all ${
                    isUnlocked
                      ? 'bg-purple-500/20 border-purple-500/40'
                      : 'bg-black/40 border-white/10 opacity-50'
                  }`}
                >
                  <div className={`text-2xl font-bold mb-1 ${isUnlocked ? 'text-purple-400' : 'text-white/40'}`}>
                    {isUnlocked ? '✓' : level}
                  </div>
                  <div className="text-xs text-white/60">Level {level}</div>
                  <div className="text-xs text-white/40 mt-1">{levelXP.toLocaleString()} XP</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
