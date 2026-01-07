import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { HeartPulse, TrendingUp, TrendingDown, AlertTriangle, Eye, HelpCircle, Brain, Activity, Filter, Sparkles, Clock, Shield, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { MetricCard } from './MetricCard';
import { ChartCard } from './ChartCard';
import { InsightCard } from './InsightCard';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';
import { useMockData, subscribeToMockDataState } from '../../contexts/MockDataContext';
import { reactionApi } from '../../api/reactions';
import { perceptionReactionEngineApi } from '../../api/perceptionReactionEngine';
import { mockDataService } from '../../services/mockDataService';
import { MOCK_REACTION_PATTERNS, MOCK_PATTERN_INSIGHTS, MOCK_STABILITY_METRICS, MOCK_RECOVERY_TIME_DATA } from '../../mocks/reactions';
import type { ReactionPatterns } from '../../types/reaction';
import type { PatternInsight, StabilityMetrics } from '../../api/perceptionReactionEngine';

/**
 * Reactions & Resilience Panel
 * 
 * Shows patterns in how you react to memories and perceptions.
 * Focuses on recovery, resilience, and therapeutic reflection.
 * 
 * Part of Discovery Hub - all insights in one place.
 */
export const ReactionsResiliencePanel: React.FC = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [patterns, setPatterns] = useState<ReactionPatterns | null>(null);
  const [insights, setInsights] = useState<PatternInsight[]>([]);
  const [stabilityMetrics, setStabilityMetrics] = useState<StabilityMetrics | null>(null);
  const [recoveryTimeData, setRecoveryTimeData] = useState<Array<{ date: string; recovery_time: number; intensity: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filter state
  const [filterType, setFilterType] = useState<'all' | 'emotional' | 'behavioral' | 'cognitive' | 'physical'>('all');
  const [filterLabel, setFilterLabel] = useState<string>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Register mock data first
      mockDataService.register.reactions(
        MOCK_REACTION_PATTERNS,
        MOCK_PATTERN_INSIGHTS,
        MOCK_STABILITY_METRICS,
        MOCK_RECOVERY_TIME_DATA
      );

      const [patternData, insightData, stabilityData] = await Promise.all([
        reactionApi.getReactionPatterns().catch(() => null),
        perceptionReactionEngineApi.getPatterns().catch(() => []),
        perceptionReactionEngineApi.getStabilityMetrics().catch(() => null)
      ]);

      // Use mock data if toggle is enabled or no real data
      if (isMockDataEnabled || !patternData || !stabilityData) {
        setPatterns(mockDataService.get.reactionPatterns() || MOCK_REACTION_PATTERNS);
        setInsights(mockDataService.get.patternInsights().length > 0 ? mockDataService.get.patternInsights() : MOCK_PATTERN_INSIGHTS);
        setStabilityMetrics(mockDataService.get.stabilityMetrics() || MOCK_STABILITY_METRICS);
        setRecoveryTimeData(mockDataService.get.recoveryTimeData().length > 0 ? mockDataService.get.recoveryTimeData() : MOCK_RECOVERY_TIME_DATA);
      } else {
        setPatterns(patternData);
        setInsights(insightData);
        setStabilityMetrics(stabilityData);
        // Generate recovery time data from insights if available
        const recoveryData = insightData
          .filter(i => i.type === 'regulation_trend' && i.data.recovery_times)
          .map((i, idx) => ({
            date: new Date(Date.now() - (30 - idx) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            recovery_time: i.data.recovery_times?.[idx] || 0,
            intensity: 0.5
          }));
        setRecoveryTimeData(recoveryData.length > 0 ? recoveryData : []);
      }
    } catch (err: any) {
      console.error('Failed to load reactions data:', err);
      setError(err.message || 'Failed to load data');
      // Use mock data on error if toggle is enabled
      if (isMockDataEnabled) {
        setPatterns(MOCK_REACTION_PATTERNS);
        setInsights(MOCK_PATTERN_INSIGHTS);
        setStabilityMetrics(MOCK_STABILITY_METRICS);
        setRecoveryTimeData(MOCK_RECOVERY_TIME_DATA);
      }
    } finally {
      setLoading(false);
    }
  }, [isMockDataEnabled]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Subscribe to mock data toggle changes
  useEffect(() => {
    const unsubscribe = subscribeToMockDataState(() => {
      void loadData();
    });
    return unsubscribe;
  }, [loadData]);

  // Filtered patterns
  const filteredPatterns = useMemo(() => {
    if (!patterns) return null;
    if (filterType === 'all' && filterLabel === 'all') return patterns;
    
    const filtered = { ...patterns };
    if (filterType !== 'all') {
      // Filter by type
      filtered.commonPatterns = patterns.commonPatterns.filter(p => {
        // Map reaction labels to types (simplified)
        const typeMap: Record<string, string> = {
          'anxiety': 'emotional', 'anger': 'emotional', 'sadness': 'emotional', 'fear': 'emotional',
          'avoidance': 'behavioral', 'withdrawal': 'behavioral', 'aggression': 'behavioral',
          'rumination': 'cognitive', 'overthinking': 'cognitive', 'catastrophizing': 'cognitive',
          'tension': 'physical', 'headache': 'physical', 'fatigue': 'physical'
        };
        return typeMap[p.reaction_label] === filterType;
      });
    }
    if (filterLabel !== 'all') {
      filtered.commonPatterns = filtered.commonPatterns.filter(p => p.reaction_label === filterLabel);
    }
    return filtered;
  }, [patterns, filterType, filterLabel]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error && !isMockDataEnabled) {
    return (
      <EmptyState
        title="Failed to Load Data"
        description={error}
      />
    );
  }

  const hasData = patterns || insights.length > 0 || stabilityMetrics;

  if (!hasData) {
    return (
      <EmptyState
        title="No Reaction Patterns Yet"
        description="Add reactions to memories and perceptions to see patterns emerge."
        icon={<Brain className="h-12 w-12 text-white/20" />}
      />
    );
  }

  // Prepare chart data
  const recoveryChartData = recoveryTimeData.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    'Recovery Time (min)': d.recovery_time,
    'Intensity': d.intensity * 100
  }));

  const reactionTypeData = patterns ? Object.entries(patterns.byType).map(([type, count]) => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    value: count,
    fill: type === 'emotional' ? '#ec4899' : type === 'behavioral' ? '#06b6d4' : type === 'cognitive' ? '#a855f7' : '#10b981'
  })) : [];

  const topReactionsData = patterns ? Object.entries(patterns.byLabel)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([label, count]) => ({
      name: label.charAt(0).toUpperCase() + label.slice(1),
      value: count,
      intensity: patterns.intensityAverages[label] || 0
    })) : [];

  return (
    <div className="space-y-6">
      {/* Enhanced Header */}
      <Card className="bg-gradient-to-r from-purple-900/30 via-pink-900/30 to-orange-900/30 border-purple-500/50 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-purple-500/30 to-pink-500/30 rounded-xl border border-purple-500/50">
                <HeartPulse className="h-7 w-7 text-purple-300" />
              </div>
              <div>
                <CardTitle className="text-2xl text-white">Reactions & Resilience</CardTitle>
                <CardDescription className="text-white/70">
                  Patterns in how you respond to experiences and beliefs. Questions, not conclusions.
                </CardDescription>
              </div>
            </div>
            {isMockDataEnabled && (
              <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/40">
                Demo Data
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Enhanced Resilience Metrics */}
      {stabilityMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Resilience Score"
            value={`${Math.round((stabilityMetrics.resilience_score || 0) * 100)}%`}
            className="bg-gradient-to-br from-green-500/20 to-emerald-500/10 border-green-500/30"
          />
          <MetricCard
            label="Avg Recovery Time"
            value={stabilityMetrics.avg_recovery_time_minutes 
              ? `${Math.floor(stabilityMetrics.avg_recovery_time_minutes / 60)}h ${stabilityMetrics.avg_recovery_time_minutes % 60}m`
              : 'N/A'}
            className="bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border-blue-500/30"
          />
          <MetricCard
            label="Recurrence Rate"
            value={`${Math.round(stabilityMetrics.recurrence_rate * 100)}%`}
            className="bg-gradient-to-br from-orange-500/20 to-amber-500/10 border-orange-500/30"
          />
          {patterns && (
            <MetricCard
              label="Total Reactions"
              value={Object.values(patterns.byType).reduce((sum, count) => sum + count, 0)}
              className="bg-gradient-to-br from-purple-500/20 to-pink-500/10 border-purple-500/30"
            />
          )}
        </div>
      )}

      {/* Recovery Time Trend Chart */}
      {recoveryTimeData.length > 0 && (
        <ChartCard
          title="Recovery Time Trend"
          description="How your recovery times have changed over time"
          chartType="line"
          data={recoveryChartData}
          xAxis="date"
          yAxis="Recovery Time (min)"
          series={['Recovery Time (min)']}
        />
      )}

      {/* Trend Indicators */}
      {stabilityMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className={`border-2 ${
            stabilityMetrics.recovery_trend === 'improving' 
              ? 'bg-green-500/10 border-green-500/40' 
              : stabilityMetrics.recovery_trend === 'declining'
              ? 'bg-red-500/10 border-red-500/40'
              : 'bg-gray-500/10 border-gray-500/40'
          }`}>
            <CardHeader>
              <div className="flex items-center gap-2">
                {stabilityMetrics.recovery_trend === 'improving' ? (
                  <TrendingUp className="h-5 w-5 text-green-400" />
                ) : stabilityMetrics.recovery_trend === 'declining' ? (
                  <TrendingDown className="h-5 w-5 text-red-400" />
                ) : (
                  <Activity className="h-5 w-5 text-gray-400" />
                )}
                <CardTitle className="text-white">Recovery Trend</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white capitalize mb-2">
                {stabilityMetrics.recovery_trend}
              </div>
              <p className="text-sm text-white/60">
                {stabilityMetrics.recovery_trend === 'improving' && 'Your recovery times are getting faster. What\'s helping?'}
                {stabilityMetrics.recovery_trend === 'declining' && 'Recovery times are increasing. What patterns do you notice?'}
                {stabilityMetrics.recovery_trend === 'stable' && 'Recovery times remain consistent.'}
              </p>
            </CardContent>
          </Card>

          <Card className={`border-2 ${
            stabilityMetrics.intensity_trend === 'decreasing' 
              ? 'bg-green-500/10 border-green-500/40' 
              : stabilityMetrics.intensity_trend === 'increasing'
              ? 'bg-red-500/10 border-red-500/40'
              : 'bg-gray-500/10 border-gray-500/40'
          }`}>
            <CardHeader>
              <div className="flex items-center gap-2">
                {stabilityMetrics.intensity_trend === 'decreasing' ? (
                  <TrendingDown className="h-5 w-5 text-green-400" />
                ) : stabilityMetrics.intensity_trend === 'increasing' ? (
                  <TrendingUp className="h-5 w-5 text-red-400" />
                ) : (
                  <Activity className="h-5 w-5 text-gray-400" />
                )}
                <CardTitle className="text-white">Intensity Trend</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white capitalize mb-2">
                {stabilityMetrics.intensity_trend}
              </div>
              <p className="text-sm text-white/60">
                {stabilityMetrics.intensity_trend === 'decreasing' && 'Reactions are becoming less intense over time.'}
                {stabilityMetrics.intensity_trend === 'increasing' && 'Reaction intensity is increasing. What do you notice?'}
                {stabilityMetrics.intensity_trend === 'stable' && 'Reaction intensity remains consistent.'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Interactive Filters */}
      {patterns && (
        <Card className="bg-black/40 border-border/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-primary" />
              <CardTitle className="text-white">Filters</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-white/70">Type:</span>
                {(['all', 'emotional', 'behavioral', 'cognitive', 'physical'] as const).map((type) => (
                  <Button
                    key={type}
                    variant={filterType === type ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilterType(type)}
                    className={filterType === type ? '' : 'text-white/60 hover:text-white'}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pattern Insights - Enhanced Cards */}
      {insights.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-400" />
            Pattern Insights
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map((insight, idx) => {
              const insightTypeColors: Record<string, { bg: string; border: string; icon: string }> = {
                'perception_reaction_loop': { bg: 'bg-purple-500/10', border: 'border-purple-500/30', icon: 'text-purple-400' },
                'false_alarm': { bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: 'text-orange-400' },
                'regulation_trend': { bg: 'bg-green-500/10', border: 'border-green-500/30', icon: 'text-green-400' },
                'recovery_pattern': { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: 'text-blue-400' },
                'belief_impact': { bg: 'bg-pink-500/10', border: 'border-pink-500/30', icon: 'text-pink-400' }
              };
              const colors = insightTypeColors[insight.type] || { bg: 'bg-gray-500/10', border: 'border-gray-500/30', icon: 'text-gray-400' };
              
              return (
                <Card key={idx} className={`${colors.bg} ${colors.border} border-2`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className={`h-4 w-4 ${colors.icon}`} />
                          <Badge variant="outline" className="text-xs">
                            {insight.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {Math.round(insight.confidence * 100)}% confidence
                          </Badge>
                        </div>
                        <CardTitle className="text-white text-base mb-2">{insight.description}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-blue-300 font-medium italic mb-3">
                      {insight.question}
                    </p>
                    {insight.data.avg_intensity && (
                      <div className="text-xs text-white/50">
                        Avg intensity: {Math.round(insight.data.avg_intensity * 100)}%
                      </div>
                    )}
                    {insight.data.recovery_times && (
                      <div className="text-xs text-white/50 mt-1">
                        Recovery times: {insight.data.recovery_times.join(', ')} minutes
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Reaction Distribution Charts */}
      {patterns && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reactionTypeData.length > 0 && (
            <ChartCard
              title="Reaction Types"
              description="Distribution of reaction types"
              chartType="pie"
              data={reactionTypeData}
            />
          )}
          {topReactionsData.length > 0 && (
            <ChartCard
              title="Top Reactions"
              description="Most common reaction labels"
              chartType="bar"
              data={topReactionsData}
              xAxis="name"
              yAxis="value"
              series={['value']}
            />
          )}
        </div>
      )}

      {/* Enhanced Common Patterns */}
      {filteredPatterns && filteredPatterns.commonPatterns.length > 0 && (
        <Card className="bg-black/40 border-border/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <CardTitle className="text-white">Common Patterns</CardTitle>
            </div>
            <CardDescription className="text-white/60">
              These patterns appear frequently. What do you notice?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPatterns.commonPatterns.map((pattern, idx) => {
                const intensityColor = pattern.avg_intensity > 0.7 
                  ? 'text-red-400' 
                  : pattern.avg_intensity > 0.5 
                  ? 'text-orange-400' 
                  : 'text-yellow-400';
                
                return (
                  <Card key={idx} className="bg-black/60 border-border/50">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-xs">
                              {pattern.trigger_type === 'memory' ? 'Memory' : 'Perception'}
                            </Badge>
                            <span className="text-sm font-semibold text-white capitalize">
                              → {pattern.reaction_label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-white/60">
                            <span>{pattern.count} {pattern.count === 1 ? 'time' : 'times'}</span>
                            {pattern.avg_intensity > 0 && (
                              <span className={intensityColor}>
                                Avg intensity: {Math.round(pattern.avg_intensity * 100)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-white/60 italic">
                        {pattern.trigger_type === 'memory' ? (
                          <>This reaction appears when you experience something. Does this feel accurate?</>
                        ) : (
                          <>This reaction appears when you believe or hear something. What do you notice about this pattern?</>
                        )}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Questions to Consider */}
      <Card className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-purple-400" />
            <CardTitle className="text-white">Questions to Consider</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-white/80 space-y-2">
            {insights.length > 0 && (
              <p>• {insights[0].question}</p>
            )}
            {stabilityMetrics && stabilityMetrics.recovery_trend === 'improving' && (
              <p>• Your recovery times are improving. What's changed?</p>
            )}
            {stabilityMetrics && stabilityMetrics.recurrence_rate > 0.5 && (
              <p>• Some reactions recur. What patterns do you notice?</p>
            )}
            {patterns && patterns.commonPatterns.length > 0 && (
              <p>
                • This perception triggered {patterns.commonPatterns[0].reaction_label} {patterns.commonPatterns[0].count} times. 
                Does that feel accurate?
              </p>
            )}
            <p>• How have your coping responses changed over time? What do you notice?</p>
            <p>• Are there patterns you'd like to explore further?</p>
            <p className="text-xs text-white/50 italic mt-3 pt-3 border-t border-purple-500/20">
              Remember: These are patterns, not diagnoses. Your reactions are valid responses, not character flaws.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
